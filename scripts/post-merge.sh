#!/usr/bin/env bash
set -euo pipefail

# Keep merged task changes usable immediately: dependencies, database schema,
# then a production compilation that catches cross-task integration errors.
npm install --no-audit --no-fund
npm run db:push -- --force
npm run build