# --- Stage 1: Build React frontend ---
FROM node:20-alpine AS client-builder

WORKDIR /app/client
COPY client/package.json client/package-lock.json* ./
RUN npm ci
COPY client/ ./
RUN npm run build

# --- Stage 2: Install server deps (native modules need build tools on Alpine) ---
FROM node:20-alpine AS server-deps

RUN apk add --no-cache python3 make g++
WORKDIR /app/server
COPY server/package.json server/package-lock.json* ./
RUN npm ci --omit=dev && rm -rf /root/.npm

# --- Stage 3: Production image ---
FROM node:20-alpine

RUN apk add --no-cache openssh-client bash gawk

WORKDIR /app

# Server dependencies (with pre-compiled native modules)
COPY --from=server-deps /app/server/node_modules ./server/node_modules/
COPY server/package.json ./server/
COPY server/src/ ./server/src/

# Built frontend
COPY --from=client-builder /app/client/dist ./client/dist/

# Collector and entrypoint
COPY collect.sh entrypoint.sh ./
RUN chmod +x entrypoint.sh collect.sh

# Default config (overridden by volume mount)
COPY config.json ./

RUN mkdir -p /app/logs /data

ENV NODE_ENV=production
ENV PORT=3001

EXPOSE 3001

ENTRYPOINT ["/app/entrypoint.sh"]
CMD ["node", "server/src/index.js"]
