FROM node:20-alpine

# Install Mockoon CLI
RUN npm install -g @mockoon/cli

WORKDIR /app

# Copy Mockoon environment
COPY data/mockoon-tempate.json ./data/mockoon-tempate.json

# Railway provides PORT; default to 3000 locally
EXPOSE 3000

CMD ["sh", "-c", "mockoon-cli start --data data/mockoon-tempate.json --port ${PORT:-3000}"]

as