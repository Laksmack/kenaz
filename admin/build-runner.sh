#!/bin/bash
#
# Futhark Build Runner — Mac Mini
#
# Polls origin/main for new commits. If found, builds only the apps
# that changed (signed DMGs), then uploads to kenaz.app.
# Also syncs the web/ directory if it changed.
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
# Usage:
#   bash admin/build-runner.sh            # normal mode: build only if new commits
#   bash admin/build-runner.sh --force    # skip commit check, build all apps

FORCE=false
if [ "${1:-}" = "--force" ] || [ "${1:-}" = "-f" ]; then
  FORCE=true
fi

# Ensure SSH agent is available for git (needed in cron)
if [ -z "${SSH_AUTH_SOCK:-}" ]; then
  eval "$(ssh-agent -s)" >/dev/null 2>&1
  ssh-add --apple-use-keychain 2>/dev/null
fi

# Ensure PATH includes homebrew and node (needed in cron)
export PATH="/opt/homebrew/opt/node@22/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LOCK_FILE="/tmp/futhark-build-runner.lock"
APPS=(kenaz raido dagaz laguz)

# ── Config (edit these) ──────────────────────────────────────
REMOTE_HOST="ubuntu@compsci-hackathons.com"
REMOTE_PATH="/home/ubuntu/projects/kenaz/html/releases"
REMOTE_HTML="/home/ubuntu/projects/kenaz/html"
BRANCH="main"

# Prevent overlapping runs
if [ -f "$LOCK_FILE" ]; then
  LOCK_PID=$(cat "$LOCK_FILE")
  if kill -0 "$LOCK_PID" 2>/dev/null && ps -p "$LOCK_PID" -o command= 2>/dev/null | grep -q "build-runner"; then
    echo "$(date '+%Y-%m-%d %H:%M:%S') — build already running (pid $LOCK_PID), skipping"
    exit 0
  fi
  rm -f "$LOCK_FILE"
fi
echo $$ > "$LOCK_FILE"
trap 'rm -f "$LOCK_FILE"' EXIT

cd "$REPO_ROOT"

# Determine what changed
CHANGED_FILES=""
if [ "$FORCE" = false ]; then
  git fetch origin "$BRANCH" --quiet
  LOCAL=$(git rev-parse HEAD)
  REMOTE=$(git rev-parse "origin/$BRANCH")

  if [ "$LOCAL" = "$REMOTE" ]; then
    exit 0
  fi

  git pull --quiet

  CHANGED_FILES=$(git diff --name-only "$LOCAL" "$REMOTE")
  RELEVANT=$(echo "$CHANGED_FILES" | grep -E '^(packages/|signing/|web/|package\.json|package-lock\.json)')
  if [ -z "$RELEVANT" ]; then
    echo "$(date '+%Y-%m-%d %H:%M:%S') — pulled but no relevant changes, skipping"
    exit 0
  fi
fi

echo ""
echo "━━━ Build Runner: $(date '+%Y-%m-%d %H:%M:%S') ━━━"
if [ "$FORCE" = true ]; then
  echo "  forced build ($(git rev-parse --short HEAD))"
else
  echo "  new commits detected ($LOCAL → $REMOTE)"
fi

# Figure out which apps need rebuilding
# Rebuild all if: --force, core changed, signing changed, root package files changed
REBUILD_ALL=false
if [ "$FORCE" = true ]; then
  REBUILD_ALL=true
elif echo "$CHANGED_FILES" | grep -qE '^(packages/core/|signing/|package\.json|package-lock\.json)'; then
  REBUILD_ALL=true
fi

APPS_TO_BUILD=()
if [ "$REBUILD_ALL" = true ]; then
  APPS_TO_BUILD=("${APPS[@]}")
else
  for app in "${APPS[@]}"; do
    if echo "$CHANGED_FILES" | grep -q "^packages/$app/"; then
      APPS_TO_BUILD+=("$app")
    fi
  done
fi

# Check if web changed
WEB_CHANGED=false
if [ "$FORCE" = true ] || echo "$CHANGED_FILES" | grep -q "^web/"; then
  WEB_CHANGED=true
fi

# Load credentials (keychain password for codesign access)
source "$REPO_ROOT/.env.notarize"

# Export notarize vars only if --notarize flag is passed
if [ "${2:-}" = "--notarize" ]; then
  export APPLE_ID APPLE_APP_SPECIFIC_PASSWORD APPLE_TEAM_ID
  echo "  notarization enabled"
