FROM node:24.22.3-alpine AS builder
WORKDIR /app

RUN apk add --no-cache python3 make g++
RUN npm install --global pnpm@12.21.0

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm run build && pnpm run typeorm:build && pnpm prune --prod
# Dependencies run as JavaScript; retain application maps in dist for debugging.
RUN find node_modules -type f \( -name '*.map' -o -name '*.d.ts' -o -name '*.d.cts' -o -name '*.d.mts' \) -delete

# Match the Alpine release used by the Node builder, without its package managers
# and development headers. Copy the same Node binary used to build native addons.
FROM alpine:3.24.4 AS runner
RUN apk add --no-cache libstdc++ \
    && addgroup -S -g 1000 node \
    && adduser -S -D -u 1000 -G node node
COPY --from=builder /usr/local/bin/node /usr/local/bin/node
COPY --from=builder /usr/local/LICENSE /usr/local/share/licenses/node/LICENSE
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/apps/gateway/src/orders/orders.openapi.yaml ./apps/gateway/src/orders/
COPY package.json ./

USER node

CMD ["node", "dist/apps/gateway/main.js"]
