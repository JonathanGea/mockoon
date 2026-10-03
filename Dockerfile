FROM node:22-alpine

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund

COPY scripts ./scripts
COPY data ./data

EXPOSE 3000
CMD ["node", "scripts/start.mjs"]
