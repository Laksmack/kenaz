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
#   bash admin/build-runner.sh                  # normal mode: build only if new commits
#   bash admin/build-runner.sh --force          # skip commit check, build all apps
#   bash admin/build-runner.sh --no-notarize    # skip Apple notarization

# Wrap in main() so bash parses the entire script into memory before
# executing. This prevents git pull from corrupting the running script
# by changing the file mid-execution.
main() {

FORCE=false
NOTARIZE=true
for arg in "$@"; do
  case "$arg" in
    --force|-f) FORCE=true ;;
    --no-notarize) NOTARIZE=false ;;
  esac
done

# Ensure SSH agent is available for git (needed in cron)
if [ -z "${SSH_AUTH_SOCK:-}" ]; then
  eval "$(ssh-agent -s)" >/dev/null 2>&1
  ssh-add --apple-use-keychain 2>/dev/null
fi

# Ensure PATH includes homebrew and node (needed in cron)
export PATH="/opt/homebrew/opt/node@22/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LOCK_FILE="/tmp/futhark-build-runner.lock"
RETRY_FILE="$HOME/.futhark/build-retry.txt"
APPS=(kenaz raido dagaz laguz)
UPLOAD_PIDS=()

# ── Config (override via env) ────────────────────────────────
# Defaults are aligned with a Tailscale-routed host where uploads go over SSH
# as the ubuntu user unless overridden.
# Examples:
#   BUILD_REMOTE_HOST=ubuntu@your-server.tailnet-name.ts.net
#   BUILD_REMOTE_PATH=/var/www/kenaz.app/releases
#   BUILD_REMOTE_HTML=/var/www/kenaz.app
REMOTE_HOST="${BUILD_REMOTE_HOST:-ubuntu@kenaz.app}"
REMOTE_PATH="${BUILD_REMOTE_PATH:-/var/www/kenaz.app/releases}"
REMOTE_HTML="${BUILD_REMOTE_HTML:-/var/www/kenaz.app}"
REMOTE_SSH_KEY="${BUILD_REMOTE_SSH_KEY:-}"
BRANCH="main"

# Build SSH/SCP option arrays (include identity file if set)
SSH_KEY_OPTS=()
[ -n "$REMOTE_SSH_KEY" ] && SSH_KEY_OPTS=(-i "$REMOTE_SSH_KEY")

log() {
  echo "$(date '+%Y-%m-%d %H:%M:%S') — $*"
}

log "upload target host: $REMOTE_HOST"
log "upload releases dir: $REMOTE_PATH"
log "upload web dir: $REMOTE_HTML"

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

# Check for failed builds that need retrying
RETRY_APPS=()
if [ -f "$RETRY_FILE" ] && [ "$FORCE" = false ]; then
  while IFS= read -r line; do
    [ -n "$line" ] && RETRY_APPS+=("$line")
  done < "$RETRY_FILE"
fi

