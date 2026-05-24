# syntax=docker/dockerfile:1.7

FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN apk add --no-cache python3 make g++  && npm ci --no-audit --no-fund  && apk del python3 make g++

FROM node:22-alpine AS runtime
WORKDIR /app
ENV PORT=3810
ENV NODE_ENV=production
ENV DATA_DIR=/data

COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY src ./src
COPY public ./public

# Stamp cabinet.html version + bump all ?v=... cache-busters every build.
ARG CACHE_BUST=auto
COPY scripts ./scripts
COPY .eslintrc.json* ./

# Run a small build script that does the cache-bust (handles escaping cleaner).
RUN cat > /tmp/bust.sh <<'BUSTEOF'
#!/bin/sh
set -e
BUILDV=cab_$(date +%Y%m%d_%H%M%S)
sed -i "s/cab_VERSION_PLACEHOLDER/${BUILDV}/g" public/site/cabinet.html
find public/site -maxdepth 4 -type f \( -name '*.html' -o -name '*.htm' \) -print0 |   xargs -0 sed -i -E "s~(\.(js|css|png|jpg|svg|webp|ico|woff2?))\?v=[^\"']+~\1?v=${BUILDV}~g"
echo "[stamp] BUILDV=${BUILDV} — cabinet.html + asset ?v= rewritten"
BUSTEOF
RUN sh /tmp/bust.sh

RUN if [ -f .eslintrc.json ] && [ -d node_modules/eslint ]; then       ./node_modules/.bin/eslint --no-eslintrc -c .eslintrc.json --rule '{"no-undef":"error"}' src/ads.js       || (echo "❌ ESLint no-undef errors found — refusing to build" && exit 1);     fi

RUN apk add --no-cache ffmpeg yt-dlp     chromium nss freetype harfbuzz ca-certificates ttf-freefont font-noto-emoji     dumb-init
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

RUN mkdir -p /data && chown -R node:node /data /app
USER node
VOLUME ["/data"]
EXPOSE 3810

HEALTHCHECK --interval=30s --timeout=4s --start-period=20s --retries=3   CMD wget -qO- http://localhost:3810/health || exit 1

CMD ["node", "src/server.js"]
