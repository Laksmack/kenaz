#!/bin/bash
#
# Futhark Build Runner — Mac Mini
#
# Polls origin/main for new commits. If found, builds all apps
# (signed + notarized DMGs), then uploads to kenaz.app.
#
# Setup:
#   1. Clone the repo on the Mac Mini
#   2. Ensure Developer ID cert is in the Keychain
#   3. Create .env.notarize at repo root with Apple credentials
#   4. Set up SSH key for scp to kenaz.app (see admin/server-setup.sh)
#   5. Edit REMOTE_HOST and REMOTE_PATH below
#   6. Add to crontab:
#      */10 * * * * /path/to/futhark/admin/build-runner.sh >> ~/.futhark/build-runner.log 2>&1
#

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LOCK_FILE="/tmp/futhark-build-runner.lock"
APPS=(kenaz raido dagaz laguz)

# ── Config (edit these) ──────────────────────────────────────
REMOTE_HOST="ubuntu@compsci-hackathons.com"
REMOTE_PATH="/home/ubuntu/projects/kenaz/html/releases"
BRANCH="main"

# Prevent overlapping runs
if [ -f "$LOCK_FILE" ]; then
  LOCK_PID=$(cat "$LOCK_FILE")
  if kill -0 "$LOCK_PID" 2>/dev/null; then
    exit 0
  fi
  rm -f "$LOCK_FILE"
fi
echo $$ > "$LOCK_FILE"
trap 'rm -f "$LOCK_FILE"' EXIT

cd "$REPO_ROOT"

# Check for new commits
git fetch origin "$BRANCH" --quiet
LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse "origin/$BRANCH")

if [ "$LOCAL" = "$REMOTE" ]; then
  exit 0
fi

git pull --quiet

# Check if any app code actually changed (skip admin-only or docs-only commits)
CHANGED=$(git diff --name-only "$LOCAL" "$REMOTE" -- packages/ signing/ package.json package-lock.json)
if [ -z "$CHANGED" ]; then
  echo "$(date '+%Y-%m-%d %H:%M:%S') — pulled but no app changes, skipping build"
  exit 0
fi

echo ""
echo "━━━ Build Runner: $(date '+%Y-%m-%d %H:%M:%S') ━━━"
echo "  new commits detected ($LOCAL → $REMOTE)"

# Load notarization credentials
if [ -f "$REPO_ROOT/.env.notarize" ]; then
  set -a
  source "$REPO_ROOT/.env.notarize"
  set +a
fi

# Unlock the login keychain so codesign can access the Developer ID key.
# KEYCHAIN_PASSWORD should be set in .env.notarize (the Mac login password).
if [ -n "${KEYCHAIN_PASSWORD:-}" ]; then
  echo "  unlocking keychain..."
  security unlock-keychain -p "$KEYCHAIN_PASSWORD" ~/Library/Keychains/login.keychain-db 2>/dev/null
  security set-key-partition-list -S apple-tool:,apple:,codesign: -s -k "$KEYCHAIN_PASSWORD" ~/Library/Keychains/login.keychain-db >/dev/null 2>&1 || true
fi

# Install dependencies
echo "  installing dependencies..."
if ! npm ci --quiet 2>&1; then
  echo "  ✗ npm ci failed"
  exit 1
fi
echo "  ✓ dependencies installed"

# Build each app
FAILED=()
for app in "${APPS[@]}"; do
  PKG_DIR="$REPO_ROOT/packages/$app"
  NAME=$(node -p "require('$PKG_DIR/package.json').productName || require('$PKG_DIR/package.json').name" 2>/dev/null || echo "$app")
  VERSION=$(node -p "require('$PKG_DIR/package.json').version" 2>/dev/null || echo "?")

  echo ""
  echo "  building $NAME v$VERSION..."

  BUILD_LOG="$REPO_ROOT/.build-$app.log"
  if (cd "$PKG_DIR" && npm run dist 2>&1) > "$BUILD_LOG"; then
    echo "  ✓ $NAME v$VERSION built"

    # Upload release artifacts to server
    RELEASE_DIR="$PKG_DIR/release"
    if [ -d "$RELEASE_DIR" ]; then
      echo "  uploading $NAME to $REMOTE_HOST..."
      ssh "$REMOTE_HOST" "mkdir -p $REMOTE_PATH/$app"
      scp -q "$RELEASE_DIR"/*.dmg "$RELEASE_DIR"/*.zip "$RELEASE_DIR"/latest-mac.yml \
        "$REMOTE_HOST:$REMOTE_PATH/$app/" 2>/dev/null || true
      echo "  ✓ uploaded"
    fi
    rm -f "$BUILD_LOG"
  else
    echo "  ✗ $NAME build failed — last 20 lines:"
    tail -20 "$BUILD_LOG" 2>/dev/null | sed 's/^/    /'
    FAILED+=("$app")
  fi
done

echo ""
if [ ${#FAILED[@]} -gt 0 ]; then
  echo "━━━ Done (${#FAILED[@]} failed: ${FAILED[*]}) ━━━"
else
  echo "━━━ Done — all apps built and uploaded ━━━"
fi
