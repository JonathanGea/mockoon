FROM node:20-alpine

RUN npm install -g @mockoon/cli

WORKDIR /app

COPY data/mockoon-tempate.json ./data/mockoon-tempate.json

EXPOSE 3000

CMD ["sh", "-c", "mockoon-cli start --data data/mockoon-tempate.json --port ${PORT:-3000}"]