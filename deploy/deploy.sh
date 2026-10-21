#!/usr/bin/env bash
# Updates the live site with the latest main from GitHub. Run it ON THE SERVER, from anywhere:
#   bash ~/identee/deploy/deploy.sh
# It stops at the first error, so a broken build never replaces the working site.
set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$APP_DIR"

echo "→ 1/4  Getting the latest main from GitHub"
git checkout main
git pull --ff-only origin main

echo "→ 2/4  Backend libraries"
cd "$APP_DIR/server"
# (Chrome for the invoice PDFs separately: if its download failed inside npm ci, npm stopped half-way)
PUPPETEER_SKIP_DOWNLOAD=true npm ci --omit=dev
npx puppeteer browsers install chrome || echo "  ! Chrome for invoice PDFs didn't download — the site works; run 'npx puppeteer browsers install chrome' in server/ later"

echo "→ 3/4  Building the two websites: the shop (dist) and the admin (dist-admin)"
cd "$APP_DIR/frontend"
npm ci
# build into new folders first, then swap them in — the live sites keep working until the new builds are ready
npx vite build --mode shop --outDir dist-new --emptyOutDir
npx vite build --mode admin --outDir dist-admin-new --emptyOutDir
rm -rf dist-old dist-admin-old
[ -d dist ] && mv dist dist-old
mv dist-new dist
[ -d dist-admin ] && mv dist-admin dist-admin-old
mv dist-admin-new dist-admin

echo "→ 4/4  Restarting the backend"
cd "$APP_DIR/server"
pm2 restart identee --update-env

echo "✓ Done. Live: $(git -C "$APP_DIR" log --oneline -1)"
echo "  If something is wrong, see docs/DEPLOYMENT.md → 'Going back to the previous version'."
