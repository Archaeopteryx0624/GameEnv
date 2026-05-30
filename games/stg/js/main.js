// ============================================================
//  main.js — Boot, view routing, real-time game loop
// ============================================================

const Game = (() => {

  let currentRenderer = null;
  let currentSystemId = null;

  function init() {
    State.subscribe((event, state, data) => {
      if (event === 'resources') {
        UI.updateResources();
        UI.updateTurn();
      }
      if (event === 'build_complete') {
        const name = Data.STRUCTURES[data?.key]?.name || 'Structure';
        UI.toast(`✓ ${name} complete!`, '', 2500);
        if (state.view === 'surface') PlanetView.onBuildComplete(data?.key);
        else if (currentRenderer === 'system') SystemView.refresh();
      }
      if (event === 'ship_built') {
        if (state.view === 'surface') PlanetView.onShipBuilt(data?.ship);
        else if (currentRenderer === 'system') SystemView.refresh();
      }
      if (event === 'fleet_arrived') {
        UI.updateResources();
        if (currentRenderer === 'system') SystemView.refresh();
        if (currentRenderer === 'galaxy') GalaxyView.rebuildScene();
      }
      if (event === 'combat_win' || event === 'combat_loss') {
        UI.refresh();
        if (currentRenderer === 'galaxy') GalaxyView.rebuildScene();
        if (currentRenderer === 'system') SystemView.refresh();
      }
      if (event === 'enemy_capture' || event === 'colonise' || event === 'explore') {
        UI.refresh();
        if (currentRenderer === 'galaxy') GalaxyView.rebuildScene();
        if (currentRenderer === 'system') SystemView.refresh();
      }
      if (event === 'missile_impact' || event === 'missile_restock') {
        UI.updateResources();
        if (currentRenderer === 'system') SystemView.refresh();
      }
      if (event === 'reposition') {
        if (currentRenderer === 'system') SystemView.refresh();
      }
    });

    // Clock wiring
    Clock.on('tick', dt => State.resourceTick(dt));
    Clock.on('ai',   () => AI.tick());
    Clock.on('frame', now => State.travelTick(now));

    UI.refresh();
    _showGalaxy();
    Clock.start();

    // Keyboard shortcuts
    document.addEventListener('keydown', e => {
      const anyModal = ['help-modal', 'combat-log']
        .some(id => !document.getElementById(id).classList.contains('hidden'));
      if (anyModal) {
        if (e.key === 'Escape') {
          ['help-modal', 'combat-log'].forEach(id => document.getElementById(id).classList.add('hidden'));
        }
        return;
      }
      if (Modes.handleKey(e.key)) { UI.updateModeButtons(); return; }
      const s = State.get();
      if (e.key === 'Escape') {
        if (s.view === 'surface') {
          PlanetView.hide();
          _showSystem(s.currentSystemId);
          State.exitToSystem();
          UI.updateBreadcrumb();
        } else if (s.view === 'system') {
          goGalaxy();
        }
      }
      if (e.key === 'Enter') {
        const sel = s.selected;
        if (sel?.kind === 'system') goSystem(sel.id);
      }
      if (e.key === 'h' || e.key === 'H') UI.openHelp();
    });

    document.getElementById('surface-back-btn').onclick = () => {
      const s = State.get();
      PlanetView.hide();
      _showSystem(s.currentSystemId);
      State.exitToSystem();
      UI.updateBreadcrumb();
      UI.updateViewLabel();
    };

    // Tap outside modals to close
    ['help-modal', 'combat-log'].forEach(id => {
      document.getElementById(id).addEventListener('click', e => {
        if (e.target.id === id) document.getElementById(id).classList.add('hidden');
      });
    });

    // Mode cancel button
    const cancelBtn = document.getElementById('mode-cancel');
    if (cancelBtn) cancelBtn.onclick = () => { Modes.set('normal'); UI.updateModeButtons(); };

    // AI enemy capture listener
    State.subscribe((ev, s, data) => {
      if (ev === 'enemy_capture') {
        const planet = State.getPlanet(data?.sysId, data?.planetIdx);
        UI.toast(`⚠ ENEMY captured ${planet?.name || 'a planet'}!`, 'enemy', 4000);
      }
    });
  }

  // ── View transitions ──────────────────────────────────
  function _showGalaxy() {
    currentRenderer = 'galaxy';
    PlanetView.hide();
    SystemView.hide();
    GalaxyView.show();
    State.exitToGalaxy();
    document.getElementById('legend').classList.remove('hidden');
    document.getElementById('view-label').style.display = '';
    UI.updateBreadcrumb();
    UI.updateViewLabel();
    UI.updateModeButtons();
  }

  function _showSystem(id) {
    currentRenderer = 'system';
    currentSystemId = id;
    GalaxyView.hide();
    PlanetView.hide();
    SystemView.show(id);
    document.getElementById('legend').classList.add('hidden');
    document.getElementById('view-label').style.display = 'none';
  }

  // ── Public navigation ─────────────────────────────────
  function goGalaxy() {
    Modes.set('normal');
    _showGalaxy();
  }

  function goSystem(id) {
    const sys = State.getSystem(id);
    if (!sys) return;
    if (!sys.explored) { UI.toast('System unexplored — send a probe first', '', 2000); return; }
    _showSystem(id);
  }

  function landOnPlanet(systemId, planetIdx) {
    const planet = State.getPlanet(systemId, planetIdx);
    if (!planet) return;
    if (planet.owner !== 'player') { UI.toast('Cannot land on enemy territory', '', 2000); return; }
    const tmpl = Data.PLANET_TYPES[planet.type];
    if (!tmpl.landable) { UI.toast(`${planet.name} — not landable`, '', 2000); return; }
    SystemView.hide();
    PlanetView.show(systemId, planetIdx);
    UI.updateBreadcrumb();
  }

  function colonisePlanet(systemId, planetIdx) {
    const ok = State.colonise(systemId, planetIdx);
    if (ok) {
      UI.toast('✓ Planet colonised — HQ established', '', 2500);
      UI.updateResources();
      if (currentRenderer === 'system') SystemView.refresh();
    } else {
      UI.toast('✗ Need 200 H₂ fuel to colonise', '', 2000);
    }
  }

  function exploreSys(systemId) {
    const ok = State.exploreSystem(systemId);
    if (ok) {
      const sys = State.getSystem(systemId);
      UI.toast(`✓ ${sys.name} — ${sys.planets.length} planets found`, '', 2500);
      GalaxyView.rebuildScene();
      UI.updateResources();
    } else {
      UI.toast('✗ Need 150 H₂ fuel to explore', '', 2000);
    }
  }

  return { init, goGalaxy, goSystem, landOnPlanet, colonisePlanet, exploreSys };
})();

window.addEventListener('load', () => Game.init());
