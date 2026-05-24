# syntax=docker/dockerfile:1.7

FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --no-audit --no-fund

FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV PORT=4001
# Install with all deps (NODE_ENV not yet "production" so npm includes
# devDependencies) — the k8s initContainer runs `npx drizzle-kit migrate`.
COPY package.json package-lock.json* ./
RUN npm install --include=dev --no-audit --no-fund && npm cache clean --force
ENV NODE_ENV=production
COPY --from=build /app/dist ./dist
COPY --from=build /app/src/db/migrations ./src/db/migrations
COPY --from=build /app/src/db/schema.ts ./src/db/schema.ts
COPY --from=build /app/drizzle.config.ts ./drizzle.config.ts
COPY --from=build /app/tsconfig.json ./tsconfig.json
EXPOSE 4001
USER node
CMD ["node", "dist/server.js"]
