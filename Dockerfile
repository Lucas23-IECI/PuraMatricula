# syntax=docker/dockerfile:1
FROM node:24-bookworm-slim AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

FROM node:24-bookworm-slim AS runtime
ENV NODE_ENV=production \
    MATRICULA_DATA=/data/matricula \
    MATRICULA_HOST=0.0.0.0 \
    MATRICULA_PORT=4318
WORKDIR /app
COPY --from=dependencies --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node package.json package-lock.json ./
COPY --chown=node:node src ./src
COPY --chown=node:node public ./public
COPY --chown=node:node scripts/docker-*.mjs ./scripts/
COPY --chown=node:node scripts/school-start.mjs ./scripts/
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME ["/data"]
EXPOSE 4318 4433
STOPSIGNAL SIGTERM
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 CMD ["node","scripts/docker-healthcheck.mjs","--quiet"]
CMD ["node","scripts/docker-start.mjs"]
