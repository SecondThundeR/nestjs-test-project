FROM node:26.3.0-alpine AS builder
WORKDIR /app

RUN apk add --no-cache python3 make g++

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:26.3.0-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/apps/gateway/src/orders/orders.openapi.yaml ./apps/gateway/src/orders/
COPY package.json ./

USER node

CMD ["node", "dist/apps/gateway/main"]
