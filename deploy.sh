#!/bin/bash
#
# Futhark Deploy Script
#
# Usage:
#   ./deploy.sh all              Build and deploy all apps (parallel)
#   ./deploy.sh kenaz dagaz      Build and deploy specific apps
#   ./deploy.sh kenaz --launch   Build, deploy, and relaunch
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

# Parse args
TARGETS=()
for arg in "$@"; do
  case "$arg" in
    --launch)   LAUNCH=true ;;
    --mcp-only) MCP_ONLY=true ;;
    --serial)   SERIAL=true ;;
    all)        TARGETS=("${APPS[@]}") ;;
    *)          TARGETS+=("$arg") ;;
  esac
done

if [ ${#TARGETS[@]} -eq 0 ] && [ "$MCP_ONLY" = false ]; then
  echo "Usage: ./deploy.sh [all | app1 app2 ...] [--launch] [--mcp-only] [--serial]"
  echo ""
  echo "Apps: kenaz, raido, dagaz, laguz"
  echo ""
  echo "Examples:"
  echo "  ./deploy.sh all              Build all apps in parallel"
  echo "  ./deploy.sh all --serial     Build all apps one at a time"
  echo "  ./deploy.sh kenaz            Build and install Kenaz only"
  echo "  ./deploy.sh kenaz --launch   Build, install, and open Kenaz"
  echo "  ./deploy.sh --mcp-only       Only rebuild the unified MCP server"
  exit 1
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

echo ""
echo "━━━ Building @futhark/core MCP server ━━━"
cd "$REPO_ROOT/packages/core"
npm run build:mcp 2>&1 | tail -3
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

LOG_DIR=$(mktemp -d)
PIDS=()
BUILD_START=$(date +%s)

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
  echo "[$NAME v$VERSION] building..." > "$LOG"

  cd "$PKG_DIR"
  if ! npm run dist:dir >> "$LOG" 2>&1; then
    echo "FAIL: Build failed" >> "$LOG"
    return 1
  fi

  local SRC="$PKG_DIR/release/mac-arm64/$NAME.app"
  local DEST="/Applications/$NAME.app"

  if [ ! -d "$SRC" ]; then
    echo "FAIL: Build output not found at $SRC" >> "$LOG"
    return 1
  fi

  rm -rf "$DEST"
  cp -R "$SRC" "$DEST"

  local INSTALLED_VER=$(defaults read "$DEST/Contents/Info.plist" CFBundleShortVersionString 2>/dev/null || echo "?")
  echo "OK: $NAME v$INSTALLED_VER installed" >> "$LOG"
  return 0
}

if [ "$SERIAL" = true ] || [ ${#TARGETS[@]} -eq 1 ]; then
  # Sequential builds
  FAILED=()
  SUCCEEDED=()

  for app in "${TARGETS[@]}"; do
    NAME=$(get_display_name "$app")
    echo ""
    echo "━━━ $NAME ━━━"
    if build_app "$app"; then
      tail -1 "$LOG_DIR/$app.log" | sed 's/^/  /'
      SUCCEEDED+=("$app")
    else
      tail -1 "$LOG_DIR/$app.log" | sed 's/^/  /'
      FAILED+=("$app")
    fi
  done
else
  # Parallel builds — each subshell prints its result the moment it finishes
  echo ""
  echo "━━━ Building ${#TARGETS[@]} apps in parallel ━━━"
  echo ""

  for app in "${TARGETS[@]}"; do
    NAME=$(get_display_name "$app")
    VERSION=$(node -p "require('$REPO_ROOT/packages/$app/package.json').version" 2>/dev/null || echo "?")
    echo "  ⟐ $NAME v$VERSION"
  done

  echo ""

  RESULT_DIR=$(mktemp -d)

  for app in "${TARGETS[@]}"; do
    (
      APP_START=$(date +%s)
      NAME=$(get_display_name "$app")
      if build_app "$app"; then
        APP_END=$(date +%s)
        APP_ELAPSED=$((APP_END - APP_START))
        result=$(tail -1 "$LOG_DIR/$app.log")
        echo "  ✓ $result (${APP_ELAPSED}s)"
        echo "ok" > "$RESULT_DIR/$app"
      else
        APP_END=$(date +%s)
        APP_ELAPSED=$((APP_END - APP_START))
        result=$(tail -1 "$LOG_DIR/$app.log")
        echo "  ✗ $NAME: $result (${APP_ELAPSED}s)"
        echo "fail" > "$RESULT_DIR/$app"
      fi
    ) &
    PIDS+=($!)
  done

  # Wait for all background jobs to finish
  wait "${PIDS[@]}" 2>/dev/null || true

  echo ""

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
