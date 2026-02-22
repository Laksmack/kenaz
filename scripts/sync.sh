#!/bin/bash
# /opt/futhark/sync.sh
# Pulls from GitHub, rebuilds if changed, updates web and releases
# Run via cron: */20 * * * * /opt/futhark/sync.sh >> /var/log/futhark-sync.log 2>&1

set -e

REPO_DIR="/opt/futhark/repo"
WEB_ROOT="/var/www/kenaz.app/public"
RELEASES_DIR="$WEB_ROOT/releases"
LOG_PREFIX="[$(date -u '+%Y-%m-%d %H:%M:%S UTC')]"

cd "$REPO_DIR"

# Fetch without merging
git fetch origin main --quiet

LATEST=$(git rev-parse origin/main)
CURRENT=$(git rev-parse HEAD)

if [ "$LATEST" = "$CURRENT" ]; then
  echo "$LOG_PREFIX No changes."
  exit 0
fi

echo "$LOG_PREFIX Changes detected. Pulling..."
git pull origin main --quiet
npm install --quiet --production

VERSION=$(node -p "require('./package.json').version")
TARBALL="futhark-${VERSION}.tar.gz"
TARBALL_PATH="$RELEASES_DIR/$TARBALL"

# Build release tarball if this version doesn't exist yet
if [ ! -f "$TARBALL_PATH" ]; then
  echo "$LOG_PREFIX Building $TARBALL..."
  mkdir -p "$RELEASES_DIR"

  tar -czf "$TARBALL_PATH" \
    --exclude='.git' \
    --exclude='node_modules/.cache' \
    --exclude='web' \
    --exclude='.env' \
    --exclude='*.log' \
    -C /opt/futhark repo

  CHECKSUM=$(shasum -a 256 "$TARBALL_PATH" | cut -d' ' -f1)
  RELEASED=$(date -u +%Y-%m-%dT%H:%M:%SZ)

  cat > "$RELEASES_DIR/latest.json" <<EOF
{
  "version": "${VERSION}",
  "released": "${RELEASED}",
  "url": "https://kenaz.app/releases/${TARBALL}",
  "checksum": "sha256:${CHECKSUM}"
}
EOF

  echo "$LOG_PREFIX Release $VERSION packaged. Checksum: $CHECKSUM"
fi

# Sync web folder to webroot
# Note: rsync web/ INTO public/, then restore releases dir
echo "$LOG_PREFIX Syncing web..."
rsync -a "$REPO_DIR/web/" "$WEB_ROOT/"

echo "$LOG_PREFIX Done. Live at kenaz.app (v${VERSION})"
