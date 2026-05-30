// ============================================================
//  modes.js — Mode state machine (sendfleet / missile)
// ============================================================

const Modes = (() => {

  let mode      = 'normal';
  let srcPlanet = null;
  let selected  = new Set();

  const LABELS = {
    sendfleet: '— TAP DESTINATION PLANET —',
    missile:   '— TAP TARGET (planet / ship / station) —',
  };

  function set(m) {
    mode = m;
    selected.clear();
    const banner  = document.getElementById('mode-banner');
    const shipSel = document.getElementById('ship-selector');
    if (m !== 'normal') {
      if (banner) { banner.textContent = LABELS[m] || ''; banner.classList.add('show'); }
      if (m === 'sendfleet' && shipSel) { _buildShipSelector(); shipSel.classList.add('show'); }
      else if (shipSel) shipSel.classList.remove('show');
    } else {
      if (banner) banner.classList.remove('show');
      if (shipSel) shipSel.classList.remove('show');
      srcPlanet = null;
    }
    UI.updateModeButtons?.();
  }

  function get()    { return mode; }
  function getSrc() { return srcPlanet; }

  function setSrc(sysId, planetIdx) {
    srcPlanet = { sysId, planetIdx };
    if (mode === 'sendfleet') _buildShipSelector();
  }

  function toggleShip(shipId) {
    if (selected.has(shipId)) selected.delete(shipId);
    else selected.add(shipId);
    document.getElementById('sss-' + shipId)?.classList.toggle('selected', selected.has(shipId));
    const el = document.getElementById('ss-count');
    if (el) el.textContent = selected.size + ' selected · 0 = send all';
  }

  // ── Main click handler ────────────────────────────────
  function handleClick(obj) {
    switch (mode) {

      case 'sendfleet': {
        if (!srcPlanet) { UI.toast('Tap a planet first to set source'); return; }
        if (obj.kind !== 'planet') return;
        const src = State.getPlanet(srcPlanet.sysId, srcPlanet.planetIdx);
        if (!src) { set('normal'); return; }

        let ids = Array.from(selected);
        if (!ids.length) {
          ids = (src.ships || [])
            .filter(s => (s.owner || src.owner) === 'player' && s.type !== 'watchdog')
            .map(s => s.id);
        }
        if (!ids.length) { UI.toast('No mobile ships at source'); return; }

        const ships = ids.map(id => (src.ships || []).find(s => s.id === id)).filter(Boolean);
        if (!ships.length) { UI.toast('No valid ships'); set('normal'); return; }
        if (obj.sysId === srcPlanet.sysId && obj.planetIdx === srcPlanet.planetIdx) {
          UI.toast('Already at this planet'); return;
        }

        // Remove from source
        src.ships = (src.ships || []).filter(s => !ids.includes(s.id));
        ships.forEach(s => { s.state = 'travel'; s.owner = s.owner || 'player'; });

        // Same system — animate in-system flight
        if (obj.sysId === srcPlanet.sysId) {
          const destPl = State.getPlanet(obj.sysId, obj.planetIdx);
          const fromPIdx = srcPlanet.planetIdx;
          ships.forEach(sh => {
            SystemView.launchInSystem(sh, fromPIdx, obj.planetIdx, () => {
              sh.state = 'orbit';
              if (destPl) {
                destPl.ships = destPl.ships || [];
                destPl.ships.push(sh);
                if (destPl.owner === 'enemy') {
                  _resolveArrivalCombat([sh], obj.sysId, obj.planetIdx);
                } else if (destPl.owner === 'none') {
                  destPl.owner = 'player';
                  if (!destPl.buildings?.some(b=>b.key==='hq'))
                    destPl.buildings.push({key:'hq',x:18,y:10});
                  State.notify('colonise');
                  UI.toast(`✓ ${destPl.name} colonised!`,'',2500);
                }
              }
            });
          });
          UI.toast(`🚀 ${ships.length} ships → ${State.getPlanet(obj.sysId,obj.planetIdx)?.name}`,'',2000);
          set('normal');
          return;
        }

        const warp = Combat.hasWarp(srcPlanet.sysId);
        const tf   = State.sendFleet(ships, srcPlanet.sysId, obj.sysId, obj.planetIdx, warp);
        if (tf) {
          tf.owner = 'player';
          const allProbes = ships.every(s => Data.SHIP_TYPES[s.type]?.isProbe);
          const targetSys = State.getSystem(obj.sysId);
          if (allProbes && targetSys && !targetSys.explored) {
            // Probe fleet to unexplored system — explore on arrival
            _wireProbeArrival(tf, obj.sysId);
          } else {
            const dest = State.getPlanet(obj.sysId, obj.planetIdx);
            if (dest?.owner === 'enemy') {
              tf.isAttack = true;
              _wireArrivalCombat(tf, obj.sysId, obj.planetIdx);
            } else if (dest?.owner === 'none') {
              _wireArrivalColonise(tf, obj.sysId, obj.planetIdx);
            }
          }
        }
        const dname = State.getSystem(obj.sysId)?.name || '?';
        UI.toast(warp ? `⚡ Warp — ${ships.length} ships → ${dname}` : `🚀 ${ships.length} ships → ${dname}`,'',2500);
        set('normal');
        UI.refresh();
        break;
      }

      case 'missile': {
        if (!srcPlanet) { UI.toast('Select a source planet first'); return; }
        let src = State.getPlanet(srcPlanet.sysId, srcPlanet.planetIdx);
        // Find any player planet with missiles in system
        if (!src || (src.missileStock || 0) < 1) {
          const sys = State.getSystem(srcPlanet.sysId);
          if (sys) for (const pl of sys.planets)
            if (pl.owner === 'player' && (pl.missileStock || 0) > 0) { src = pl; break; }
        }
        if (!src || (src.missileStock || 0) < 1) {
          UI.toast('✗ No missiles — build a Missile Silo via HQ','',2500);
          set('normal'); return;
        }

        let targetObj = null, targetType = null;
        if (obj.kind === 'planet') {
          targetObj = State.getPlanet(obj.sysId, obj.planetIdx);
          targetType = 'planet';
          if (targetObj) { targetObj._worldX=obj.worldX; targetObj._worldY=obj.worldY; targetObj._sysId=obj.sysId; targetObj._pIdx=obj.planetIdx; }
        } else if (obj.kind === 'watchdog' || obj.kind === 'ship') {
          targetObj = State.getShip(obj.shipId);
          targetType = obj.kind;
          if (targetObj) { targetObj._worldX=obj.worldX; targetObj._worldY=obj.worldY; }
        }
        if (!targetObj) { UI.toast('Invalid target'); set('normal'); return; }
        if (!src._worldX) { src._worldX = obj.srcWorldX || 400; src._worldY = obj.srcWorldY || 300; }
        const ok = Missiles.fire(src, targetObj, targetType, 'player');
        if (ok) UI.toast(`💥 Missile → ${targetObj.name || targetType}`,'',2000);
        else UI.toast('✗ Launch failed');
        set('normal');
        break;
      }
    }
  }

  // ── Combat resolution helpers ─────────────────────────
  function _wireArrivalCombat(tf, tSysId, tPlanetIdx) {
    State.subscribe((ev, s, data) => {
      if (ev !== 'fleet_arrived' || data?.id !== tf.id) return;
      _resolveArrivalCombat(tf.ships, tSysId, tPlanetIdx);
    });
  }

  function _resolveArrivalCombat(ships, tSysId, tPlanetIdx) {
    // Probe fleet: explore the system on arrival
    const probes = ships.filter(s => Data.SHIP_TYPES[s.type]?.isProbe);
    if (probes.length === ships.length) {
      // All probes — explore system
      const sys = State.getSystem(tSysId);
      if (sys && !sys.explored) {
        sys.explored = true;
        sys.planets = State._generatePlanetsPublic ? State._generatePlanetsPublic() :
          // fallback inline generation
          Array.from({length: 2 + Math.floor(Math.random()*4)}, (_,i) => ({
            name: ['Nyx','Velar','Orath','Keld'][i]||('Planet '+(i+1)),
            type: ['terrestrial','barren','gas_giant','ice_giant'][Math.floor(Math.random()*4)],
            owner:'none', radius: Math.round(2000+Math.random()*60000),
            gravity: parseFloat((0.3+Math.random()*2.5).toFixed(2)),
            atmo:['None','Thin','Breathable','Toxic'][Math.floor(Math.random()*4)],
            temp: (Math.random()>.5?'-':'')+Math.round(Math.random()*350)+'°C',
            water: Math.round(Math.random()*100)+'%',
            buildings:[], ships:[], shipQueue:null, buildQueue:null, missileStock:0,
          }));
        State.notify('explore');
        UI.toast(`🔭 ${sys.name} explored — ${sys.planets.length} planets found`,'',3000);
      } else {
        UI.toast(`🔭 Probe reached ${sys?.name||tSysId}`,'',2000);
      }
      // Probes are expendable — remove them
      UI.refresh();
      return;
    }

    const planet = State.getPlanet(tSysId, tPlanetIdx);
    if (!planet || planet.owner !== 'enemy') {
      if (planet) { planet.ships = planet.ships || []; ships.forEach(sh => { sh.state='orbit'; planet.ships.push(sh); }); }
      UI.toast(`Fleet arrived at ${planet?.name||'destination'}`,'',2000); UI.refresh(); return;
    }
    const result = Combat.resolveInvasion(ships, planet, 'player');
    if (result.won) {
      State.capturePlanet(tSysId, tPlanetIdx, 'player');
      result.survivingAttackers.forEach(sh => { sh.state='orbit'; planet.ships=planet.ships||[]; planet.ships.push(sh); });
      State.notify('combat_win'); UI.toast(`✓ ${planet.name} CAPTURED!`,'',3500);
    } else {
      const survivors = result.survivingAttackers;
      if (survivors.length) {
        const fs = State.get().systems.find(sys => sys.planets.some(p => p.owner==='player'));
        const fp = fs?.planets.find(p => p.owner==='player');
        if (fp) survivors.forEach(sh => { sh.state='orbit'; fp.ships=fp.ships||[]; fp.ships.push(sh); });
      }
      State.notify('combat_loss'); UI.toast(`✗ Attack on ${planet.name} repelled`,'',3000);
    }
    UI.showCombatLog(result.log, result.won);
    UI.refresh();
  }

  function _wireArrivalColonise(tf, tSysId, tPlanetIdx) {
    State.subscribe((ev, s, data) => {
      if (ev !== 'fleet_arrived' || data?.id !== tf.id) return;
      const planet = State.getPlanet(tSysId, tPlanetIdx);
      if (!planet || planet.owner !== 'none') return;
      tf._shipsHandled = true; // prevent _arriveFleet double-push
      planet.owner = 'player';
      planet.buildings = planet.buildings || [];
      // Always clear stale hq/scs before placing fresh one
      planet.buildings = planet.buildings.filter(b => b.key !== 'hq' && b.key !== 'space_station');
      const tmpl = Data.PLANET_TYPES[planet.type];
      if (tmpl.landable) {
        const pos = State._findBuildPos ? State._findBuildPos(planet, [3,3]) : {x:18,y:10};
        planet.buildings.push({ key:'hq', x:pos.x, y:pos.y });
      } else {
        planet.buildings.push({ key:'space_station', x:2, y:2 });
      }
      tf.ships.forEach(sh => {
        sh.state = 'orbit';
        planet.ships = planet.ships || [];
        if (!planet.ships.find(s => s.id === sh.id)) planet.ships.push(sh);
      });
      State.notify('colonise');
      const struct = tmpl.landable ? 'HQ' : 'Space Control Station';
      UI.toast(`✓ ${planet.name} colonised — ${struct} placed!`, '', 2500);
      UI.refresh();
    });
  }

  // Probe arrival — explore the target system
  function _wireProbeArrival(tf, targetSysId) {
    State.subscribe((ev, s, data) => {
      if (ev !== 'fleet_arrived' || data?.id !== tf.id) return;
      const sys = State.getSystem(targetSysId);
      if (!sys) return;
      if (!sys.explored) {
        sys.explored = true;
        sys.planets = State._generatePlanetsPublic();
        State.notify('explore');
        UI.toast(`🔭 ${sys.name} explored — ${sys.planets.length} planets found`, '', 3000);
      } else {
        UI.toast(`🔭 ${sys.name} already charted`, '', 2000);
      }
      // Probes are consumed
      UI.refresh();
      if (State.get().view === 'system' || State.get().view === 'galaxy')
        GalaxyView.rebuildScene();
    });
  }

  // Expose for planet.js to call
  function _wireArrivalCombatExport(tf, tSysId, tPlanetIdx) { _wireArrivalCombat(tf, tSysId, tPlanetIdx); }

  // ── Ship selector ─────────────────────────────────────
  function _buildShipSelector() {
    const el = document.getElementById('ship-selector');
    if (!el) return;
    if (!srcPlanet) {
      el.innerHTML = '<div class="ss-title">SHIPS</div><div style="color:var(--dim);font-size:10px;font-family:var(--font-m)">Tap a planet first</div>';
      return;
    }
    const planet = State.getPlanet(srcPlanet.sysId, srcPlanet.planetIdx);
    if (!planet) return;
    const mobile = (planet.ships || []).filter(s => (s.owner||planet.owner)==='player' && s.type!=='watchdog');
    if (!mobile.length) {
      el.innerHTML = `<div class="ss-title">SHIPS AT ${planet.name.toUpperCase()}</div><div style="color:var(--dim);font-family:var(--font-m);font-size:10px">No mobile ships</div>`;
      return;
    }
    selected.clear();
    el.innerHTML = `<div class="ss-title">SHIPS AT ${planet.name.toUpperCase()}</div>` +
      mobile.map(sh => {
        const t = Data.SHIP_TYPES[sh.type] || {};
        return `<div class="ss-ship" id="sss-${sh.id}" onclick="Modes.toggleShip('${sh.id}')">
          <span class="ss-icon">${t.surfaceIcon||t.icon||'▲'}</span>
          <div class="ss-info"><div class="ss-name">${sh.name}</div><div class="ss-detail">${t.name} · ${sh.hp}hp</div></div>
        </div>`;
      }).join('') +
      `<div class="ss-count" id="ss-count">0 selected · 0 = send all</div>`;
  }

  function handleKey(key) {
    if (key === 'Escape') { set('normal'); return true; }
    if (key === 's' || key === 'S') { set(mode==='sendfleet'?'normal':'sendfleet'); return true; }
    if (key === 'f' || key === 'F') { set(mode==='missile'  ?'normal':'missile');   return true; }
    return false;
  }

  return { set, get, getSrc, setSrc, handleClick, handleKey, toggleShip,
    _wireArrivalCombat: _wireArrivalCombatExport };
})();
