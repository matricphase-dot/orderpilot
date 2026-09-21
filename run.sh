#!/usr/bin/env bash
# OrderPilot — one-command dev launcher (API :4000 + web app :5173)
set -e
cd "$(dirname "$0")"

[ -d server/node_modules ] || (cd server && npm install --no-audit --no-fund)
[ -d client/node_modules ] || (cd client && npm install --no-audit --no-fund)
[ -f server/data/orderpilot.db ] || (cd server && npm run seed)

cleanup() { kill 0 2>/dev/null; }
trap cleanup EXIT

(cd server && npm start) &
sleep 1
(cd client && npm run dev) &
wait
