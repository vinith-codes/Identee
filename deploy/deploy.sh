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

echo "→ 3/4  Building the website"
cd "$APP_DIR/frontend"
npm ci
# build into a new folder first, then swap it in — the live site keeps working until the new build is ready
npx vite build --outDir dist-new --emptyOutDir
rm -rf dist-old
[ -d dist ] && mv dist dist-old
mv dist-new dist

echo "→ 4/4  Restarting the backend"
cd "$APP_DIR/server"
pm2 restart identee --update-env

echo "✓ Done. Live: $(git -C "$APP_DIR" log --oneline -1)"
echo "  If something is wrong, see docs/DEPLOYMENT.md → 'Going back to the previous version'."