# Determine what changed
CHANGED_FILES=""
HAS_NEW_COMMITS=false
if [ "$FORCE" = false ]; then
  git fetch origin "$BRANCH" --quiet
  LOCAL=$(git rev-parse HEAD)
  REMOTE=$(git rev-parse "origin/$BRANCH")

  if [ "$LOCAL" = "$REMOTE" ] && [ ${#RETRY_APPS[@]} -eq 0 ]; then
    exit 0
  fi

  if [ "$LOCAL" != "$REMOTE" ]; then
    HAS_NEW_COMMITS=true

    # Reset any build artifacts (e.g. package-lock.json modified by npm ci)
    # so git pull doesn't fail on dirty working tree
    git checkout -- . 2>/dev/null
    git clean -fd 2>/dev/null

    if ! git pull --quiet; then
      echo "$(date '+%Y-%m-%d %H:%M:%S') — git pull failed, aborting"
      exit 1
    fi

    CHANGED_FILES=$(git diff --name-only "$LOCAL" "$REMOTE")
    RELEVANT=$(echo "$CHANGED_FILES" | grep -E '^(packages/|signing/|web/|package\.json|package-lock\.json)')
    if [ -z "$RELEVANT" ] && [ ${#RETRY_APPS[@]} -eq 0 ]; then
      echo "$(date '+%Y-%m-%d %H:%M:%S') — pulled but no relevant changes, skipping"
      exit 0
    fi
  fi
fi

echo ""
echo "━━━ Build Runner: $(date '+%Y-%m-%d %H:%M:%S') ━━━"
if [ "$FORCE" = true ]; then
  echo "  forced build ($(git rev-parse --short HEAD))"
elif [ "$HAS_NEW_COMMITS" = true ]; then
  echo "  new commits detected ($LOCAL → $REMOTE)"
fi
if [ ${#RETRY_APPS[@]} -gt 0 ]; then
  echo "  retrying previously failed: ${RETRY_APPS[*]}"
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
  # Merge in retry apps (deduplicated)
  for rapp in "${RETRY_APPS[@]}"; do
    _found=false
    for existing in "${APPS_TO_BUILD[@]}"; do
      [ "$existing" = "$rapp" ] && _found=true && break
    done
    [ "$_found" = false ] && APPS_TO_BUILD+=("$rapp")
  done
fi

# Clear the retry file — we'll re-populate it with any new failures
rm -f "$RETRY_FILE"

# Check if web changed
WEB_CHANGED=false
if [ "$FORCE" = true ] || echo "$CHANGED_FILES" | grep -q "^web/"; then
  WEB_CHANGED=true
fi

# Load credentials (keychain password for codesign access)
source "$REPO_ROOT/.env.notarize"

if [ "$NOTARIZE" = true ]; then
  export APPLE_ID APPLE_APP_SPECIFIC_PASSWORD APPLE_TEAM_ID
  echo "  notarization enabled"
else
  echo "  notarization skipped"
fi

# Build apps if any need building
FAILED=()
if [ ${#APPS_TO_BUILD[@]} -gt 0 ]; then
  # Unlock keychain for codesign (launchd may have empty keychain search list)
  security list-keychains -s ~/Library/Keychains/login.keychain-db
  security unlock-keychain -p "$KEYCHAIN_PASSWORD" ~/Library/Keychains/login.keychain-db
  security set-key-partition-list -S apple-tool:,apple:,codesign: -s -k "$KEYCHAIN_PASSWORD" ~/Library/Keychains/login.keychain-db >/dev/null 2>&1
  echo "  keychain unlocked"

  echo "  installing dependencies..."
  npm ci --loglevel=error 2>&1
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

  # Upload a built app in the background; logs to .upload-<app>.log
  upload_release() {
    local app="$1" name="$2" version="$3" release_dir="$4"
    local log="$REPO_ROOT/.upload-$app.log"
    {
      echo "$(date '+%H:%M:%S') starting upload of $name v$version"
      local ssh_opts=("${SSH_KEY_OPTS[@]}" -o ConnectTimeout=10 -o ServerAliveInterval=15 -o ServerAliveCountMax=3)
      # mkdir via sftp (works with sftp-only deploy user)
      sftp "${ssh_opts[@]}" -b - "$REMOTE_HOST" <<< "mkdir $REMOTE_PATH/$app" 2>/dev/null || true

      local remote_dest="$REMOTE_HOST:$REMOTE_PATH/$app/"
      local scp_opts=("${SSH_KEY_OPTS[@]}" -o ConnectTimeout=10 -o ServerAliveInterval=15 -o ServerAliveCountMax=3)
      local failed=false
      local max_retries=2

      for f in "$release_dir"/*.dmg "$release_dir"/*.zip "$release_dir"/latest-mac.yml; do
        [ -f "$f" ] || continue
        local basename_f="${f##*/}"
        echo "  uploading $basename_f ($(du -h "$f" | cut -f1))..."
        local attempt=0
        while [ $attempt -le $max_retries ]; do
          if scp "${scp_opts[@]}" "$f" "$remote_dest"; then
            break
          fi
          attempt=$((attempt + 1))
          if [ $attempt -le $max_retries ]; then
            echo "  retrying $basename_f (attempt $((attempt + 1))/$((max_retries + 1)))..."
            sleep 5
          else
            echo "  error: failed to upload $basename_f after $((max_retries + 1)) attempts"
            failed=true
          fi
        done
      done

      if [ "$failed" = true ]; then
        echo "$(date '+%H:%M:%S') upload FAILED"
        return 1
      fi

      local dmg_name
      dmg_name=$(ls -t "$release_dir"/*.dmg 2>/dev/null | head -1 | xargs basename)
      if [ -n "$dmg_name" ]; then
        # symlink via sftp (ln not available in sftp, so just copy the dmg as _latest.dmg)
        scp "${scp_opts[@]}" "$release_dir/$dmg_name" "$REMOTE_HOST:$REMOTE_PATH/$app/${app}_latest.dmg"
      fi

      # Skip remote cleanup (no shell access with sftp-only user)

      echo "$(date '+%H:%M:%S') upload complete"
    } > "$log" 2>&1
  }

  for app in "${APPS_TO_BUILD[@]}"; do
    PKG_DIR="$REPO_ROOT/packages/$app"
    NAME=$(node -p "require('$PKG_DIR/package.json').build.productName || require('$PKG_DIR/package.json').name" 2>/dev/null || echo "$app")
    VERSION=$(node -p "require('$PKG_DIR/package.json').version" 2>/dev/null || echo "?")

    echo ""
    echo "  building $NAME v$VERSION..."

    # Clean old build artifacts so only current version gets uploaded
    rm -rf "$PKG_DIR/release"

    # Re-unlock keychain before each build
    security unlock-keychain -p "$KEYCHAIN_PASSWORD" ~/Library/Keychains/login.keychain-db

    BUILD_LOG="$REPO_ROOT/.build-$app.log"
    cd "$PKG_DIR"
    npm run dist > "$BUILD_LOG" 2>&1
    BUILD_EXIT=$?
    cd "$REPO_ROOT"

    if [ $BUILD_EXIT -eq 0 ]; then
      RELEASE_DIR="$PKG_DIR/release"
      APP_PATH="$RELEASE_DIR/mac-arm64/$NAME.app"

      # Verify code signing — reject ad-hoc signed builds
      SIGN_INFO=$(codesign -dvv "$APP_PATH" 2>&1)
      if echo "$SIGN_INFO" | grep -q "Signature=adhoc"; then
        echo "  ✗ $NAME v$VERSION built but ad-hoc signed (cert not found?) — skipping upload"
        echo "  codesign output:" 
        echo "$SIGN_INFO" | sed 's/^/    /'
        FAILED+=("$app")
      elif ! echo "$SIGN_INFO" | grep -q "Developer ID Application"; then
        echo "  ✗ $NAME v$VERSION signed but not with Developer ID — skipping upload"
        echo "  full codesign output:"
        echo "$SIGN_INFO" | sed 's/^/    /'
        FAILED+=("$app")
      else
        echo "  ✓ $NAME v$VERSION built and signed ($(date '+%H:%M:%S'))"
        rm -f "$BUILD_LOG"

        if [ -d "$RELEASE_DIR" ]; then
          upload_release "$app" "$NAME" "$VERSION" "$RELEASE_DIR" &
          UPLOAD_PIDS+=("$!:$app:$NAME")
          echo "  ↗ $NAME upload started in background (pid $!)"
        fi
      fi
    else
      echo "  ✗ $NAME build failed — last 20 lines:"
      tail -20 "$BUILD_LOG" 2>/dev/null | sed 's/^/    /'
      FAILED+=("$app")
    fi
  done
else
  echo "  no app changes — skipping builds"
fi

# Detect which packages a commit touches based on changed files and message
detect_packages() {
  local hash="$1" msg="$2"
  local tags=()
  local files
  files=$(git diff-tree --no-commit-id --name-only -r "$hash" 2>/dev/null)

  # Detect from changed file paths
  echo "$files" | grep -q '^packages/kenaz/' && tags+=("kenaz")
  echo "$files" | grep -q '^packages/raido/' && tags+=("raido")
  echo "$files" | grep -q '^packages/dagaz/' && tags+=("dagaz")
  echo "$files" | grep -q '^packages/laguz/' && tags+=("laguz")
  echo "$files" | grep -q '^packages/core/'  && tags+=("core")

  # If nothing detected from files, try the commit message (case-insensitive)
  if [ ${#tags[@]} -eq 0 ]; then
    local lower
    lower=$(echo "$msg" | tr '[:upper:]' '[:lower:]')
    echo "$lower" | grep -qw 'kenaz'  && tags+=("kenaz")
    echo "$lower" | grep -qw 'raidō\|raido' && tags+=("raido")
    echo "$lower" | grep -qw 'dagaz'  && tags+=("dagaz")
    echo "$lower" | grep -qw 'laguz'  && tags+=("laguz")
    echo "$lower" | grep -qw 'core\|mcp\|futhark-mcp' && tags+=("core")
  fi

  # Output as JSON array
  if [ ${#tags[@]} -eq 0 ]; then
    echo "[]"
  else
    local json="["
    local first=true
    for t in "${tags[@]}"; do
      [ "$first" = false ] && json+=","
      json+="\"$t\""
      first=false
    done
    json+="]"
    echo "$json"
  fi
}

# Generate changelog.json from recent commits
generate_changelog() {
  local out="$REPO_ROOT/web/changelog.json"
  local entries=()
  while IFS='|' read -r hash date msg; do
    # Skip noisy commits (merges, bumps, build-runner tweaks)
    echo "$msg" | grep -qiE '^(merge|bump .* to trigger|fix build-runner)' && continue
    # Escape JSON-unsafe characters
    msg=$(echo "$msg" | sed 's/\\/\\\\/g; s/"/\\"/g')
    local tags
    tags=$(detect_packages "$hash" "$msg")
    entries+=("{\"hash\":\"$hash\",\"date\":\"$date\",\"message\":\"$msg\",\"tags\":$tags}")
  done < <(git log --format='%h|%ad|%s' --date=short -30 HEAD)
  # Take first 10 after filtering
  local json="["
  local count=0
  for e in "${entries[@]}"; do
    [ $count -ge 10 ] && break
    [ $count -gt 0 ] && json+=","
    json+="$e"
    count=$((count + 1))
  done
  json+="]"
  echo "$json" > "$out"
}

generate_versions() {
  local out="$REPO_ROOT/web/versions.json"
  local json="{"
  local first=true
  for app in "${APPS[@]}"; do
    local ver
    ver=$(node -p "require('$REPO_ROOT/packages/$app/package.json').version" 2>/dev/null || echo "")
    [ -z "$ver" ] && continue
    [ "$first" = false ] && json+=","
    json+="\"$app\":\"$ver\""
    first=false
  done
  json+="}"
  echo "$json" > "$out"
}

# Sync web directory and changelog
if [ "$WEB_CHANGED" = true ] || [ "$HAS_NEW_COMMITS" = true ] || [ "$FORCE" = true ]; then
  generate_changelog
  generate_versions
  echo ""
  echo "  syncing website..."
  if scp "${SSH_KEY_OPTS[@]}" "$REPO_ROOT/web/"* "$REMOTE_HOST:$REMOTE_HTML/"; then
    echo "  ✓ website synced (with changelog)"
  else
    echo "  ⚠ website sync failed (continuing)"
  fi
fi

# Wait for background uploads to finish
if [ ${#UPLOAD_PIDS[@]} -gt 0 ]; then
  echo ""
  echo "  waiting for ${#UPLOAD_PIDS[@]} upload(s)..."
  WAIT_START=$SECONDS
  UPLOAD_ERRORS=0

  for entry in "${UPLOAD_PIDS[@]}"; do
    pid="${entry%%:*}"
    rest="${entry#*:}"
    app="${rest%%:*}"
    name="${rest#*:}"

    if wait "$pid"; then
      ELAPSED=$(( SECONDS - WAIT_START ))
      echo "  ✓ $name uploaded (${ELAPSED}s elapsed)"
    else
      echo "  ✗ $name upload failed"
      ((UPLOAD_ERRORS++))
      FAILED+=("$app")
    fi

    log="$REPO_ROOT/.upload-$app.log"
    if [ -f "$log" ]; then
      grep -E '(uploading|cleaned|complete|error|FAILED)' "$log" 2>/dev/null | tail -5 | sed 's/^/    /'
      rm -f "$log"
    fi
  done

  TOTAL_WAIT=$(( SECONDS - WAIT_START ))
  if [ "$UPLOAD_ERRORS" -gt 0 ]; then
    echo "  ⚠ $UPLOAD_ERRORS upload(s) had errors (${TOTAL_WAIT}s total)"
  else
    echo "  ✓ all uploads complete (${TOTAL_WAIT}s total)"
  fi
fi

echo ""
if [ ${#FAILED[@]} -gt 0 ]; then
  # Persist failed apps so next cron run retries them
  mkdir -p "$(dirname "$RETRY_FILE")"
  printf '%s\n' "${FAILED[@]}" | awk 'NF && !seen[$0]++' > "$RETRY_FILE"
  echo "━━━ Done (${#FAILED[@]} failed: ${FAILED[*]} — will retry next run) ━━━"
else
  rm -f "$RETRY_FILE"
  echo "━━━ Done ━━━"
fi

}

main "$@"
