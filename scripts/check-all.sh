#!/usr/bin/env bash
# 依次检查 server / sdk / web（需要先在各目录安装依赖）。
set -euo pipefail
cd "$(dirname "$0")/.."

echo "== server =="; (cd server && ./scripts/test.sh)
echo "== sdk ==";    (cd sdk && npm run check)
echo "== web ==";    (cd web && npm run check)
echo "all checks passed"
