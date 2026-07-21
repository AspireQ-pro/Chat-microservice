FROM node:20-alpine

WORKDIR /app

# Install all deps (including devDeps for prisma CLI + tsx)
COPY package*.json ./
RUN npm install

# Copy prisma schema and config
COPY prisma/ ./prisma/
COPY prisma.config.ts ./

# Generate prisma client
RUN npx prisma generate

# Copy rest of source
COPY . .

EXPOSE 5000

# Run migrations then start server
CMD ["sh", "-c", "npx prisma migrate deploy && node index.js"]
