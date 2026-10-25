# Hugging Face Space (Docker SDK). Builds Opener from the public GitHub repo, then runs it
# the same way as the main Dockerfile, on the port Spaces expects (7860).

FROM node:22-bookworm-slim AS build
RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates \
 && rm -rf /var/lib/apt/lists/*
ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /app
ARG OPENER_REPO=https://github.com/softalpha0/Opener.git
ARG OPENER_REF=main
RUN git clone --depth 1 --branch "$OPENER_REF" "$OPENER_REPO" .
RUN npm ci && npm run build && npm prune --omit=dev

FROM node:22-bookworm-slim
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=7860 \
    QLOO_BASE_URL=https://hackathon.api.qloo.com \
    QLOO_TRUSTED_BASE_URL=https://hackathon.api.qloo.com \
    OPENER_CACHE_DIR=/app/.cache \
    OPENER_WARM_ON_START=true

RUN npm install --global @qloo/qloo-harness@latest \
 && qloo --version \
 && npm cache clean --force

WORKDIR /app
COPY --from=build --chown=node:node /app/package.json /app/next.config.mjs ./
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/.next ./.next
COPY --from=build --chown=node:node /app/public ./public
COPY --from=build --chown=node:node /app/data ./data
RUN mkdir -p /app/.cache && chown node:node /app/.cache

# Spaces run the container as uid 1000, which is the image's `node` user.
USER node
EXPOSE 7860
CMD ["npm", "start"]
