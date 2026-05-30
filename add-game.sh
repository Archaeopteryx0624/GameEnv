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
    `# --- Animation & UI ---` \
    -e 's|https://cdnjs.cloudflare.com/ajax/libs/gsap/[^"]*gsap\.min\.js|/libs/js/gsap.min.js|g' \
    -e 's|https://cdnjs.cloudflare.com/ajax/libs/gsap/[^"]*ScrollTrigger\.min\.js|/libs/js/ScrollTrigger.min.js|g' \
    -e 's|https://cdnjs.cloudflare.com/ajax/libs/animejs/[^"]*anime\.min\.js|/libs/js/anime.min.js|g' \
    -e 's|https://cdnjs.cloudflare.com/ajax/libs/tween.js/[^"]*tween\.min\.js|/libs/js/tween.min.js|g' \
    `# --- 2D & 3D Rendering ---` \
    -e 's|https://cdnjs.cloudflare.com/ajax/libs/pixi.js/[^"]*pixi\.min\.js|/libs/js/pixi.min.js|g' \
    -e 's|https://cdn.jsdelivr.net/npm/pixi\.js[^"]*|/libs/js/pixi.min.js|g' \
    -e 's|https://cdnjs.cloudflare.com/ajax/libs/three\.js/[^"]*three\.min\.js|/libs/js/three.min.js|g' \
    -e 's|https://cdn.jsdelivr.net/npm/three[^"]*three\.min\.js|/libs/js/three.min.js|g' \
    -e 's|https://[^"]*OrbitControls\.js|/libs/js/OrbitControls.js|g' \
    -e 's|https://[^"]*GLTFLoader\.js|/libs/js/GLTFLoader.js|g' \
    -e 's|https://cdnjs.cloudflare.com/ajax/libs/matter-js/[^"]*matter\.min\.js|/libs/js/matter.min.js|g' \
    -e 's|https://cdnjs.cloudflare.com/ajax/libs/cannon\.js/[^"]*cannon\.min\.js|/libs/js/cannon.min.js|g' \
    `# --- Audio ---` \
    -e 's|https://cdnjs.cloudflare.com/ajax/libs/howler/[^"]*howler\.min\.js|/libs/js/howler.min.js|g' \
    -e 's|https://cdn.jsdelivr.net/npm/howler[^"]*|/libs/js/howler.min.js|g' \
    `# --- UI Frameworks & Icons ---` \
    -e 's|https://cdnjs.cloudflare.com/ajax/libs/font-awesome/[^"]*all\.min\.css|/libs/css/fa.min.css|g' \
    -e 's|https://cdn.jsdelivr.net/npm/bootstrap[^"]*bootstrap\.min\.css|/libs/css/bootstrap.min.css|g' \
    -e 's|https://cdn.jsdelivr.net/npm/bootstrap[^"]*bootstrap\.min\.js|/libs/js/bootstrap.min.js|g' \
    -e 's|https://cdn.tailwindcss\.com[^"]*|/libs/js/tailwind.min.js|g' \
    `# --- Utility Libraries ---` \
    -e 's|https://cdnjs.cloudflare.com/ajax/libs/lodash\.js/[^"]*lodash\.min\.js|/libs/js/lodash.min.js|g' \
    -e 's|https://cdnjs.cloudflare.com/ajax/libs/socket\.io/[^"]*socket\.io\.min\.js|/libs/js/socket.io.min.js|g' \
    -e 's|https://cdn.jsdelivr.net/npm/socket\.io-client[^"]*|/libs/js/socket.io.min.js|g' \
    -e 's|https://cdnjs.cloudflare.com/ajax/libs/Stats\.js/[^"]*Stats\.min\.js|/libs/js/stats.min.js|g' \
    -e 's|https://cdnjs.cloudflare.com/ajax/libs/dat-gui/[^"]*dat\.gui\.min\.js|/libs/js/dat.gui.min.js|g' \
    `# --- Google Fonts ---` \
    -e 's|https://fonts\.googleapis\.com/css2?[^"]*|/libs/css/fonts.css|g' \
    -e 's|https://fonts\.gstatic\.com[^"]*||g' \
    "$GENV/games/$NAME/index.html"
  echo "✓ CDN links patched to local /libs"
  echo ""
  echo "  Make sure these files exist in ~/GameEnv/libs/:"
  echo "    libs/js/   — .js files"
  echo "    libs/css/  — .css and font files"
fi

# Write default meta.json
cat > "$GENV/games/$NAME/meta.json" << META
{
  "title": "$NAME",
  "description": "Add a description in games/$NAME/meta.json",
  "icon": "🎮"
}
META

echo ""
echo "✓ Game slot created: games/$NAME/"
echo "  Open at: http://localhost:8080/games/$NAME/"
  "title": "$NAME",
  "description": "Add a description in games/$NAME/meta.json",
  "icon": "🎮"
}
META

echo "✓ Game slot created: games/$NAME/"
echo "  Open at: http://localhost:8080/games/$NAME/"
