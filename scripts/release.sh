#!/usr/bin/env bash
set -euo pipefail

# Release script for Anki Spelling Portal
# Usage: ./scripts/release.sh <version>
# Example: ./scripts/release.sh 1.0.0

VERSION="${1:-}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
RELEASES_DIR="$PROJECT_DIR/releases"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

info()  { echo -e "${BLUE}[INFO]${NC} $*"; }
ok()    { echo -e "${GREEN}[OK]${NC}   $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $*"; }
error() { echo -e "${RED}[ERR]${NC}  $*" >&2; exit 1; }

# --- Validate arguments ---
if [[ -z "$VERSION" ]]; then
  echo "Usage: $0 <version>"
  echo "Example: $0 1.0.0"
  exit 1
fi

if ! [[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  error "Invalid version format '$VERSION'. Expected semver (e.g., 1.0.0)"
fi

cd "$PROJECT_DIR"

# --- Check git state (ignore .claude/settings.local.json which accumulates tool permissions) ---
DIRTY_FILES=$(git status --porcelain | grep -v '\.claude/settings\.local\.json' || true)
if [[ -n "$DIRTY_FILES" ]]; then
  error "Git working tree is not clean. Commit or stash changes first.\n$DIRTY_FILES"
fi

if git tag -l "v$VERSION" | grep -q "v$VERSION"; then
  error "Tag v$VERSION already exists."
fi

info "Releasing v$VERSION"

# --- Step 1: Update package.json version ---
info "Updating package.json version to $VERSION..."
npm version "$VERSION" --no-git-tag-version --allow-same-version > /dev/null
ok "package.json version set to $VERSION"

# --- Step 2: Build Docker image ---
info "Building Docker image..."
docker build -t anki-spelling-portal:"v$VERSION" -t anki-spelling-portal:latest . --quiet
ok "Docker image built: anki-spelling-portal:v$VERSION + :latest"

# --- Step 3: Package skill tarball ---
info "Packaging skill tarball..."
mkdir -p "$RELEASES_DIR"

TARBALL_NAME="anki-enrich-skill-v$VERSION"
STAGING_DIR=$(mktemp -d)
SKILL_STAGING="$STAGING_DIR/$TARBALL_NAME"

mkdir -p "$SKILL_STAGING"
cp -r skill/config.json skill/scripts skill/README.md "$SKILL_STAGING/"
cp .claude/skills/anki-enrich/SKILL.md "$SKILL_STAGING/"

tar -czf "$RELEASES_DIR/$TARBALL_NAME.tar.gz" -C "$STAGING_DIR" "$TARBALL_NAME"
rm -rf "$STAGING_DIR"
ok "Skill tarball: releases/$TARBALL_NAME.tar.gz"

# --- Step 4: Git commit + tag ---
info "Creating git commit and tag..."
git add package.json
if git diff --cached --quiet; then
  info "package.json unchanged (already at v$VERSION), tagging current HEAD"
else
  git commit -m "Release v$VERSION" > /dev/null
fi
git tag -a "v$VERSION" -m "Release v$VERSION"
ok "Tagged v$VERSION"

# --- Step 5: Push tag to trigger CI build ---
info "Pushing tag to origin..."
git push origin master --tags > /dev/null 2>&1
ok "Pushed to origin (CI will build Docker Hub image)"

# --- Summary ---
echo ""
echo -e "${GREEN}=== Release v$VERSION complete ===${NC}"
echo ""
echo "Artifacts:"
echo "  Docker image:  anki-spelling-portal:v$VERSION (local)"
echo "  CI image:      gykpro/anki-spelling-portal:$VERSION (building...)"
echo "  Skill tarball: releases/$TARBALL_NAME.tar.gz"
echo "  Git tag:       v$VERSION"
echo ""
echo "CI build: https://github.com/gykpro/anki-spelling-portal/actions"
