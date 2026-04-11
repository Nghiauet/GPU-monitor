# --- Build stage: compile React frontend ---
FROM node:20-alpine AS builder

WORKDIR /app/client
COPY client/package.json client/package-lock.json* ./
RUN npm install

COPY client/ ./
RUN npm run build

# --- Production stage ---
FROM node:20-slim

RUN apt-get update && \
    apt-get install -y --no-install-recommends openssh-client bash gawk && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install server dependencies
COPY server/package.json server/package-lock.json* ./server/
RUN cd server && npm install --omit=dev

# Copy server source
COPY server/src/ ./server/src/

# Copy built frontend
COPY --from=builder /app/client/dist ./client/dist/

# Copy collector and entrypoint scripts
COPY collect.sh ./
COPY entrypoint.sh ./
RUN chmod +x entrypoint.sh

# Default config (overridden by volume mount)
COPY config.json ./

# Create directories for persistent data
RUN mkdir -p /app/logs /data

ENV NODE_ENV=production
ENV PORT=3001

EXPOSE 3001

ENTRYPOINT ["/app/entrypoint.sh"]
CMD ["node", "server/src/index.js"]
