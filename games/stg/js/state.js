// ============================================================
//  state.js — Game state + real-time mutations
// ============================================================

const State = (() => {

  const systems = JSON.parse(JSON.stringify(Data.SYSTEMS));
  let shipIdCounter = 200;

  let state = {
    view: 'galaxy',
    selected: null,
    currentSystemId: null,
    currentPlanetIdx: null,
    systems,
    elapsedMs: 0,
    year: 2247,
    resources: { metal:100000, crystal:100000, hydrogen:920, ammonia:330, pop:12.4 },
    travelingFleets: [],
    watchdogTimers: {},
    _enemy: { metal:2000, crystal:800, hydrogen:600 },
  };

  const _listeners = [];
  function subscribe(fn) { _listeners.push(fn); }
  function notify(event, data) { _listeners.forEach(fn => fn(event, state, data)); }

  // ── Getters ───────────────────────────────────────────
  const get       = () => state;
  const getSystem = id  => state.systems.find(s => s.id === id);
  const getPlanet = (sysId, idx) => { const s = getSystem(sysId); return s ? s.planets[idx] : null; };

  function getShip(id) {
    for (const sys of state.systems)
      for (const pl of sys.planets)
        for (const sh of (pl.ships || []))
          if (sh.id === id) return sh;
    for (const tf of state.travelingFleets)
      for (const sh of tf.ships)
        if (sh.id === id) return sh;
    return null;
  }

  function playerShips() {
    const ships = [];
    for (const sys of state.systems)
      for (const pl of sys.planets)
        for (const sh of (pl.ships || []))
          if ((sh.owner || pl.owner) === 'player') ships.push(sh);
    return ships;
  }

  // ── Navigation ────────────────────────────────────────
  function enterSystem(id)        { state.view='system';  state.currentSystemId=id; state.selected={kind:'system',id}; notify('view_change'); }
  function enterSurface(sId,idx)  { state.view='surface'; state.currentSystemId=sId; state.currentPlanetIdx=idx; state.selected={kind:'planet',id:sId,planetIndex:idx}; notify('view_change'); }
  function exitToGalaxy()         { state.view='galaxy';  state.currentSystemId=null; state.currentPlanetIdx=null; state.selected=null; notify('view_change'); }
  function exitToSystem()         { state.view='system';  state.currentPlanetIdx=null; state.selected={kind:'system',id:state.currentSystemId}; notify('view_change'); }
  function select(sel)            { state.selected=sel; notify('selection'); }

  // ── Resource tick ─────────────────────────────────────
  let _missileRestockAcc = 0;

  function resourceTick(dt) {
    for (const sys of state.systems) {
      for (const pl of sys.planets) {
        if (pl.owner !== 'player') continue;
        const r = Data.PLANET_TYPES[pl.type].resources;
        state.resources.metal    += r.metal    * dt;
        state.resources.crystal  += r.crystal  * dt;
        state.resources.hydrogen += r.hydrogen * dt;
        state.resources.ammonia  += r.ammonia  * dt;
        // Structure bonuses
        for (const b of (pl.buildings || [])) {
          const ef = Data.STRUCTURES[b.key]?.effect || {};
          state.resources.metal    += (ef.metal    || 0) * dt;
          state.resources.crystal  += (ef.crystal  || 0) * dt;
          state.resources.hydrogen += (ef.hydrogen || 0) * dt;
          state.resources.ammonia  += (ef.ammonia  || 0) * dt;
        }
        _tickConstruction(sys, pl, dt);
      }
    }
    _enemyIncome(dt);
    _missileRestock(dt);
    _autoDefend();
    notify('resources');
  }

  function _tickConstruction(sys, pl, dt) {
    // Building queue
    if (pl.buildQueue) {
      pl.buildQueue.elapsed = (pl.buildQueue.elapsed || 0) + dt;
      if (pl.buildQueue.elapsed >= pl.buildQueue.buildTime) {
        const key = pl.buildQueue.key;
        const def = Data.STRUCTURES[key] || {};
        // Find a position for the new building
        const pos = _findBuildPos(pl, def.size || [2,2]);
        pl.buildings = pl.buildings || [];
        pl.buildings.push({ key, x: pos.x, y: pos.y });
        // Missile silo grants stock
        if (def.effect?.missiles) pl.missileStock = (pl.missileStock || 0) + def.effect.missiles;
        notify('build_complete', { planet: pl, key });
        pl.buildQueue = null;
      }
    }
    // Ship queue
    if (pl.shipQueue) {
      pl.shipQueue.elapsed = (pl.shipQueue.elapsed || 0) + dt;
      if (pl.shipQueue.elapsed >= pl.shipQueue.buildTime) {
        const tmpl = Data.SHIP_TYPES[pl.shipQueue.type];
        const ship = {
          id: 'ship_' + (++shipIdCounter),
          type: pl.shipQueue.type,
          name: pl.shipQueue.name || (tmpl.name + '-' + shipIdCounter),
          hp: tmpl.hp, maxHp: tmpl.hp,
          state: 'dock',
          owner: 'player',
          systemId: sys.id,
          planetIdx: sys.planets.indexOf(pl),
        };
        pl.ships = pl.ships || [];
        pl.ships.push(ship);
        notify('ship_built', { planet: pl, ship });
        pl.shipQueue = null;
      }
    }
  }

  function _findBuildPos(pl, size) {
    // Try to find an unoccupied spot near existing buildings
    const occupied = new Set((pl.buildings || []).map(b => {
      const [sw, sh] = Data.STRUCTURES[b.key]?.size || [2,2];
      const pts = [];
      for (let dy = 0; dy < sh; dy++)
        for (let dx = 0; dx < sw; dx++)
          pts.push(`${b.x+dx},${b.y+dy}`);
      return pts;
    }).flat());
    const maxX = 38, maxY = 26;
    const [sw, sh] = size;
    for (let attempts = 0; attempts < 200; attempts++) {
      const x = 2 + Math.floor(Math.random() * (maxX - sw));
      const y = 2 + Math.floor(Math.random() * (maxY - sh));
      let ok = true;
      for (let dy = 0; dy < sh && ok; dy++)
        for (let dx = 0; dx < sw && ok; dx++)
          if (occupied.has(`${x+dx},${y+dy}`)) ok = false;
      if (ok) return { x, y };
    }
    return { x: 2, y: 2 };
  }

  function _enemyIncome(dt) {
    for (const sys of state.systems) {
      for (const pl of sys.planets) {
        if (pl.owner !== 'enemy') continue;
        const r = Data.PLANET_TYPES[pl.type].resources;
        state._enemy.metal    += r.metal    * dt;
        state._enemy.crystal  += r.crystal  * dt;
        state._enemy.hydrogen += r.hydrogen * dt;
      }
    }
  }

  function _missileRestock(dt) {
    _missileRestockAcc += dt;
    if (_missileRestockAcc < 60) return;
    _missileRestockAcc = 0;
    for (const sys of state.systems) {
      for (const pl of sys.planets) {
        if (pl.owner !== 'player') continue;
        const silos = (pl.buildings || []).filter(b => b.key === 'missile_silo').length;
        if (silos > 0) {
          const max = silos * 3;
          if ((pl.missileStock || 0) < max) {
            pl.missileStock = Math.min(max, (pl.missileStock || 0) + silos);
            notify('missile_restock', { planet: pl });
          }
        }
      }
    }
  }

  // Auto-defend: fire at incoming enemy fleets
  function _autoDefend() {
    for (const sys of state.systems) {
      for (const pl of sys.planets) {
        if (!pl.autoDefend || (pl.missileStock || 0) < 1) continue;
        // Check for traveling enemy fleets heading to this planet's system
        const inbound = state.travelingFleets.filter(tf =>
          tf.owner === 'enemy' &&
          tf.targetSystemId === sys.id &&
          tf.progress > 0.3 && tf.progress < 0.9
        );
        if (!inbound.length) continue;
        const tf = inbound[0];
        const target = tf.ships[0];
        if (!target) continue;
        // Fire
        pl._worldX = pl._worldX || 400;
        pl._worldY = pl._worldY || 300;
        target._worldX = target._worldX || 400;
        target._worldY = target._worldY || 300;
        const ok = Missiles.fire(pl, target, 'ship', 'player');
        if (ok) notify('missile_fired', { planet: pl, target });
      }
    }
  }

  // ── Travel tick ───────────────────────────────────────
  function travelTick(now) {
    const toArrive = [];
    for (const tf of state.travelingFleets) {
      tf.progress = Math.min(1, (now - tf.startTime) / tf.duration);
      if (tf.progress >= 1) toArrive.push(tf);
    }
    for (const tf of toArrive) {
      state.travelingFleets = state.travelingFleets.filter(x => x !== tf);
      _arriveFleet(tf);
    }
  }

  function _arriveFleet(tf) {
    const targetSys = getSystem(tf.targetSystemId);
    if (!targetSys) return;

    // Always notify first — probe arrival handler needs this
    notify('fleet_arrived', tf);

    // For probes arriving at unexplored systems, planets may not exist yet
    // The arrival notification triggers explore (adds planets), then we park ships
    const tPlanet = targetSys.planets[tf.targetPlanetIdx] || targetSys.planets[0];
    if (!tPlanet) {
      // No planet to dock at (unexplored or empty) — ships are consumed/parked in limbo
      // Probes are expendable; other ships wait until system is explored
      return;
    }
    // Only push ships if not already handled by a colonise/probe subscriber
    if (!tf._shipsHandled) {
      tPlanet.ships = tPlanet.ships || [];
      for (const sh of tf.ships) {
        sh.state = 'orbit';
        sh.systemId = tf.targetSystemId;
        sh.planetIdx = targetSys.planets.indexOf(tPlanet);
        // Avoid duplicates
        if (!tPlanet.ships.find(s => s.id === sh.id)) {
          tPlanet.ships.push(sh);
        }
      }
    }
  }

  // ── Send fleet ────────────────────────────────────────
  function sendFleet(ships, fromSysId, toSysId, toPlanetIdx, warp = false) {
    const fromSys = getSystem(fromSysId);
    const toSys   = getSystem(toSysId);
    if (!fromSys || !toSys) return null;

    // Remove ships from source planets
    for (const sh of ships) {
      for (const pl of fromSys.planets)
        pl.ships = (pl.ships || []).filter(s => s.id !== sh.id);
    }

    const dx = (toSys.x - fromSys.x) * 1200;
    const dy = (toSys.y - fromSys.y) * 900;
    const dist = Math.sqrt(dx*dx + dy*dy);
    const minSpeed = Math.min(...ships.map(s => Data.SHIP_TYPES[s.type]?.speed || 60));
    const speed = warp ? minSpeed * 1.5 : minSpeed;
    const duration = (dist / speed) * 1000;

    const tf = {
      id: 'tf_' + (++shipIdCounter),
      ships, owner: ships[0].owner || 'player',
      fromSystemId: fromSysId,
      targetSystemId: toSysId,
      targetPlanetIdx: toPlanetIdx ?? 0,
      startTime: performance.now(),
      duration, progress: 0, warp,
    };
    state.travelingFleets.push(tf);
    notify('fleet_sent', tf);
    return tf;
  }

  function abortFleet(tfId) {
    const tf = state.travelingFleets.find(x => x.id === tfId);
    if (!tf) return;
    state.travelingFleets = state.travelingFleets.filter(x => x.id !== tfId);
    const origin = getSystem(tf.fromSystemId);
    if (origin?.planets?.[0]) {
      for (const sh of tf.ships) {
        sh.state = 'orbit';
        origin.planets[0].ships = origin.planets[0].ships || [];
        origin.planets[0].ships.push(sh);
      }
    }
    notify('fleet_aborted', tf);
  }

  // ── Build ─────────────────────────────────────────────
  function queueBuild(sysId, planetIdx, key) {
    const planet = getPlanet(sysId, planetIdx);
    const struct = Data.STRUCTURES[key];
    if (!planet || !struct) return false;
    if (planet.buildQueue) return false;
    for (const [r,v] of Object.entries(struct.cost || {}))
      if ((state.resources[r] || 0) < v) return false;
    for (const [r,v] of Object.entries(struct.cost || {}))
      state.resources[r] -= v;
    planet.buildQueue = { key, buildTime: struct.buildTime, elapsed: 0 };
    notify('build_queued');
    return true;
  }

  function queueShip(sysId, planetIdx, type, name) {
    const planet = getPlanet(sysId, planetIdx);
    const tmpl   = Data.SHIP_TYPES[type];
    if (!planet || !tmpl) return false;
    if (planet.shipQueue) return false;
    if (!(planet.buildings || []).some(b => b.key === 'shipyard')) return false;
    for (const [r,v] of Object.entries(tmpl.buildCost || {}))
      if ((state.resources[r] || 0) < v) return false;
    for (const [r,v] of Object.entries(tmpl.buildCost || {}))
      state.resources[r] -= v;
    planet.shipQueue = {
      type, name: name || (tmpl.name + '-' + shipIdCounter),
      buildTime: tmpl.buildTime, elapsed: 0,
    };
    notify('ship_queued');
    return true;
  }

  // ── Colonise ──────────────────────────────────────────
  function colonise(sysId, planetIdx) {
    const planet = getPlanet(sysId, planetIdx);
    if (!planet || planet.owner !== 'none') return false;
    if (state.resources.hydrogen < 200) return false;
    state.resources.hydrogen -= 200;
    planet.owner = 'player';
    planet.buildings = planet.buildings || [];

    const tmpl = Data.PLANET_TYPES[planet.type];

    if (!tmpl.landable) {
      // Non-landable planet: auto-place Space Control Station
      if (!planet.buildings.some(b => b.key === 'space_station')) {
        planet.buildings.push({ key: 'space_station', x: 2, y: 2 });
      }
    } else {
      // Landable: place HQ
      if (!planet.buildings.some(b => b.key === 'hq')) {
        const hqDef = Data.STRUCTURES['hq'];
        // Sometimes inside a city (40% chance if city exists)
        const city = planet.buildings.find(b => b.key === 'city');
        if (city && Math.random() < 0.4) {
          planet.buildings.push({ key: 'hq', x: city.x + 2, y: city.y + 2 });
        } else {
          const pos = _findBuildPos(planet, hqDef.size || [3,3]);
          planet.buildings.push({ key: 'hq', x: pos.x, y: pos.y });
        }
      }
    }
    notify('colonise');
    return true;
  }

  // ── Explore ───────────────────────────────────────────
  function exploreSystem(sysId) {
    const sys = getSystem(sysId);
    if (!sys || sys.explored) return false;
    if (state.resources.hydrogen < 150) return false;
    state.resources.hydrogen -= 150;
    sys.explored = true;
    sys.planets = _generatePlanets();
    notify('explore');
    return true;
  }

  function _generatePlanets() {
    const types = ['terrestrial','barren','gas_giant','ice_giant','frozen','volcanic'];
    const weights = [0.25,0.30,0.20,0.15,0.07,0.03];
    const names = ['Proxis','Velar','Nyx','Orath','Keld','Zaur','Issel','Daemos','Vrel','Sorn'];
    const count = 2 + Math.floor(Math.random() * 4);
    return Array.from({ length: count }, (_, i) => {
      const r = Math.random(); let cumul = 0, chosen = 'barren';
      for (let j = 0; j < types.length; j++) { cumul += weights[j]; if (r < cumul) { chosen = types[j]; break; } }
      return {
        name: names[Math.floor(Math.random() * names.length)] + ' ' + (i + 1),
        type: chosen, owner: 'none',
        radius: Math.round(1000 + Math.random() * 70000),
        gravity: parseFloat((0.2 + Math.random() * 2.8).toFixed(2)),
        atmo: ['None','Thin','Thick','Breathable','Toxic'][Math.floor(Math.random() * 5)],
        temp: (Math.random() > .5 ? '-' : '') + Math.round(Math.random() * 400) + '°C',
        water: Math.round(Math.random() * 100) + '%',
        buildings: [], ships: [], shipQueue: null, buildQueue: null, missileStock: 0,
      };
    });
  }

  // ── Capture ───────────────────────────────────────────
  function capturePlanet(sysId, planetIdx, newOwner) {
    const planet = getPlanet(sysId, planetIdx);
    if (!planet) return;
    planet.owner = newOwner;
    // Clear enemy build/ship queues
    planet.buildQueue = null;
    planet.shipQueue  = null;
    // Strip defensive structures + enemy HQ (player will get their own)
    planet.buildings = (planet.buildings || []).filter(b =>
      b.key !== 'shield_gen' && b.key !== 'hq' && b.key !== 'space_station'
    );
    planet.ships = (planet.ships || []).filter(s => (s.owner || newOwner) === newOwner);
    // Place HQ or SCS for new owner
    if (newOwner === 'player') {
      const tmpl2 = Data.PLANET_TYPES[planet.type];
      if (tmpl2.landable) {
        const pos = _findBuildPos(planet, [3,3]);
        planet.buildings.push({ key: 'hq', x: pos.x, y: pos.y });
      } else {
        planet.buildings.push({ key: 'space_station', x: 2, y: 2 });
      }
    }
    notify('capture', { sysId, planetIdx, newOwner });
  }

  function repositionWatchdog(sysId, fromPlanetIdx, toPlanetIdx) {
    const from = getPlanet(sysId, fromPlanetIdx);
    const to   = getPlanet(sysId, toPlanetIdx);
    if (!from || !to) return false;
    const wd = (from.ships || []).find(s => s.type === 'watchdog');
    if (!wd) return false;
    from.ships = from.ships.filter(s => s.id !== wd.id);
    wd.state = 'orbit'; wd.planetIdx = toPlanetIdx;
    to.ships = to.ships || []; to.ships.push(wd);
    notify('reposition');
    return true;
  }

  return {
    get, subscribe, notify,
    getSystem, getPlanet, getShip, playerShips,
    enterSystem, enterSurface, exitToGalaxy, exitToSystem, select,
    resourceTick, travelTick,
    sendFleet, abortFleet,
    queueBuild, queueShip,
    colonise, exploreSystem,
    capturePlanet, repositionWatchdog,
    _generatePlanetsPublic: _generatePlanets,
    _findBuildPos,
  };
})();
