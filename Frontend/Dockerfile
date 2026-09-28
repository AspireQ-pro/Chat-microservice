FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

ARG VITE_API_URL=http://3.110.56.109:5000
ARG VITE_SOCKET_URL=http://3.110.56.109:5000

ENV VITE_API_URL=$VITE_API_URL
ENV VITE_SOCKET_URL=$VITE_SOCKET_URL

RUN npm run build

EXPOSE 3001

CMD ["npx", "vite", "preview", "--host", "--port", "3001"]
