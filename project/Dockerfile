# Stage 1: Build the frontend
FROM node:20-alpine AS client-build
ARG GIT_COMMIT=unknown
ENV VITE_GIT_COMMIT=$GIT_COMMIT
WORKDIR /app
COPY package.json package-lock.json ./
COPY client/package.json client/
COPY server/package.json server/
RUN npm ci --workspace=client
COPY client/ client/
RUN npm run build --workspace=client

# Stage 2: Build the server (ohne better-sqlite3 – Production nutzt MariaDB)
FROM node:20-alpine AS server-build
WORKDIR /app
COPY package.json package-lock.json ./
COPY tsconfig.base.json ./
COPY client/package.json client/
COPY server/package.json server/
RUN npm ci --workspace=server --omit=optional
COPY server/ server/
RUN npm run build --workspace=server

# Stage 3: Production runtime with Chromium and Scrapling
FROM node:20-slim AS production
# Verknüpft das ghcr-Package mit dem Repo (erscheint dort unter "Packages")
LABEL org.opencontainers.image.source="https://github.com/JoernAdobe/TechStackCrawler"

ARG GIT_COMMIT=unknown
ENV GIT_COMMIT=$GIT_COMMIT

# Install Python, Chromium und Fonts for Scrapling.
RUN apt-get update && apt-get install -y \
    python3 \
    python3-venv \
    chromium \
    fonts-ipafont-gothic \
    fonts-wqy-zenhei \
    fonts-thai-tlwg \
    fonts-khmeros \
    fonts-freefont-ttf \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

ENV SCRAPLING_CHROMIUM_PATH=/usr/bin/chromium
ENV SCRAPLING_PYTHON_PATH=/opt/scrapling-venv/bin/python

WORKDIR /app

COPY server/requirements.txt /app/server/requirements.txt
RUN python3 -m venv /opt/scrapling-venv \
    && /opt/scrapling-venv/bin/pip install --no-cache-dir -r /app/server/requirements.txt

# Copy server build and production dependencies
COPY --from=server-build /app/package.json /app/package-lock.json ./
COPY --from=server-build /app/server/package.json server/
COPY --from=server-build /app/client/package.json client/
RUN npm ci --workspace=server --omit=dev --omit=optional

COPY --from=server-build /app/server/dist server/dist/
COPY server/python/ server/python/

# Copy frontend build
COPY --from=client-build /app/client/dist client/dist/

ENV NODE_ENV=production
ENV PORT=3001

# Nicht als root laufen lassen (node-Image bringt den User "node" bereits mit).
RUN chown -R node:node /app
USER node

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3001/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

WORKDIR /app/server
CMD ["node", "dist/index.js"]
