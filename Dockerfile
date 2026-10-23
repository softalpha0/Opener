# Opener: one long-running Node container (qloo mcp is a stdio child process, so no serverless).

FROM node:22-bookworm-slim AS base
ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /app

# ---- build ----
FROM base AS build
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

# ---- runtime ----
FROM base AS runtime
ENV NODE_ENV=production \
    PORT=3000 \
    QLOO_BASE_URL=https://hackathon.api.qloo.com \
    QLOO_TRUSTED_BASE_URL=https://hackathon.api.qloo.com \
    OPENER_CACHE_DIR=/app/.cache

# The Qloo harness provides `qloo mcp`. Require 0.1.26 or newer.
RUN npm install --global @qloo/qloo-harness@latest \
 && qloo --version \
 && node -e "const v=require('child_process').execSync('qloo --version').toString().trim().split(/\s+/).pop().split('.').map(Number);const ok=v[0]>0||v[1]>1||(v[1]===1&&v[2]>=26);if(!ok){console.error('qloo harness must be >= 0.1.26, got '+v.join('.'));process.exit(1)}" \
 && npm cache clean --force

COPY --from=build --chown=node:node /app/package.json /app/next.config.mjs ./
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/.next ./.next
COPY --from=build --chown=node:node /app/public ./public
COPY --from=build --chown=node:node /app/data ./data
RUN mkdir -p /app/.cache && chown node:node /app/.cache

USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=10s --start-period=20s CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["npm", "start"]
