import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { log } from "../log";
import { TtlCache, cacheDir, cacheTtlMs, type CacheStats } from "./cache";
import { asArray, asRecord, errorEnvelope, isCacheable, normalizeEnvelope } from "./envelope";
import { scrubString } from "./redact";
import { cacheKey } from "./stable";
import type { QlooEnvelope, ToolArgs, ToolDescriptor } from "./types";

export const HACKATHON_BASE_URL = "https://hackathon.api.qloo.com";
const INSTALL_HINT =
  "Cannot start `qloo`. Install it with: npm install --global @qloo/qloo-harness";
const CALL_TIMEOUT_MS = 30_000;
const MAX_RETRIES = 2;

/** The slice of the MCP SDK client that Opener uses; lets tests inject a fake server. */
export interface McpConnection {
  listTools(): Promise<{
    tools: Array<{ name: string; description?: string; inputSchema: unknown }>;
  }>;
  callTool(
    params: { name: string; arguments?: Record<string, unknown> },
    resultSchema?: undefined,
    options?: { timeout?: number },
  ): Promise<unknown>;
  close(): Promise<void>;
  onclose?: (() => void) | undefined;
}

export type Connector = () => Promise<McpConnection>;

export interface CallOutcome {
  envelope: QlooEnvelope;
  cached: boolean;
  fetchedAt: string;
  attempts: number;
}

/** Environment for the `qloo mcp` child: the full process env plus hackathon defaults. */
export function qlooEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env))
    if (typeof value === "string") env[key] = value;
  env.QLOO_BASE_URL ||= HACKATHON_BASE_URL;
  env.QLOO_TRUSTED_BASE_URL ||= HACKATHON_BASE_URL;
  return env;
}

