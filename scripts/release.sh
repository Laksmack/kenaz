#!/bin/bash
# scripts/release.sh
# Run locally to bump version, tag, and push.
# The server sync.sh picks it up within 20 minutes.
#
# Usage:
#   ./scripts/release.sh patch   # 0.2.0 -> 0.2.1
#   ./scripts/release.sh minor   # 0.2.0 -> 0.3.0
#   ./scripts/release.sh major   # 0.2.0 -> 1.0.0

set -e

BUMP=${1:-patch}

# Bump version in root package.json
NEW_VERSION=$(node -e "
  const pkg = require('./package.json');
  const [major, minor, patch] = pkg.version.split('.').map(Number);
  const bumps = { major: [major+1,0,0], minor: [major,minor+1,0], patch: [major,minor,patch+1] };
  console.log(bumps['$BUMP'].join('.'));
")

echo "Bumping to v$NEW_VERSION..."

# Update package.json
node -e "
  const fs = require('fs');
  const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  pkg.version = '$NEW_VERSION';
  fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');
"

# Update version in web/index.html
sed -i '' "s/Futhark Suite · v[0-9.]*/Futhark Suite · v$NEW_VERSION/g" web/index.html
sed -i '' "s/v[0-9.]*/v$NEW_VERSION/g" web/index.html

echo "Updated package.json and web/index.html"

# Commit and tag
git add package.json web/index.html
git commit -m "release: v$NEW_VERSION"
git tag "v$NEW_VERSION"
git push origin main --tags

echo ""
echo "Done. v$NEW_VERSION tagged and pushed."
echo "Server will pick it up within 20 minutes."
echo "Live at: https://kenaz.app/releases/latest.json"
