#!/data/data/com.termux/files/usr/bin/bash
# Usage: bash add-game.sh <game-name> [/path/to/game.html]
# Creates a new game slot under ~/GameEnv/games/

NAME="$1"
SRC="$2"
GENV=~/GameEnv

if [ -z "$NAME" ]; then
  echo "Usage: bash add-game.sh <game-name> [path/to/index.html]"
  exit 1
fi

mkdir -p "$GENV/games/$NAME"

if [ -n "$SRC" ] && [ -f "$SRC" ]; then
  cp "$SRC" "$GENV/games/$NAME/index.html"
  echo "✓ Copied $SRC → games/$NAME/index.html"
else
  echo "⚠ No source file given. Drop your index.html into:"
  echo "  $GENV/games/$NAME/"
fi

# Patch CDN → local
if [ -f "$GENV/games/$NAME/index.html" ]; then
  sed -i \
    -e 's|https://cdnjs.cloudflare.com/ajax/libs/gsap/[^"]*gsap.min.js|/libs/js/gsap.min.js|g' \
    -e 's|https://cdnjs.cloudflare.com/ajax/libs/howler/[^"]*howler.min.js|/libs/js/howler.min.js|g' \
    -e 's|https://cdnjs.cloudflare.com/ajax/libs/font-awesome/[^"]*all.min.css|/libs/css/fa.min.css|g' \
    "$GENV/games/$NAME/index.html"
  echo "✓ CDN links patched to local /libs"
fi

# Write default meta.json
cat > "$GENV/games/$NAME/meta.json" << META
{
  "title": "$NAME",
  "description": "Add a description in games/$NAME/meta.json",
  "icon": "🎮"
}
META

echo "✓ Game slot created: games/$NAME/"
echo "  Open at: http://localhost:8080/games/$NAME/"
