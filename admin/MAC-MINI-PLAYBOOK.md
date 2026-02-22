# Futhark Mac Mini Build Server — Setup Playbook

## What this does

Turns this Mac Mini into an automated build server that:
1. Checks GitHub every 10 minutes for new commits
2. Builds, signs, and notarizes all Futhark apps (Kenaz, Raido, Laguz, Dagaz)
3. Uploads the signed DMGs to kenaz.app for distribution

## Quick Start

Open Terminal and run:

```bash
# 1. Clone the repo
git clone git@github.com:Laksmack/kenaz.git ~/futhark

# 2. Run the setup wizard (does everything)
cd ~/futhark && bash admin/mac-mini-setup.sh
```

The wizard walks you through all the steps interactively.

## Manual Steps (if you prefer)

### 1. Install Xcode Command Line Tools
```bash
xcode-select --install
```

### 2. Install Node.js
```bash
# Install Homebrew first if needed
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
eval "$(/opt/homebrew/bin/brew shellenv)"

brew install node@22
```

### 3. Clone and install
```bash
git clone git@github.com:Laksmack/kenaz.git ~/futhark
cd ~/futhark
npm install
```

### 4. Import the Developer ID certificate

On your laptop:
1. Open **Keychain Access**
2. Find **Developer ID Application: MARTIN STENKILDE**
3. Right-click → **Export Items** → save as `.p12` with a password
4. **AirDrop** the `.p12` to this Mac Mini
5. **Double-click** the `.p12` on the Mac Mini to import

Verify it worked:
```bash
security find-identity -v -p codesigning
# Should show: Developer ID Application: MARTIN STENKILDE (DDZS7WM362)
```

### 5. Apple notarization credentials

```bash
cat > ~/futhark/.env.notarize << 'EOF'
APPLE_ID=martin@kanon.net
APPLE_APP_SPECIFIC_PASSWORD=eivs-tpvh-wmav-gppk
APPLE_TEAM_ID=DDZS7WM362
EOF
```

### 6. SSH key for kenaz.app

```bash
ssh-keygen -t ed25519 -f ~/.ssh/futhark-deploy -N ''

# Add to SSH config
cat >> ~/.ssh/config << 'EOF'

Host kenaz.app
  IdentityFile ~/.ssh/futhark-deploy
  User deploy
EOF

# Copy key to server (you'll need the server password once)
ssh-copy-id -i ~/.ssh/futhark-deploy deploy@kenaz.app
```

### 7. Install the cron job

```bash
(crontab -l 2>/dev/null; echo '*/10 * * * * ~/futhark/admin/build-runner.sh >> ~/.futhark/build-runner.log 2>&1') | crontab -
```

### 8. Prevent sleep

Go to **System Settings → Energy** and enable:
- **Prevent automatic sleeping when the display is off**

## Day-to-Day

### Check the build log
```bash
tail -f ~/.futhark/build-runner.log
```

### Run a build manually
```bash
cd ~/futhark && ./deploy.sh all --notarize
```

### Check Apple notarization status
```bash
source ~/futhark/.env.notarize
xcrun notarytool history --apple-id $APPLE_ID --password $APPLE_APP_SPECIFIC_PASSWORD --team-id $APPLE_TEAM_ID
```

### Update the build runner itself
The build runner does `git pull` automatically, so any changes you push to the repo (including changes to the build scripts) are picked up on the next run.
