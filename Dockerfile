# ── Production Dockerfile for Google Cloud Run ──
FROM node:22-slim AS builder

WORKDIR /app

# Copy dependency manifests
COPY package*.json ./

# Install all dependencies (including devDependencies required for vite build and esbuild)
RUN npm install --legacy-peer-deps

# Copy application source code and audio files
COPY . .

# Build client bundle (dist/client) and bundled server (dist/server.cjs)
RUN npm run build

# Prune dev dependencies for lean runtime image
FROM node:22-slim AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0

COPY package*.json ./
RUN npm install --omit=dev --legacy-peer-deps

# Copy build artifacts and assets from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/server.ts ./server.ts
COPY --from=builder /app/src ./src
COPY --from=builder /app/public ./public
COPY --from=builder /app/Audio_files ./Audio_files
COPY --from=builder /app/audio ./audio
COPY --from=builder /app/data ./data
COPY --from=builder /app/africastalking.ts ./africastalking.ts

EXPOSE 3000

CMD ["node", "server.ts"]