fi

# Build apps if any need building
FAILED=()
if [ ${#APPS_TO_BUILD[@]} -gt 0 ]; then
  # Unlock keychain for codesign
  security unlock-keychain -p "$KEYCHAIN_PASSWORD" ~/Library/Keychains/login.keychain-db
  security set-key-partition-list -S apple-tool:,apple:,codesign: -s -k "$KEYCHAIN_PASSWORD" ~/Library/Keychains/login.keychain-db >/dev/null 2>&1
  echo "  keychain unlocked"

  echo "  installing dependencies..."
  npm ci --quiet 2>&1
  echo "  ✓ dependencies installed"

  # Build core library first (auto-updater etc.)
  echo "  building @futhark/core..."
  cd "$REPO_ROOT/packages/core"
  npm run build 2>&1 | tail -5
  cd "$REPO_ROOT"
  echo "  ✓ core built"

  # Copy .env into each package so electron-builder bundles OAuth creds into the asar
  ENV_FILE="$REPO_ROOT/.env"
  if [ -f "$ENV_FILE" ]; then
    for app in "${APPS_TO_BUILD[@]}"; do
      cp "$ENV_FILE" "$REPO_ROOT/packages/$app/.env"
    done
    echo "  ✓ .env copied to packages"
  else
    echo "  ⚠  No .env at repo root — OAuth will not work in packaged apps!"
  fi

  echo "  apps to build: ${APPS_TO_BUILD[*]}"

  for app in "${APPS_TO_BUILD[@]}"; do
    PKG_DIR="$REPO_ROOT/packages/$app"
    NAME=$(node -p "require('$PKG_DIR/package.json').productName || require('$PKG_DIR/package.json').name" 2>/dev/null || echo "$app")
    VERSION=$(node -p "require('$PKG_DIR/package.json').version" 2>/dev/null || echo "?")

    echo ""
    echo "  building $NAME v$VERSION..."

    # Re-unlock keychain before each build
    security unlock-keychain -p "$KEYCHAIN_PASSWORD" ~/Library/Keychains/login.keychain-db

    BUILD_LOG="$REPO_ROOT/.build-$app.log"
    cd "$PKG_DIR"
    npm run dist > "$BUILD_LOG" 2>&1
    BUILD_EXIT=$?
    cd "$REPO_ROOT"

    if [ $BUILD_EXIT -eq 0 ]; then
      echo "  ✓ $NAME v$VERSION built ($(date '+%H:%M:%S'))"

      RELEASE_DIR="$PKG_DIR/release"
      if [ -d "$RELEASE_DIR" ]; then
        echo "  uploading $NAME to $REMOTE_HOST..."
        ssh "$REMOTE_HOST" "mkdir -p $REMOTE_PATH/$app"
        scp -q "$RELEASE_DIR"/*.dmg "$RELEASE_DIR"/*.zip "$RELEASE_DIR"/latest-mac.yml \
          "$REMOTE_HOST:$REMOTE_PATH/$app/" 2>/dev/null || true
      DMG_NAME=$(ls -t "$RELEASE_DIR"/*.dmg 2>/dev/null | head -1 | xargs basename)
      if [ -n "$DMG_NAME" ]; then
        ssh "$REMOTE_HOST" "cd $REMOTE_PATH/$app && ln -sf '$DMG_NAME' ${app}_latest.dmg"
      fi
        echo "  ✓ uploaded"
      fi
      rm -f "$BUILD_LOG"
    else
      echo "  ✗ $NAME build failed — last 20 lines:"
      tail -20 "$BUILD_LOG" 2>/dev/null | sed 's/^/    /'
      FAILED+=("$app")
    fi
  done
else
  echo "  no app changes — skipping builds"
fi

# Sync web directory if it changed
if [ "$WEB_CHANGED" = true ] && [ -d "$REPO_ROOT/web" ]; then
  echo ""
  echo "  syncing website..."
  scp -q "$REPO_ROOT/web/"* "$REMOTE_HOST:$REMOTE_HTML/" 2>/dev/null || true
  echo "  ✓ website synced"
fi

echo ""
if [ ${#FAILED[@]} -gt 0 ]; then
  echo "━━━ Done (${#FAILED[@]} failed: ${FAILED[*]}) ━━━"
else
  echo "━━━ Done ━━━"
fi
