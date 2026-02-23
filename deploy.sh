#!/bin/bash
#
# Futhark Deploy Script
#
# Usage:
#   ./deploy.sh all              Build and deploy all apps (parallel)
#   ./deploy.sh kenaz dagaz      Build and deploy specific apps
#   ./deploy.sh kenaz --launch   Build, deploy, and relaunch
#   ./deploy.sh all --notarize   Build all and notarize with Apple (for Sophos)
#   ./deploy.sh --mcp-only       Only rebuild the MCP server (no app builds)
#   ./deploy.sh all --serial     Build sequentially instead of in parallel
#
# What it does:
#   1. Builds @futhark/core MCP server (always, since all apps depend on it)
#   2. Quits all target apps
#   3. Builds all target apps in parallel (or serial with --serial)
#   4. Copies each .app to /Applications/
#   5. Optionally relaunches the apps
#

set -e

REPO_ROOT="$(cd "$(dirname "$0")" && pwd)"
APPS=(kenaz raido dagaz laguz)
LAUNCH=false
MCP_ONLY=false
SERIAL=false
NOTARIZE=false

show_help() {
  echo "Usage: ./deploy.sh [all | app1 app2 ...] [--launch] [--mcp-only] [--serial]"
  echo ""
  echo "Apps: kenaz, raido, dagaz, laguz"
  echo ""
  echo "Flags:"
  echo "  --launch     Open apps in /Applications/ after successful build"
  echo "  --notarize   Notarize apps with Apple (slower, needed for Sophos)"
  echo "  --mcp-only   Only rebuild the unified MCP server (no app builds)"
  echo "  --serial     Build sequentially instead of in parallel"
  echo ""
  echo "Examples:"
  echo "  ./deploy.sh all                   Build all apps in parallel"
  echo "  ./deploy.sh all --serial          Build all apps one at a time"
  echo "  ./deploy.sh kenaz                 Build and install Kenaz only"
  echo "  ./deploy.sh kenaz --launch        Build, install, and open Kenaz"
  echo "  ./deploy.sh all --notarize        Build all, notarize with Apple"
  echo "  ./deploy.sh --mcp-only            Only rebuild the unified MCP server"
  exit 0
}

is_valid_app() {
  for a in "${APPS[@]}"; do
    [ "$a" = "$1" ] && return 0
  done
  return 1
}

# Parse args — reject unknown flags, validate app names
TARGETS=()
for arg in "$@"; do
  case "$arg" in
    -h|--help)  show_help ;;
    --launch)    LAUNCH=true ;;
    --notarize)  NOTARIZE=true ;;
    --mcp-only)  MCP_ONLY=true ;;
    --serial)    SERIAL=true ;;
    --*)
      echo "Error: Unknown flag '$arg'"
      echo "Run ./deploy.sh --help for usage."
      exit 1
      ;;
    all)        TARGETS=("${APPS[@]}") ;;
    *)
      if is_valid_app "$arg"; then
        TARGETS+=("$arg")
      else
        echo "Error: Unknown app '$arg'"
        echo "Valid apps: ${APPS[*]}"
        echo "Run ./deploy.sh --help for usage."
        exit 1
      fi
      ;;
  esac
done

if [ ${#TARGETS[@]} -eq 0 ] && [ "$MCP_ONLY" = false ]; then
  show_help
fi

get_display_name() {
  case "$1" in
    kenaz) echo "Kenaz" ;;
    raido) echo "Raido" ;;
    dagaz) echo "Dagaz" ;;
    laguz) echo "Laguz" ;;
  esac
}

# ── Step 1: Build core MCP ──────────────────────────────────

caffeinate -i -w $$ &
CAFFEINE_PID=$!

echo ""
echo "━━━ Deploy started at $(date '+%H:%M:%S') ━━━"
echo ""
echo "━━━ Building @futhark/core ━━━"
cd "$REPO_ROOT/packages/core"
npm run build 2>&1 | tail -5
echo "  done"

if [ "$MCP_ONLY" = true ]; then
  echo ""
  echo "MCP server rebuilt. Installed to ~/.futhark/ on next app launch."
  exit 0
fi

# ── Step 2: Quit all target apps first ────────────────────────

echo ""
echo "━━━ Quitting running apps ━━━"
for app in "${TARGETS[@]}"; do
  NAME=$(get_display_name "$app")
  if pgrep -f "$NAME.app" > /dev/null 2>&1; then
    echo "  quitting $NAME..."
    osascript -e "tell application \"$NAME\" to quit" 2>/dev/null || true
  fi
done
sleep 1
for app in "${TARGETS[@]}"; do
  NAME=$(get_display_name "$app")
  pkill -f "$NAME.app/Contents/MacOS" 2>/dev/null || true
done
sleep 0.5
echo "  done"

# ── Step 3: Build and deploy ─────────────────────────────────

if [ "$NOTARIZE" = true ]; then
  if [ -f "$REPO_ROOT/.env.notarize" ]; then
    set -a
    source "$REPO_ROOT/.env.notarize"
    set +a
    echo ""
    echo "━━━ Notarization enabled ━━━"
    echo "  credentials loaded from .env.notarize"
  else
    echo "Error: .env.notarize not found. Create it with APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD, APPLE_TEAM_ID"
    exit 1
  fi
fi

LOG_DIR=$(mktemp -d)
PIDS=()
BUILD_START=$(date +%s)

elapsed_since() {
  local start="$1"
  local now=$(date +%s)
  echo "$(( now - start ))s"
}

progress() {
  local name="$1" step="$2" start="$3"
  printf "  %-8s %-36s %s\n" "$name" "$step" "$(elapsed_since "$start")"
}

