// ============================================================
//  ships.js — Ship rendering (surface detail + orbit triangles)
// ============================================================

const Ships = (() => {

  // ── Orbit / travel triangle renderer (Pixi Graphics) ──
  // Returns a PIXI.Container with triangle + trail
  function makeOrbitSprite(ship, owner) {
    const tmpl = Data.SHIP_TYPES[ship.type];
    const c    = new PIXI.Container();
    const col  = owner==='player' ? 0x00c8ff : 0xff3355;

    if (tmpl?.isDreadnought) {
      // Dreadnought: larger triangle, bright glow
      _drawTriangle(c, col, 14, 4);
    } else {
      _drawTriangle(c, col, 8, 2.5);
    }

    // Trail (small fading line behind)
    const trail = new PIXI.Graphics();
    trail.lineStyle(1.5, col, 0.35);
    trail.moveTo(0, 6);
    trail.lineTo(0, 22);
    c.addChildAt(trail, 0);
    c._trail = trail;

    c._col = col;
    return c;
  }

  function _drawTriangle(container, col, size, glow) {
    const g = new PIXI.Graphics();
    g.lineStyle(1, col, 0.9);
    g.beginFill(col, 0.25);
    g.moveTo(0, -size);
    g.lineTo(size*0.7, size*0.7);
    g.lineTo(-size*0.7, size*0.7);
    g.closePath();
    g.endFill();
    // Glow core
    g.beginFill(col, 0.7);
    g.drawCircle(0, 0, glow);
    g.endFill();
    container.addChild(g);
    container._gfx = g;
  }

  // Rotate triangle to face direction of travel
  function orientTriangle(sprite, angle) {
    if (sprite) sprite.rotation = angle + Math.PI/2;
  }

  // Update trail direction
  function updateTrail(sprite, dx, dy) {
    if (!sprite._trail) return;
    const len = 18;
    const nx = dx ? dx/Math.abs(dx) : 0;
    const ny = dy ? dy/Math.abs(dy) : 0;
    sprite._trail.clear();
    sprite._trail.lineStyle(1.5, sprite._col, 0.35);
    sprite._trail.moveTo(0, 0);
    sprite._trail.lineTo(-nx*len, -ny*len);
  }

  // Warp effect: stretch the triangle horizontally
  function applyWarp(sprite, active) {
    if (!sprite) return;
    sprite.scale.x = active ? 0.4 : 1.0;
    sprite.scale.y = active ? 2.2 : 1.0;
    if (sprite._gfx) sprite._gfx.alpha = active ? 0.5 : 1.0;
  }

  // ── Surface canvas drawing (SVG-like shapes) ──────────
  // All draw functions: ctx, x, y, size, color, hp ratio

  function drawSurface(ctx, ship, x, y, size, owner) {
    const col = owner==='player' ? '#00c8ff' : '#ff3355';
    const dim = owner==='player' ? '#004466' : '#440011';
    const hp  = (ship.hp||1)/(ship.maxHp||1);

    ctx.save();
    ctx.translate(x, y);

    switch(ship.type) {
      case 'fighter':       _drawFighter(ctx, size, col, dim); break;
      case 'destroyer':     _drawDestroyer(ctx, size, col, dim); break;
      case 'battle_cruiser':_drawBattleCruiser(ctx, size, col, dim); break;
      case 'dreadnought':   _drawDreadnought(ctx, size, col, dim); break;
      case 'watchdog':      _drawWatchdog(ctx, size, col, dim); break;
      case 'transporter':   _drawTransporter(ctx, size, col, dim); break;
      case 'probe':         _drawProbe(ctx, size, col, dim); break;
      default:              _drawFighter(ctx, size, col, dim);
    }

    // HP bar above ship
    const bw = size*2.5, bh = 3;
    ctx.fillStyle = '#0a1428';
    ctx.fillRect(-bw/2, -size-10, bw, bh);
    ctx.fillStyle = hp > 0.5 ? '#00e5a0' : hp > 0.25 ? '#ffc844' : '#ff3355';
    ctx.fillRect(-bw/2, -size-10, bw*hp, bh);

    ctx.restore();
  }

  function _drawFighter(ctx, s, col, dim) {
    // Sleek fuselage
    ctx.fillStyle = dim;
    ctx.beginPath(); ctx.ellipse(0, 0, s*0.25, s*0.7, 0, 0, Math.PI*2); ctx.fill();
    // Wings
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.moveTo(0,-s*0.3); ctx.lineTo(s*0.9,-s*0.1); ctx.lineTo(s*0.4,s*0.4); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(0,-s*0.3); ctx.lineTo(-s*0.9,-s*0.1); ctx.lineTo(-s*0.4,s*0.4); ctx.closePath(); ctx.fill();
    // Single gun barrel
    ctx.strokeStyle = col; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0,-s*0.7); ctx.lineTo(0,-s*1.1); ctx.stroke();
    // Engine glow
    ctx.fillStyle = '#ff8800';
    ctx.beginPath(); ctx.ellipse(0, s*0.7, s*0.15, s*0.25, 0, 0, Math.PI*2); ctx.fill();
  }

  function _drawDestroyer(ctx, s, col, dim) {
    // Wider hull
    ctx.fillStyle = dim;
    ctx.beginPath(); ctx.ellipse(0, 0, s*0.35, s*0.8, 0, 0, Math.PI*2); ctx.fill();
    // Side wings
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.moveTo(0,-s*0.4); ctx.lineTo(s*1.1,s*0.1); ctx.lineTo(s*0.5,s*0.6); ctx.lineTo(0,s*0.3); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(0,-s*0.4); ctx.lineTo(-s*1.1,s*0.1); ctx.lineTo(-s*0.5,s*0.6); ctx.lineTo(0,s*0.3); ctx.closePath(); ctx.fill();
    // Twin guns
    ctx.strokeStyle = col; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(s*0.2,-s*0.8); ctx.lineTo(s*0.2,-s*1.2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-s*0.2,-s*0.8); ctx.lineTo(-s*0.2,-s*1.2); ctx.stroke();
    // Dual engine glow
    ctx.fillStyle = '#ff8800';
    ctx.beginPath(); ctx.ellipse(s*0.2, s*0.85, s*0.12, s*0.2, 0, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(-s*0.2, s*0.85, s*0.12, s*0.2, 0, 0, Math.PI*2); ctx.fill();
  }

  function _drawBattleCruiser(ctx, s, col, dim) {
    // Wide armored hull
    ctx.fillStyle = dim;
    ctx.beginPath(); ctx.ellipse(0, 0, s*0.5, s*0.9, 0, 0, Math.PI*2); ctx.fill();
    // Heavy swept wings
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.moveTo(0,-s*0.5); ctx.lineTo(s*1.3,s*0.2); ctx.lineTo(s*0.8,s*0.8); ctx.lineTo(0,s*0.4); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(0,-s*0.5); ctx.lineTo(-s*1.3,s*0.2); ctx.lineTo(-s*0.8,s*0.8); ctx.lineTo(0,s*0.4); ctx.closePath(); ctx.fill();
    // Siege cannon (large central barrel)
    ctx.strokeStyle = '#ffc844'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(0,-s*0.9); ctx.lineTo(0,-s*1.5); ctx.stroke();
    ctx.fillStyle = '#ffc844';
    ctx.beginPath(); ctx.arc(0,-s*0.9,s*0.12,0,Math.PI*2); ctx.fill();
    // Triple engine glow
    ctx.fillStyle = '#ff6600';
    [-s*0.3,0,s*0.3].forEach(ox=>{
      ctx.beginPath(); ctx.ellipse(ox, s*0.95, s*0.1, s*0.18, 0, 0, Math.PI*2); ctx.fill();
    });
  }

  function _drawDreadnought(ctx, s, col, dim) {
    // Massive hull
    ctx.fillStyle = dim;
    ctx.beginPath(); ctx.ellipse(0, 0, s*0.7, s*1.1, 0, 0, Math.PI*2); ctx.fill();
    // Armor plating lines
    ctx.strokeStyle = col; ctx.lineWidth = 1; ctx.globalAlpha=0.4;
    for (let i=-3;i<=3;i++) { ctx.beginPath(); ctx.moveTo(i*s*0.2,-s*0.9); ctx.lineTo(i*s*0.2,s*0.9); ctx.stroke(); }
    ctx.globalAlpha=1;
    // Huge wings
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.moveTo(0,-s*0.8); ctx.lineTo(s*1.8,s*0.3); ctx.lineTo(s*1.2,s*1.0); ctx.lineTo(0,s*0.5); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(0,-s*0.8); ctx.lineTo(-s*1.8,s*0.3); ctx.lineTo(-s*1.2,s*1.0); ctx.lineTo(0,s*0.5); ctx.closePath(); ctx.fill();
    // Positron beam emitter (glowing ring at nose)
    ctx.strokeStyle = '#aa00ff'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(0,-s*1.1,s*0.2,0,Math.PI*2); ctx.stroke();
    ctx.fillStyle = '#cc44ff'; ctx.globalAlpha=0.6;
    ctx.beginPath(); ctx.arc(0,-s*1.1,s*0.1,0,Math.PI*2); ctx.fill();
    ctx.globalAlpha=1;
    // Four engine banks
    ctx.fillStyle = '#ff4400';
    [-s*0.5,-s*0.18,s*0.18,s*0.5].forEach(ox=>{
      ctx.beginPath(); ctx.ellipse(ox, s*1.15, s*0.12, s*0.22, 0, 0, Math.PI*2); ctx.fill();
    });
  }

  function _drawWatchdog(ctx, s, col, dim) {
    // Hexagonal station body
    ctx.fillStyle = dim;
    _hexPath(ctx, 0, 0, s*0.9); ctx.fill();
    ctx.strokeStyle = col; ctx.lineWidth = 2;
    _hexPath(ctx, 0, 0, s*0.9); ctx.stroke();
    // Central hub
    ctx.fillStyle = col; ctx.globalAlpha=0.5;
    ctx.beginPath(); ctx.arc(0,0,s*0.3,0,Math.PI*2); ctx.fill();
    ctx.globalAlpha=1;
    // 6 gun turrets at hex vertices
    ctx.fillStyle = col;
    for (let i=0;i<6;i++) {
      const a=i*Math.PI/3;
      const tx=Math.cos(a)*s*0.9, ty=Math.sin(a)*s*0.9;
      ctx.beginPath(); ctx.arc(tx,ty,s*0.12,0,Math.PI*2); ctx.fill();
      ctx.strokeStyle='#ffffff'; ctx.lineWidth=1;
      ctx.beginPath(); ctx.moveTo(tx,ty); ctx.lineTo(tx+Math.cos(a)*s*0.25, ty+Math.sin(a)*s*0.25); ctx.stroke();
    }
    // Rotating scan ring
    ctx.strokeStyle=col; ctx.lineWidth=1; ctx.globalAlpha=0.3;
    ctx.beginPath(); ctx.arc(0,0,s*1.2,0,Math.PI*2); ctx.stroke();
    ctx.globalAlpha=1;
  }

  function _drawTransporter(ctx, s, col, dim) {
    // Boxy cargo hull
    ctx.fillStyle = dim;
    ctx.fillRect(-s*0.5,-s*0.9,s,s*1.8);
    // Cargo pods (3 stacked)
    ctx.fillStyle = col; ctx.globalAlpha=0.5;
    [-s*0.55,s*0.55].forEach(ox=>{
      ctx.fillRect(ox,-s*0.6,s*0.3,s*1.2);
    });
    ctx.globalAlpha=1;
    // Robot bay indicator
    ctx.strokeStyle='#ffc844'; ctx.lineWidth=1;
    ctx.strokeRect(-s*0.3,-s*0.3,s*0.6,s*0.6);
    // Small engine
    ctx.fillStyle='#ff6600';
    ctx.beginPath(); ctx.ellipse(0,s*0.95,s*0.2,s*0.15,0,0,Math.PI*2); ctx.fill();
  }

  function _hexPath(ctx, x, y, r) {
    ctx.beginPath();
    for (let i=0;i<6;i++) {
      const a=i*Math.PI/3-Math.PI/6;
      i===0 ? ctx.moveTo(x+r*Math.cos(a),y+r*Math.sin(a))
            : ctx.lineTo(x+r*Math.cos(a),y+r*Math.sin(a));
    }
    ctx.closePath();
  }

  function _drawProbe(ctx, s, col, dim) {
    // Small spherical probe with antenna and solar panels
    // Body — small sphere
    ctx.fillStyle = dim;
    ctx.beginPath(); ctx.arc(0, 0, s*0.35, 0, Math.PI*2); ctx.fill();
    ctx.strokeStyle = col; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(0, 0, s*0.35, 0, Math.PI*2); ctx.stroke();
    // Antenna (thin spike upward)
    ctx.strokeStyle = col; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, -s*0.35); ctx.lineTo(0, -s*0.9); ctx.stroke();
    ctx.beginPath(); ctx.arc(0, -s*0.9, 2, 0, Math.PI*2);
    ctx.fillStyle = '#ffcc44'; ctx.fill();
    // Solar panels (horizontal bars left and right)
    ctx.fillStyle = col;
    ctx.globalAlpha = 0.7;
    ctx.fillRect(-s*0.9, -s*0.1, s*0.5, s*0.2);  // left panel
    ctx.fillRect( s*0.4, -s*0.1, s*0.5, s*0.2);  // right panel
    ctx.globalAlpha = 1;
    // Scan ring (faint circle)
    ctx.strokeStyle = col; ctx.lineWidth = 0.5; ctx.globalAlpha = 0.3;
    ctx.beginPath(); ctx.arc(0, 0, s*1.2, 0, Math.PI*2); ctx.stroke();
    ctx.globalAlpha = 1;
  }

  return { makeOrbitSprite, orientTriangle, updateTrail, applyWarp, drawSurface };
})();
