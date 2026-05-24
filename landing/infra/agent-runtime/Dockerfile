# Golden Connect hosted ElizaOS runtime.
#
# Thin wrapper around the upstream ElizaOS CLI. One image per hosted
# agent (built by the deploy pipeline with the right character.json
# and plugin set baked in).
#
# Upstream reference: https://github.com/elizaOS/eliza
# Plugin registry:    https://github.com/elizaos-plugins/registry
#
# Official images are also published to ghcr.io/elizaos/eliza — if
# we want to skip the build step we can pull those instead and
# mount character.json at runtime. For the MVP we bake it in so
# each agent is fully self-contained.

FROM node:20-alpine

# OS deps that a lot of ElizaOS plugins transitively need
# (node-gyp targets, native bindings). Kept small; drop if we
# confirm none of the enabled plugins pull native modules.
RUN apk add --no-cache \
        python3 \
        make \
        g++ \
        git \
        ca-certificates \
    && update-ca-certificates

WORKDIR /app

# Copy the character + the generated package.json (the deploy
# pipeline writes both before `docker build`). The package.json
# lists `@elizaos/cli` plus the exact plugin set the user picked.
COPY package.json ./
COPY character.json /app/character.json

# Install CLI + plugins. If a specific release of @elizaos/cli is
# not yet on npm, swap for `github:elizaOS/eliza` in package.json.
RUN npm install --omit=dev --no-audit --no-fund

ENV NODE_ENV=production
ENV ELIZA_CHARACTER=/app/character.json

# Non-root for defence in depth. node:alpine ships the `node` user.
RUN chown -R node:node /app
USER node

EXPOSE 3000

# The CLI reads plugins from the character file and secrets from
# the environment (injected by the k8s Secret — see
# infra/k8s/agent-namespace.template.yaml).
CMD ["npx", "elizaos", "start", "--character=/app/character.json"]
