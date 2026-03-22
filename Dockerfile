# ARIA — Fly.io deployment
# Node.js 20 Alpine for minimal image size
FROM node:20-alpine

# tzdata for reliable cron timezone (7am/8pm Pacific)
RUN apk add --no-cache tzdata

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install ALL dependencies (including devDependencies for build)
RUN npm ci

# Copy source
COPY . .

# Build frontend + server
RUN npm run build

# Remove devDependencies for smaller image
RUN npm prune --production

# Create /data for persistent volume (SQLite)
RUN mkdir -p /data

# Fly.io uses PORT env (default 8080)
EXPOSE 8080

# Run compiled server; DATA_DIR=/data for persistent volume
# TZ required for node-cron: briefings at 7am/8pm Pacific
ENV DATA_DIR=/data
ENV NODE_ENV=production
ENV TZ=America/Los_Angeles

CMD ["node", "dist-server/server/index.js"]
