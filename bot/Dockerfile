FROM node:22-alpine AS builder
WORKDIR /app
RUN apk add --no-cache python3 make g++
COPY package.json package-lock.json* ./
RUN npm install --no-audit --no-fund
COPY tsconfig.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev

FROM node:22-alpine AS runtime
RUN apk add --no-cache tini && \
    addgroup -S app && adduser -S app -G app && \
    mkdir -p /data && chown -R app:app /data
WORKDIR /app
COPY --from=builder --chown=app:app /app/node_modules ./node_modules
COPY --from=builder --chown=app:app /app/dist ./dist
COPY --from=builder --chown=app:app /app/package.json ./package.json
ENV NODE_ENV=production \
    DATABASE_PATH=/data/golden-connect.db
USER app
VOLUME ["/data"]
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/index.js"]