/** Default connector: spawn `qloo mcp` over stdio, forwarding env so QLOO_API_KEY reaches it. */
export const stdioConnector: Connector = async () => {
  const transport = new StdioClientTransport({
    command: "qloo",
    args: ["mcp"],
    env: qlooEnv(),
    stderr: "pipe",
  });
  transport.stderr?.on("data", (chunk: Buffer) => {
    const text = chunk.toString("utf8").trim();
    if (text) log("warn", `qloo mcp stderr: ${scrubString(text)}`);
  });
  const client = new Client({ name: "opener", version: "1.0.0" });
  try {
    await client.connect(transport);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    throw code === "ENOENT" ? new Error(INSTALL_HINT) : error;
  }
  return client as unknown as McpConnection;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * One long-lived `qloo mcp` process per server, with lazy connect, respawn on exit,
 * a 24h result cache keyed by (tool, normalized args) and bounded retries.
 */
export class QlooService {
  private connection: Promise<McpConnection> | null = null;
  private tools: ToolDescriptor[] | null = null;
  private respawns = 0;
  private closing = false;
  readonly cache: TtlCache<QlooEnvelope>;

  constructor(
    private readonly connector: Connector = stdioConnector,
    cache?: TtlCache<QlooEnvelope>,
    private readonly backoffMs = 500,
  ) {
    this.cache =
      cache ??
      new TtlCache<QlooEnvelope>({
        namespace: "qloo-tools",
        ttlMs: cacheTtlMs(),
        maxEntries: 1000,
        dir: cacheDir(),
      });
  }

  private connect(): Promise<McpConnection> {
    if (!this.connection) {
      const attempt = this.connector().then((client) => {
        client.onclose = () => {
          if (!this.closing)
            log("warn", "qloo mcp connection closed; it will respawn on the next call");
          if (this.connection === attempt) this.connection = null;
        };
        return client;
      });
      attempt.catch(() => {
        if (this.connection === attempt) this.connection = null;
      });
      this.connection = attempt;
    }
    return this.connection;
  }

  private async reset(): Promise<void> {
    const current = this.connection;
    this.connection = null;
    this.respawns++;
    if (current) {
      try {
        await (await current).close();
      } catch {
        // already gone
      }
    }
  }

  async listTools(): Promise<ToolDescriptor[]> {
    if (this.tools) return this.tools;
    const client = await this.connect();
    const { tools } = await client.listTools();
    this.tools = tools.map((tool) => ({
      name: tool.name,
      description: tool.description ?? "",
      inputSchema: asRecord(tool.inputSchema) ?? { type: "object" },
    }));
    return this.tools;
  }

  /** Call a tool once over MCP, respawning the server once if the transport died. */
  private async callOnce(name: string, args: ToolArgs): Promise<QlooEnvelope> {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const client = await this.connect();
        const raw = await client.callTool({ name, arguments: stripUndefined(args) }, undefined, {
          timeout: CALL_TIMEOUT_MS,
        });
        return normalizeEnvelope(raw);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (message === INSTALL_HINT) {
          return errorEnvelope(
            "QLOO_NOT_INSTALLED",
            "The Qloo harness is not installed on this server.",
            false,
            INSTALL_HINT,
          );
        }
        const timeout = /timed? ?out/i.test(message);
        log("warn", "qloo mcp call failed", { tool: name, error: message, attempt });
        if (attempt === 0 && !timeout) {
          await this.reset();
          continue;
        }
        return errorEnvelope(
          timeout ? "TIMEOUT" : "TRANSPORT",
          timeout
            ? "Qloo took too long to answer."
            : "Lost the connection to the Qloo tool server.",
          true,
          "Try again in a moment.",
        );
      }
    }
    return errorEnvelope("TRANSPORT", "Lost the connection to the Qloo tool server.", true);
  }

  /** Cached, retried tool call. Retries only when `error.retryable` is true, at most twice. */
  async call(
    name: string,
    args: ToolArgs,
    options: { bypassCache?: boolean } = {},
  ): Promise<CallOutcome> {
    const key = cacheKey(name, args);
    if (!options.bypassCache) {
      const hit = this.cache.get(key);
      if (hit) {
        return {
          envelope: hit.value,
          cached: true,
          fetchedAt: new Date(hit.storedAt).toISOString(),
          attempts: 0,
        };
      }
    }
    let envelope = await this.callOnce(name, args);
    let attempts = 1;
    while (envelope.status === "error" && envelope.error?.retryable && attempts <= MAX_RETRIES) {
      await sleep(this.backoffMs * 3 ** (attempts - 1));
      envelope = await this.callOnce(name, args);
      attempts++;
    }
    const fetchedAt = new Date().toISOString();
    if (isCacheable(envelope)) this.cache.set(key, envelope);
    return { envelope, cached: false, fetchedAt, attempts };
  }

  /** Readiness via qloo_capabilities (makes no Qloo request). */
  async readiness(): Promise<{ qloo: "ready" | "missing"; tools: number; error?: string }> {
    try {
      const tools = await this.listTools();
      const client = await this.connect();
      const raw = asRecord(
        await client.callTool({ name: "qloo_capabilities", arguments: {} }, undefined, {
          timeout: 10_000,
        }),
      );
      const adapter = asRecord(asRecord(raw?.structuredContent)?.adapter);
      const ready = adapter?.ready === true || asArray(adapter?.supported_operation_ids).length > 0;
      return { qloo: ready ? "ready" : "missing", tools: tools.length };
    } catch (error) {
      return {
        qloo: "missing",
        tools: 0,
        error: error instanceof Error ? scrubString(error.message) : "unavailable",
      };
    }
  }

  stats(): CacheStats & { respawns: number } {
    return { ...this.cache.stats(), respawns: this.respawns };
  }

  async close(): Promise<void> {
    const current = this.connection;
    this.connection = null;
    this.closing = true;
    try {
      if (current) await (await current).close().catch(() => undefined);
    } finally {
      this.closing = false;
    }
  }
}

function stripUndefined(args: ToolArgs): Record<string, unknown> {
  return Object.fromEntries(Object.entries(args).filter(([, v]) => v !== undefined));
}

let versionPromise: Promise<string> | null = null;
/** `qloo --version`, cached for the life of the process. */
export function harnessVersion(): Promise<string> {
  versionPromise ??= promisify(execFile)("qloo", ["--version"], {
    timeout: 10_000,
    env: qlooEnv() as NodeJS.ProcessEnv,
  })
    .then(({ stdout }) => stdout.trim().split(/\s+/).pop() ?? "unknown")
    .catch(() => "not installed");
  return versionPromise;
}

const globalForQloo = globalThis as unknown as { __openerQloo?: QlooService };

/** Process-wide singleton so Next.js route modules share one `qloo mcp` child. */
export function getQloo(): QlooService {
  globalForQloo.__openerQloo ??= new QlooService();
  return globalForQloo.__openerQloo;
}
