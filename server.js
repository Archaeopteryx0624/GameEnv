// ================================================================
//  GameEnv — Central Express Server
//  Serves shared libs + all game directories
//  Add a new game: drop a folder into /games/, done.
// ================================================================
const express = require('express');
const path    = require('path');
const fs      = require('fs');
const app     = express();
const PORT    = 8080;

const ROOT = __dirname;

// ── Shared libraries (JS, CSS, fonts) ──────────────────────
app.use('/libs', express.static(path.join(ROOT, 'libs')));

// ── Each game folder served under /games/<name> ─────────────
app.use('/games', express.static(path.join(ROOT, 'games')));

// ── Landing page ─────────────────────────────────────────────
app.use('/', express.static(path.join(ROOT, 'public')));

// ── Auto-generate game list for the launcher ─────────────────
app.get('/api/games', (req, res) => {
  const gamesDir = path.join(ROOT, 'games');
  try {
    const games = fs.readdirSync(gamesDir)
      .filter(f => fs.statSync(path.join(gamesDir, f)).isDirectory())
      .map(name => {
        // Try to read a meta.json if it exists
        const metaPath = path.join(gamesDir, name, 'meta.json');
        let meta = { title: name, description: '', icon: '🎮' };
        if (fs.existsSync(metaPath)) {
          try { meta = { ...meta, ...JSON.parse(fs.readFileSync(metaPath)) }; }
          catch(e) {}
        }
        return { name, url: `/games/${name}/`, ...meta };
      });
    res.json(games);
  } catch(e) {
    res.json([]);
  }
});

// ── Fallback: root → launcher ─────────────────────────────────
app.get('/', (req, res) => {
  res.sendFile(path.join(ROOT, 'public', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log('\n  ╔══════════════════════════════════════════════╗');
  console.log('  ║         GameEnv Server Running               ║');
  console.log(`  ║   →  http://localhost:${PORT}                 ║`);
  console.log('  ║                                              ║');
  console.log('  ║   Games available:                           ║');

  const gamesDir = path.join(__dirname, 'games');
  fs.readdirSync(gamesDir)
    .filter(f => fs.statSync(path.join(gamesDir, f)).isDirectory())
    .forEach(g => {
      console.log(`  ║     /games/${g.padEnd(32)}║`);
    });

  console.log('  ╚══════════════════════════════════════════════╝\n');
});
