# syntax=docker/dockerfile:1.7

## ─── Build stage: compile the Vite SPA ───────────────────────
FROM node:22-alpine AS build
WORKDIR /app
# Vite bakes `VITE_*` envs into the bundle at build time — must be
# passed as a build-arg from CI (or baked with a prod default).
ARG VITE_API_URL=https://api.trendex.biz
ENV VITE_API_URL=$VITE_API_URL
COPY package.json package-lock.json* ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

## ─── Runtime: nginx serves static dist/ with SPA fallback ────
FROM nginx:alpine AS runtime
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
