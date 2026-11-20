#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."

project="nestjs-e2e-$(node -p 'crypto.randomUUID()')"
export E2E_IMAGE="$project:local"
logs="test-results/e2e/$project"
mkdir -p "$logs"
exec > >(tee "$logs/run.log") 2>&1

# Use the same fixture values for host interpolation and container configuration.
set -a
source test/e2e/compose.env
set +a
compose=(docker compose -p "$project" --env-file test/e2e/compose.env
  -f docker-compose.yml -f test/e2e/compose.yaml)

cleanup() {
  result=$?
  trap - EXIT
  set +e
  if ((result != 0)); then
    "${compose[@]}" ps --all > "$logs/containers.log" 2>&1
    "${compose[@]}" logs --no-color --timestamps > "$logs/services.log" 2>&1
    echo "E2E diagnostics: $logs"
  fi
  "${compose[@]}" down --volumes --remove-orphans --timeout 5 || result=1
  if docker image inspect "$E2E_IMAGE" >/dev/null 2>&1; then
    docker image rm "$E2E_IMAGE" || result=1
  fi
  exit "$result"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

docker build --tag "$E2E_IMAGE" .
"${compose[@]}" up --detach --no-build --wait --wait-timeout 180 kafka
# A fresh broker must elect leaders before the Nest consumers subscribe.
"${compose[@]}" run --rm --no-deps -T gateway node --input-type=module <<'JS'
import kafka from 'kafkajs';
import { CART_EVENTS, ORDER_EVENTS } from './dist/typeorm/libs/domains/src/index.js';
const admin = new kafka.Kafka({ brokers: ['kafka:9092'] }).admin();
await admin.connect();
try {
  const topics = [...Object.values(CART_EVENTS), ...Object.values(ORDER_EVENTS)];
  await admin.createTopics({ waitForLeaders: true, topics: topics.map(topic => ({ topic })) });
} finally {
  await admin.disconnect();
}
JS
"${compose[@]}" up --detach --no-build --wait --wait-timeout 180 gateway
export ADMIN_EMAIL=admin@example.test ADMIN_NAME='E2E Admin'
export ADMIN_PASSWORD="$(node -p 'crypto.randomUUID()')"
"${compose[@]}" exec -T -e ADMIN_EMAIL -e ADMIN_NAME -e ADMIN_PASSWORD users \
  node dist/typeorm/apps/users/src/scripts/create-admin.cli.js
endpoint=$("${compose[@]}" port gateway 3000)
export E2E_API_URL="http://$endpoint/api/v1"
products_db=$("${compose[@]}" port products-db 5432)
export E2E_PRODUCTS_DB_URL="postgres://$PRODUCTS_DB_USERNAME:$PRODUCTS_DB_PASSWORD@$products_db/$PRODUCTS_DB_NAME"
pnpm exec vitest run --config vitest.config.e2e.ts "$@"
