FROM node:22-bookworm-slim

ENV NODE_ENV=production \
    GUIDE_API_HOST=0.0.0.0 \
    GUIDE_API_PORT=8787 \
    GUIDE_API_DB_PATH=/data/guide-api.sqlite

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY apps/guide-api ./apps/guide-api

EXPOSE 8787
VOLUME ["/data"]

CMD ["node", "apps/guide-api/src/server.js"]
