# Stage 1: Build the frontend
FROM node:20-alpine AS client-build
WORKDIR /app
COPY package.json package-lock.json ./
COPY client/package.json client/
COPY server/package.json server/
RUN npm ci --workspace=client
COPY client/ client/
RUN npm run build --workspace=client

# Stage 2: Build the server
FROM node:20-alpine AS server-build
WORKDIR /app
COPY package.json package-lock.json ./
COPY tsconfig.base.json ./
COPY client/package.json client/
COPY server/package.json server/
RUN npm ci --workspace=server
COPY server/ server/
COPY shared/ shared/
RUN npm run build --workspace=server

# Stage 3: Production runtime with Chromium
FROM node:20-slim AS production

# Install Chromium and fonts
RUN apt-get update && apt-get install -y \
    chromium \
    fonts-ipafont-gothic \
    fonts-wqy-zenhei \
    fonts-thai-tlwg \
    fonts-khmeros \
    fonts-freefont-ttf \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

WORKDIR /app

# Copy server build and production dependencies
COPY --from=server-build /app/package.json /app/package-lock.json ./
COPY --from=server-build /app/server/package.json server/
COPY --from=server-build /app/client/package.json client/
RUN npm ci --workspace=server --omit=dev

COPY --from=server-build /app/server/dist server/dist/

# Copy frontend build
COPY --from=client-build /app/client/dist client/dist/

ENV NODE_ENV=production
ENV PORT=3001

EXPOSE 3001

WORKDIR /app/server
CMD ["node", "dist/index.js"]