build_app() {
  local app="$1"
  local NAME=$(get_display_name "$app")
  local PKG_DIR="$REPO_ROOT/packages/$app"
  local LOG="$LOG_DIR/$app.log"

  if [ ! -d "$PKG_DIR" ]; then
    echo "FAIL: Package '$app' not found" > "$LOG"
    return 1
  fi

  local VERSION=$(node -p "require('$PKG_DIR/package.json').version")
  local APP_START=$(date +%s)

  progress "$NAME" "compiling typescript..." "$APP_START"

  cd "$PKG_DIR"

  npm run dist:dir 2>&1 | tee "$LOG" | while IFS= read -r line; do
    case "$line" in
      *"vite build"*)
        progress "$NAME" "bundling renderer (vite)..." "$APP_START" ;;
      *"built in"*)
        progress "$NAME" "vite done" "$APP_START" ;;
      *"installing native dependencies"*)
        progress "$NAME" "rebuilding native modules..." "$APP_START" ;;
      *"packaging"*"platform="*)
        progress "$NAME" "packaging electron app..." "$APP_START" ;;
      *"signing"*"file="*)
        progress "$NAME" "signing with Developer ID..." "$APP_START" ;;
      *"otarizing"*|*"otariz"*)
        progress "$NAME" "notarizing with Apple..." "$APP_START" ;;
      *"otarization complete"*|*"otarize complete"*)
        progress "$NAME" "notarization complete" "$APP_START" ;;
    esac
  done

  if [ "${PIPESTATUS[0]}" -ne 0 ]; then
    echo "FAIL: Build failed" >> "$LOG"
    return 1
  fi

  local SRC="$PKG_DIR/release/mac-arm64/$NAME.app"
  local DEST="/Applications/$NAME.app"

  if [ ! -d "$SRC" ]; then
    echo "FAIL: Build output not found at $SRC" >> "$LOG"
    return 1
  fi

  progress "$NAME" "copying to /Applications..." "$APP_START"
  rm -rf "$DEST"
  cp -R "$SRC" "$DEST"

  local INSTALLED_VER=$(defaults read "$DEST/Contents/Info.plist" CFBundleShortVersionString 2>/dev/null || echo "?")
  progress "$NAME" "✓ v$INSTALLED_VER installed" "$APP_START"
  echo "OK: $NAME v$INSTALLED_VER installed" >> "$LOG"
  return 0
}

# Copy .env into each target package so electron-builder bundles it into the asar
ENV_FILE="$REPO_ROOT/.env"
if [ -f "$ENV_FILE" ]; then
  for app in "${TARGETS[@]}"; do
    cp "$ENV_FILE" "$REPO_ROOT/packages/$app/.env"
  done
else
  echo ""
  echo "⚠  No .env file at repo root — OAuth credentials will NOT be bundled."
  echo "   Create $REPO_ROOT/.env with OAUTH_CLIENT_ID and OAUTH_CLIENT_SECRET"
fi

echo ""
echo "━━━ Building ${#TARGETS[@]} app(s) ━━━"
echo ""

if [ "$SERIAL" = true ] || [ ${#TARGETS[@]} -eq 1 ]; then
  FAILED=()
  SUCCEEDED=()

  for app in "${TARGETS[@]}"; do
    if build_app "$app"; then
      SUCCEEDED+=("$app")
    else
      NAME=$(get_display_name "$app")
      progress "$NAME" "✗ build failed" "$BUILD_START"
      FAILED+=("$app")
      echo ""
      echo "  Last 20 lines of $LOG_DIR/$app.log:"
      tail -20 "$LOG_DIR/$app.log" | sed 's/^/    /'
    fi
  done
else
  RESULT_DIR=$(mktemp -d)

  for app in "${TARGETS[@]}"; do
    (
      if build_app "$app"; then
        echo "ok" > "$RESULT_DIR/$app"
      else
        NAME=$(get_display_name "$app")
        progress "$NAME" "✗ build failed" "$BUILD_START"
        echo "fail" > "$RESULT_DIR/$app"
      fi
    ) &
    PIDS+=($!)
  done

  wait "${PIDS[@]}" 2>/dev/null || true

  FAILED=()
  SUCCEEDED=()

  for app in "${TARGETS[@]}"; do
    if [ -f "$RESULT_DIR/$app" ] && [ "$(cat "$RESULT_DIR/$app")" = "ok" ]; then
      SUCCEEDED+=("$app")
    else
      FAILED+=("$app")
    fi
  done

  rm -rf "$RESULT_DIR"
fi

BUILD_END=$(date +%s)
ELAPSED=$((BUILD_END - BUILD_START))

# ── Step 4: Launch if requested ───────────────────────────────

if [ "$LAUNCH" = true ] && [ ${#SUCCEEDED[@]} -gt 0 ]; then
  echo ""
  echo "━━━ Launching ━━━"
  for app in "${SUCCEEDED[@]}"; do
    NAME=$(get_display_name "$app")
    echo "  opening $NAME..."
    open "/Applications/$NAME.app"
  done
fi

# ── Summary ──────────────────────────────────────────────────

echo ""
echo "━━━ Done (${ELAPSED}s) ━━━"
if [ ${#SUCCEEDED[@]} -gt 0 ]; then
  echo "  deployed: ${SUCCEEDED[*]}"
fi
if [ ${#FAILED[@]} -gt 0 ]; then
  echo "  failed:   ${FAILED[*]}"
fi
echo ""

# Cleanup
rm -rf "$LOG_DIR"
