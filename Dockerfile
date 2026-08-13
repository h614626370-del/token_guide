# syntax=docker/dockerfile:1.7

FROM node:22-bookworm-slim AS build

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
# Keep npm's download cache outside the image so repeated releases do not
# download unchanged packages again.
RUN --mount=type=cache,id=sub2api-guide-npm,target=/root/.npm \
    npm ci --prefer-offline --no-audit --fund=false

COPY nuxt.config.ts content.config.ts tsconfig.json ./
COPY app ./app
COPY shared ./shared
COPY content ./content
COPY public ./public
COPY homeApps ./homeApps
COPY server ./server
COPY scripts ./scripts
COPY deploy ./deploy

RUN npm run build && npm prune --omit=dev

FROM node:22-bookworm-slim AS runtime

ARG APP_VERSION=2.2.20

LABEL org.opencontainers.image.version=$APP_VERSION

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    NUXT_DATABASE_PATH=/data/guide.sqlite \
    NUXT_APP_VERSION=$APP_VERSION

WORKDIR /app

RUN mkdir -p /data && chown node:node /data

COPY --from=build --chown=node:node /app/.output ./.output
COPY --from=build --chown=node:node /app/node_modules ./node_modules
# 后台「指南内容」需要读取默认 Markdown 源文件
COPY --from=build --chown=node:node /app/content ./content
COPY --from=build --chown=node:node /app/scripts ./scripts
COPY --from=build --chown=node:node /app/deploy ./deploy
COPY --from=build --chown=node:node /app/homeApps ./homeApps

USER node
EXPOSE 3000
VOLUME ["/data"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

CMD ["node", ".output/server/index.mjs"]
