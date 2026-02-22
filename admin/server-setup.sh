#!/bin/bash
#
# Futhark Server Setup — kenaz.app (Ubuntu)
#
# Run this on the Ubuntu server to set up the release directory
# structure and nginx config for serving app updates.
#
# Prerequisites:
#   - nginx installed
#   - Root/sudo access
#
# Usage:
#   ssh deploy@kenaz.app 'bash -s' < admin/server-setup.sh
#

set -e

RELEASE_ROOT="/var/www/kenaz.app/releases"
APPS=(kenaz raido dagaz laguz)

echo "━━━ Setting up Futhark release server ━━━"
echo ""

# Create release directories
for app in "${APPS[@]}"; do
  echo "  creating $RELEASE_ROOT/$app/"
  sudo mkdir -p "$RELEASE_ROOT/$app"
done
sudo chown -R www-data:www-data "$RELEASE_ROOT"
sudo chmod -R 755 "$RELEASE_ROOT"

# Allow deploy user to write
if id "deploy" &>/dev/null; then
  sudo usermod -aG www-data deploy
  sudo chmod -R g+w "$RELEASE_ROOT"
  echo "  deploy user added to www-data group"
fi

echo ""
echo "━━━ Nginx config ━━━"
echo ""
echo "Add this to your nginx server block for kenaz.app:"
echo ""
cat <<'NGINX'
    # Futhark app releases
    location /releases/ {
        alias /var/www/kenaz.app/releases/;
        autoindex off;
        types {
            application/octet-stream dmg;
            application/zip zip;
            text/yaml yml;
        }
        add_header Cache-Control "no-cache";
    }
NGINX

echo ""
echo "━━━ SSH key ━━━"
echo ""
echo "On the Mac Mini, generate a key (if not done):"
echo "  ssh-keygen -t ed25519 -f ~/.ssh/futhark-deploy -N ''"
echo ""
echo "Then copy it to this server:"
echo "  ssh-copy-id -i ~/.ssh/futhark-deploy deploy@kenaz.app"
echo ""

echo "━━━ Expected file structure ━━━"
echo ""
for app in "${APPS[@]}"; do
  echo "  $RELEASE_ROOT/$app/"
  echo "    AppName-X.Y.Z-arm64.dmg"
  echo "    AppName-X.Y.Z-arm64-mac.zip"
  echo "    latest-mac.yml"
  echo ""
done

echo "━━━ Done ━━━"
