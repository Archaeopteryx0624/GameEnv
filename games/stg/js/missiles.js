// ============================================================
//  missiles.js — Missile system
//  Targets tracked by ID (ship/planet), not screen coords.
//  World coords only used for visual trail rendering.
// ============================================================

const Missiles = (() => {

  let active = [];
  let idCounter = 0;
  const _coords = {}; // key → {x,y} for visual rendering only

  // ── Fire ─────────────────────────────────────────────
  // srcPlanet: planet obj (needs _worldX/_worldY for trail start, or defaults)
  // targetObj: planet|ship obj — tracked by ID, not coords
  // targetType: 'planet'|'ship'|'watchdog'
  function fire(srcPlanet, targetObj, targetType, owner) {
    if ((srcPlanet.missileStock || 0) < 1) return false;
    srcPlanet.missileStock--;

    // Build stable target key for coord lookup
    const targetKey = _makeKey(targetObj, targetType);

    active.push({
      id: ++idCounter,
      // Visual start position — use stored world coords or centre of screen
      x: srcPlanet._worldX || 400,
      y: srcPlanet._worldY || 300,
      targetObj,
      targetType,
      targetKey,
      owner,
      trail: [],
      damage: 130,
      speed: 3.8,
      _arrived: false,
    });
    return true;
  }

  function _makeKey(obj, type) {
    if (!obj) return '';
    if (type === 'ship' || type === 'watchdog') return 'ship:' + obj.id;
    // Planet — stored as planet:sysId:pIdx
    if (obj._sysId != null && obj._pIdx != null)
      return 'planet:' + obj._sysId + ':' + obj._pIdx;
    return 'planet:unknown';
  }

  // ── Coord registration (called each frame by system view) ─
  function registerCoord(key, x, y) { _coords[key] = { x, y }; }
  function clearCoords() { for (const k in _coords) delete _coords[k]; }

  // ── Update (called per frame) ─────────────────────────
  function update() {
    active = active.filter(ms => {
      // Look up current visual position of target
      // Fall back to last known _worldX/_worldY on the target object itself
      const stored = _coords[ms.targetKey];
      const tObj   = ms.targetObj;
      const tx = stored?.x ?? tObj?._worldX ?? ms.x;
      const ty = stored?.y ?? tObj?._worldY ?? ms.y;

      // Update target's _worldX/_worldY from coords if available
      if (stored && tObj) { tObj._worldX = stored.x; tObj._worldY = stored.y; }

      const dx = tx - ms.x, dy = ty - ms.y;
      const dist = Math.hypot(dx, dy);

      ms.trail.push({ x: ms.x, y: ms.y });
      if (ms.trail.length > 18) ms.trail.shift();

      // Impact when close enough OR when target is in a different system
      // (missile does damage regardless of visual position)
      if (dist < 14 || _targetDefeated(ms)) {
        _impact(ms);
        return false;
      }

      // Move toward target — if no visual coords available just advance
      // toward last known position so missile still travels somewhere
      if (dist > 0) {
        ms.x += (dx / dist) * ms.speed;
        ms.y += (dy / dist) * ms.speed;
      } else {
        _impact(ms);
        return false;
      }
      return true;
    });
  }

  function _targetDefeated(ms) {
    // If target ship/watchdog is dead (HP 0), impact immediately
    if (ms.targetType === 'ship' || ms.targetType === 'watchdog') {
      return !ms.targetObj || ms.targetObj.hp <= 0;
    }
    return false;
  }

  // ── Impact ────────────────────────────────────────────
  function _impact(ms) {
    const tgt = ms.targetObj;
    if (!tgt) return;

    if (ms.targetType === 'planet') {
      // Damage shield gen
      const shieldIdx = (tgt.buildings || []).findIndex(b => b.key === 'shield_gen');
      if (shieldIdx >= 0 && Math.random() < 0.6) tgt.buildings.splice(shieldIdx, 1);
      // Hit docked ship
      const docked = (tgt.ships || []).filter(s => s.state === 'dock');
      if (docked.length) {
        const victim = docked[Math.floor(Math.random() * docked.length)];
        victim.hp = Math.max(0, victim.hp - ms.damage);
        if (victim.hp <= 0) tgt.ships = tgt.ships.filter(s => s.id !== victim.id);
      }
      State.notify('missile_impact', { target: tgt, type: 'planet' });

    } else if (ms.targetType === 'watchdog') {
      tgt.hp = Math.max(0, (tgt.hp || 0) - ms.damage * 1.5);
      if (tgt.hp <= 0) {
        _removeShip(tgt.id);
        State.notify('missile_impact', { target: tgt, type: 'watchdog' });
      }

    } else if (ms.targetType === 'ship') {
      tgt.hp = Math.max(0, (tgt.hp || 0) - ms.damage);
      if (tgt.hp <= 0) {
        _removeShip(tgt.id);
        State.notify('missile_impact', { target: tgt, type: 'ship' });
      }
    }

    UI.toast(`💥 Missile impact — ${tgt.name || ms.targetType}`, '', 1800);
  }

  function _removeShip(shipId) {
    for (const sys of State.get().systems)
      for (const pl of sys.planets)
        pl.ships = (pl.ships || []).filter(s => s.id !== shipId);
    State.get().travelingFleets.forEach(tf => {
      tf.ships = tf.ships.filter(s => s.id !== shipId);
    });
  }

  // ── Draw (canvas 2d overlay) ──────────────────────────
  function draw(ctx) {
    active.forEach(ms => {
      // Trail
      for (let i = 1; i < ms.trail.length; i++) {
        const a = (i / ms.trail.length) * 0.75;
        ctx.beginPath();
        ctx.moveTo(ms.trail[i-1].x, ms.trail[i-1].y);
        ctx.lineTo(ms.trail[i].x,   ms.trail[i].y);
        ctx.strokeStyle = `rgba(255,90,0,${a})`;
        ctx.lineWidth = 2.5;
        ctx.stroke();
      }
      // Head
      ctx.beginPath();
      ctx.arc(ms.x, ms.y, 5, 0, Math.PI * 2);
      ctx.fillStyle   = '#ff5500';
      ctx.shadowColor = '#ff3300';
      ctx.shadowBlur  = 16;
      ctx.fill();
      ctx.shadowBlur  = 0;
    });
  }

  // ── Helpers ───────────────────────────────────────────
  function addStock(planet, amount) {
    planet.missileStock = (planet.missileStock || 0) + amount;
  }
  function getActive() { return active; }
  function clear()     { active = []; }

  return { fire, update, draw, registerCoord, clearCoords, addStock, getActive, clear };
})();
