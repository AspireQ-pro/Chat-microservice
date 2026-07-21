FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

# Vite reads env vars at BUILD time not runtime
# These are passed from docker-compose as build args
ARG VITE_CHAT_API_URL=http://localhost:5000
ARG VITE_CHAT_API_KEY=your-api-key-here

ENV VITE_CHAT_API_URL=$VITE_CHAT_API_URL
ENV VITE_CHAT_API_KEY=$VITE_CHAT_API_KEY

RUN npm run build

EXPOSE 3001

CMD ["npx", "vite", "preview", "--host", "--port", "3001"]
