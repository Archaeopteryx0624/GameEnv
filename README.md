# GameEnv 🎮

A local game server and collection of browser-based games built entirely in vanilla JavaScript — developed and tested on Android via Termux.

## Games

| Game | Folder | Description |
|---|---|---|
| Stellar Conquest | `games/stg` | Real-time mobile space strategy. 18-file modular architecture with fleet mechanics, enemy AI, and multi-system galaxy map |
| Stellar Dominion | `games/stellar-dominion` | Canvas-based space strategy expanded to a multi-system galaxy. Predecessor to Stellar Conquest |
| Stellar Dominion 1 | `games/STDOM1` | First iteration of the Stellar Dominion series |
| Stellar Dominion 2 | `games/STDOM2` | Second iteration with expanded mechanics |
| 0x City | `games/Ox-city` | 3D GTA-style open world with merchant NPCs, cash wallet, and physics-driven gameplay |
| Brick City | `games/brick-city` | City builder with brick-by-brick construction mechanics |
| City Builder | `games/city-builder` | Isometric city simulator |
| 2D Builder | `games/2d-builder` | 2D construction and world-building game |
| Killer Bean | `games/killerbean` | Action game based on the Killer Bean universe |

More games added regularly.

## Stack

- Vanilla JavaScript — no frameworks
- Pixi.js v7 — for games requiring sprite rendering
- Three.js — for 3D games (0x City)
- Canvas API — for 2D games
- Node.js + Express — local game server
- Locally served libraries via `libs/`

## Running Locally

```bash
# Install dependencies
npm install

# Start the game server
node server.js

# Open in browser
# http://localhost:8080
```

Games are served from the `public/` and `games/` directories. The `libs/` folder contains locally hosted copies of Pixi.js, Three.js, and other libraries so everything works offline and in Termux without CDN access.

## Adding a New Game

```bash
bash add-game.sh
```

The script scaffolds a new game directory and registers it with the server.

## Requirements

- Node.js 18+
- Any modern browser (tested on Android Chrome via Termux)
- No internet required after initial setup — all libraries are local

---

Built by [Archaeopteryx](https://github.com/Archaeopteryx0624) — from a phone, in Termux.
