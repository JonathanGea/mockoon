FROM node:20-alpine

RUN npm install -g @mockoon/cli

WORKDIR /app

COPY data/marketplace.json ./data/marketplace.json

EXPOSE 3000

CMD ["sh", "-c", "mockoon-cli start --data data/marketplace.json --port ${PORT:-3000}"]