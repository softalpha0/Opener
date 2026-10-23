#!/usr/bin/env node
// Start `qloo mcp`, list its tools and save every inputSchema to docs/qloo-tool-schemas.json.
// Usage: npm run inspect-tools   (needs the harness installed; no Qloo request is made)
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "docs", "qloo-tool-schemas.json");
const env = { ...process.env };
env.QLOO_BASE_URL ||= "https://hackathon.api.qloo.com";
env.QLOO_TRUSTED_BASE_URL ||= "https://hackathon.api.qloo.com";

const client = new Client({ name: "opener-inspect-tools", version: "1.0.0" });
try {
  await client.connect(new StdioClientTransport({ command: "qloo", args: ["mcp"], env }));
} catch (error) {
  console.error(
    error.code === "ENOENT"
      ? "Cannot start `qloo`. Install it with: npm install --global @qloo/qloo-harness"
      : error.message,
  );
  process.exit(1);
}

try {
  const { tools } = await client.listTools();
  const capabilities = await client.callTool({ name: "qloo_capabilities", arguments: {} });
  const adapter = capabilities.structuredContent?.adapter ?? {};
  const doc = {
    generatedAt: new Date().toISOString(),
    contractVersion: capabilities.structuredContent?.contract_version,
    contractChecksum: capabilities.structuredContent?.contract_checksum,
    tools: tools.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
      outputSchema: t.outputSchema,
    })),
  };
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, `${JSON.stringify(doc, null, 2)}\n`);

  console.log(`qloo mcp: ${tools.length} tools, credential ${adapter.ready ? "ready" : "missing"}`);
  for (const tool of tools) {
    const schema = tool.inputSchema ?? {};
    const required = new Set(schema.required ?? []);
    const props = Object.entries(schema.properties ?? {}).map(([name, p]) => {
      const type = p.enum
        ? `enum(${p.enum.length})`
        : p.type === "array"
          ? `${p.items?.type ?? "any"}[]`
          : p.type;
      return `${name}${required.has(name) ? "*" : ""}:${type}`;
    });
    console.log(`  ${tool.name.padEnd(28)} ${props.join(", ") || "(no inputs)"}`);
  }
  console.log(`Saved ${out} (* = required)`);
} finally {
  await client.close();
}
