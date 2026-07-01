# Stage 1: Build the NestJS application
FROM node:22-alpine AS builder

# Install build dependencies for native compilation (e.g. cryptography in Baileys)
RUN apk add --no-cache python3 make g++

WORKDIR /usr/src/app

COPY package*.json ./

RUN npm ci

COPY . .

RUN npm run build

# Stage 2: Production image
FROM node:22-alpine AS production

WORKDIR /usr/src/app

ENV NODE_ENV=production

COPY package*.json ./

# Install only production dependencies
RUN npm ci --only=production

# Copy dist output from builder stage
COPY --from=builder /usr/src/app/dist ./dist

EXPOSE 3000

CMD ["node", "dist/main"]
