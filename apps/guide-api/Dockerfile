# This dependency baseline contains the compiled native SQLite driver.
# Update it only when package.json or package-lock.json changes runtime dependencies.
ARG DEPENDENCY_IMAGE=614626370/kkflow-guide-api:v1.0.2
FROM ${DEPENDENCY_IMAGE} AS dependencies

FROM node:22-bookworm-slim

ENV NODE_ENV=production \
    GUIDE_API_HOST=0.0.0.0 \
    GUIDE_API_PORT=8787 \
    GUIDE_API_DB_PATH=/data/guide-api.sqlite

WORKDIR /app

COPY package.json package-lock.json ./
COPY --from=dependencies /app/node_modules ./node_modules
COPY apps/guide-api/src ./apps/guide-api/src

EXPOSE 8787
VOLUME ["/data"]

CMD ["node", "apps/guide-api/src/server.js"]
