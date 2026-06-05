#!/usr/bin/env bash
# Compile app.jsx -> app.js (production). Run after editing app.jsx.
set -euo pipefail
cd "$(dirname "$0")"
npx --yes esbuild app.jsx --jsx=transform --minify --target=es2018 --outfile=app.js
echo "Built app.js"
