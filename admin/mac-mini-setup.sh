#!/bin/bash
#
# Futhark Mac Mini Build Server Setup
#
# Run this on the Mac Mini to set up everything needed for the
# automated build runner. Interactive — prompts for input.
#
# Prerequisites:
#   - macOS with admin access
#   - Developer ID certificate .p12 file (airdrop from your laptop)
#   - GitHub repo access (SSH key or HTTPS credentials)
#
# Usage:
#   bash admin/mac-mini-setup.sh
#

set -e

REPO_URL="git@github.com:mstenkilde/futhark.git"
REPO_DIR="$HOME/futhark"
FUTHARK_DIR="$HOME/.futhark"
CRON_INTERVAL="*/10 * * * *"

echo ""
echo "━━━ Futhark Mac Mini Build Server Setup ━━━"
echo ""

# ── Step 1: Xcode Command Line Tools ─────────────────────────

echo "1. Xcode Command Line Tools"
if xcode-select -p &>/dev/null; then
  echo "   ✓ already installed"
else
  echo "   installing (this may take a few minutes)..."
  xcode-select --install
  echo "   waiting for installation to complete..."
  echo "   press Enter when the installer finishes."
  read -r
fi
echo ""

# ── Step 2: Homebrew + Node.js ────────────────────────────────

echo "2. Node.js"
if command -v node &>/dev/null; then
  NODE_VER=$(node -v)
  echo "   ✓ node $NODE_VER installed"
else
  echo "   installing Homebrew + Node.js..."
  if ! command -v brew &>/dev/null; then
    /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
    eval "$(/opt/homebrew/bin/brew shellenv)"
  fi
  brew install node@22
  echo "   ✓ installed"
fi
echo ""

# ── Step 3: Clone repo ───────────────────────────────────────

echo "3. Repository"
if [ -d "$REPO_DIR/.git" ]; then
  echo "   ✓ already cloned at $REPO_DIR"
  cd "$REPO_DIR" && git pull --quiet
else
  echo "   cloning to $REPO_DIR..."
  git clone "$REPO_URL" "$REPO_DIR"
fi
echo ""

# ── Step 4: Install dependencies ─────────────────────────────

echo "4. Dependencies"
cd "$REPO_DIR"
npm install --quiet 2>/dev/null
echo "   ✓ installed"
echo ""

# ── Step 5: Apple credentials ────────────────────────────────

echo "5. Apple notarization credentials"
ENV_FILE="$REPO_DIR/.env.notarize"
if [ -f "$ENV_FILE" ]; then
  echo "   ✓ .env.notarize already exists"
else
  echo "   creating .env.notarize..."
  echo ""
  read -rp "   Apple ID email: " APPLE_ID
  read -rp "   App-specific password: " APPLE_PASSWORD
  read -rp "   Team ID: " APPLE_TEAM

  cat > "$ENV_FILE" << EOF
APPLE_ID=$APPLE_ID
APPLE_APP_SPECIFIC_PASSWORD=$APPLE_PASSWORD
APPLE_TEAM_ID=$APPLE_TEAM
EOF
  echo "   ✓ saved to $ENV_FILE"
fi
echo ""

# ── Step 6: Developer ID certificate ─────────────────────────

echo "6. Developer ID certificate"
if security find-identity -v -p codesigning 2>/dev/null | grep -q "Developer ID Application"; then
  CERT=$(security find-identity -v -p codesigning 2>/dev/null | grep "Developer ID Application" | head -1)
  echo "   ✓ found: $CERT"
else
  echo "   ⚠ No Developer ID certificate found in Keychain."
  echo ""
  echo "   To fix this:"
  echo "   1. On your laptop: Keychain Access → find 'Developer ID Application'"
  echo "   2. Right-click → Export Items → save as .p12 with a password"
  echo "   3. AirDrop the .p12 to this Mac Mini"
  echo "   4. Double-click the .p12 to import into Keychain"
  echo ""
  echo "   Press Enter once you've imported the certificate (or Ctrl+C to exit and do it later)."
  read -r

  if security find-identity -v -p codesigning 2>/dev/null | grep -q "Developer ID Application"; then
    echo "   ✓ certificate found"
  else
    echo "   ✗ still not found — you'll need to import it before builds will sign"
  fi
fi
echo ""

# ── Step 7: SSH key for kenaz.app ─────────────────────────────

echo "7. SSH key for kenaz.app deployment"
SSH_KEY="$HOME/.ssh/futhark-deploy"
if [ -f "$SSH_KEY" ]; then
  echo "   ✓ key exists at $SSH_KEY"
else
  echo "   generating SSH key..."
  mkdir -p "$HOME/.ssh"
  ssh-keygen -t ed25519 -f "$SSH_KEY" -N '' -q
  echo "   ✓ created $SSH_KEY"
fi

echo ""
echo "   Public key (copy this to kenaz.app's authorized_keys):"
echo ""
echo "   $(cat "${SSH_KEY}.pub")"
echo ""
echo "   Run on your server:"
echo "   echo '$(cat "${SSH_KEY}.pub")' >> ~/.ssh/authorized_keys"
echo ""

# Configure SSH to use this key for kenaz.app
SSH_CONFIG="$HOME/.ssh/config"
if ! grep -q "kenaz.app" "$SSH_CONFIG" 2>/dev/null; then
  cat >> "$SSH_CONFIG" << EOF

Host kenaz.app
  IdentityFile $SSH_KEY
  User deploy
EOF
  echo "   ✓ SSH config updated"
else
  echo "   ✓ SSH config already has kenaz.app entry"
fi
echo ""

# ── Step 8: Create log directory ──────────────────────────────

echo "8. Log directory"
mkdir -p "$FUTHARK_DIR"
echo "   ✓ $FUTHARK_DIR"
echo ""

# ── Step 9: Install cron job ─────────────────────────────────

echo "9. Cron job"
CRON_CMD="$CRON_INTERVAL $REPO_DIR/admin/build-runner.sh >> $FUTHARK_DIR/build-runner.log 2>&1"
if crontab -l 2>/dev/null | grep -q "build-runner.sh"; then
  echo "   ✓ cron job already installed"
else
  (crontab -l 2>/dev/null || true; echo "$CRON_CMD") | crontab -
  echo "   ✓ installed: checks every 10 minutes"
fi
echo ""

# ── Step 10: Prevent sleep ────────────────────────────────────

echo "10. Sleep prevention"
echo "    The Mac Mini should stay awake to run builds."
echo "    Recommended: System Settings → Energy → Prevent automatic sleeping"
echo ""
CURRENT=$(pmset -g | grep -i "sleep" | head -1 || true)
echo "    Current setting: $CURRENT"
echo ""

# ── Done ──────────────────────────────────────────────────────

echo "━━━ Setup complete ━━━"
echo ""
echo "  Repo:        $REPO_DIR"
echo "  Credentials: $ENV_FILE"
echo "  SSH key:     $SSH_KEY"
echo "  Logs:        $FUTHARK_DIR/build-runner.log"
echo "  Cron:        every 10 minutes"
echo ""
echo "  To test a build manually:"
echo "    cd $REPO_DIR && ./deploy.sh all --notarize"
echo ""
echo "  To check the build runner log:"
echo "    tail -f $FUTHARK_DIR/build-runner.log"
echo ""
echo "  To check Apple notarization history:"
echo "    xcrun notarytool history --apple-id \$APPLE_ID --password \$APPLE_APP_SPECIFIC_PASSWORD --team-id \$APPLE_TEAM_ID"
echo ""
