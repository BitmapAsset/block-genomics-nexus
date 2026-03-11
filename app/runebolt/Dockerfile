FROM node:20-alpine AS base

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --production=false

COPY tsconfig.json ./
COPY src/ ./src/

# Development target
FROM base AS development
CMD ["npm", "run", "dev"]

# Build stage
FROM base AS build
RUN npm run build

# Production target
FROM node:20-alpine AS production

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --production && npm cache clean --force

COPY --from=build /app/dist ./dist

ENV NODE_ENV=production

EXPOSE 3000

USER node

CMD ["node", "dist/api/server.js"]
