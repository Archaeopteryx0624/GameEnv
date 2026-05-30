// ============================================================
//  ui.js — Minimal HUD, toasts, help, combat log
// ============================================================

const UI = (() => {

  const fmt = n => n >= 1000 ? (n/1000).toFixed(1)+'k' : Math.floor(n).toString();

  // ── Resources ─────────────────────────────────────────
  function updateResources() {
    const { resources, systems } = State.get();
    document.getElementById('r-metal').textContent   = fmt(resources.metal);
    document.getElementById('r-crystal').textContent = fmt(resources.crystal);
    document.getElementById('r-fuel').textContent    = fmt(resources.hydrogen);
    document.getElementById('r-ammonia').textContent = fmt(resources.ammonia);

    // Income rate
    let mps = 0;
    for (const sys of systems)
      for (const pl of sys.planets)
        if (pl.owner === 'player') mps += Data.PLANET_TYPES[pl.type].resources.metal;
    document.getElementById('r-income').textContent = '+' + mps.toFixed(1) + 'm/s';

    // Total missiles
    let ms = 0;
    for (const sys of systems)
      for (const pl of sys.planets)
        if (pl.owner === 'player') ms += pl.missileStock || 0;
    document.getElementById('r-missiles').textContent = ms;

    // Surface mini-HUD
    const sm = document.getElementById('sr-metal');
    const sf = document.getElementById('sr-fuel');
    const smis = document.getElementById('sr-missiles');
    if (sm) sm.textContent = fmt(resources.metal);
    if (sf) sf.textContent = fmt(resources.hydrogen);
    if (smis) smis.textContent = ms;
  }

  function updateTurn() {
    const el = document.getElementById('year-badge');
    if (el) el.textContent = Clock.gameYear();
  }

  // ── Breadcrumb ────────────────────────────────────────
  function updateBreadcrumb() {
    const s = State.get();
    const bc = document.getElementById('breadcrumb');
    bc.innerHTML = '';
    const mk = (label, fn, active) => {
      const sp = document.createElement('span');
      sp.className = 'bc-crumb' + (active ? ' active' : '');
      sp.textContent = label;
      if (!active && fn) { sp.onclick = fn; sp.ontouchstart = fn; }
      return sp;
    };
    const sep = () => {
      const s2 = document.createElement('span');
      s2.className = 'bc-sep'; s2.textContent = ' › '; return s2;
    };
    bc.appendChild(mk('GALAXY', () => Game.goGalaxy(), s.view === 'galaxy'));
    if (s.view === 'system' || s.view === 'surface') {
      const sys = State.getSystem(s.currentSystemId);
      bc.appendChild(sep());
      bc.appendChild(mk(sys?.name?.toUpperCase() || '?', () => Game.goSystem(s.currentSystemId), s.view === 'system'));
    }
    if (s.view === 'surface') {
      const pl = State.getPlanet(s.currentSystemId, s.currentPlanetIdx);
      bc.appendChild(sep());
      bc.appendChild(mk(pl?.name?.toUpperCase() || '?', null, true));
    }
  }

  function updateViewLabel() {
    const s = State.get();
    const el = document.getElementById('view-label');
    if (!el) return;
    if (s.view === 'galaxy') el.textContent = 'GALAXY MAP';
    else if (s.view === 'system') el.textContent = (State.getSystem(s.currentSystemId)?.name || '').toUpperCase() + ' SYSTEM';
    else el.textContent = '';
  }

  // ── Mode UI ───────────────────────────────────────────
  function updateModeButtons() {
    const m = Modes.get();
    const cancel = document.getElementById('mode-cancel');
    if (cancel) cancel.classList.toggle('hidden', m === 'normal');
    const banner = document.getElementById('mode-banner');
    if (banner) banner.classList.toggle('show', m !== 'normal');
  }

  // ── Toast ─────────────────────────────────────────────
  let toastTimer = null;
  function toast(msg, type = '', duration = 2800) {
    const el = document.getElementById('toast');
    if (!el) return;
    el.textContent = msg;
    el.className = type ? `show ${type}-toast` : 'show';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), duration);
  }

  // Tooltip replaced by toast on mobile
  function showTooltip() {}
  function hideTooltip() {}

  // ── Combat log ────────────────────────────────────────
  function showCombatLog(log, won) {
    document.getElementById('combat-log').classList.remove('hidden');
    document.getElementById('cl-title').textContent = won ? '⚔ VICTORY' : '⚔ DEFEAT';
    document.getElementById('cl-body').innerHTML = (log || []).map(e => {
      const cls = e.type === 'win' ? 'cl-line-win' : e.type === 'lose' ? 'cl-line-lose' : e.type === 'hit' ? 'cl-line-hit' : 'cl-line-info';
      return `<div class="${cls}">${e.text}</div>`;
    }).join('');
  }
  function closeCombatLog() { document.getElementById('combat-log').classList.add('hidden'); }

  // ── Help ──────────────────────────────────────────────
  function openHelp()  { document.getElementById('help-modal').classList.remove('hidden'); }
  function closeHelp() { document.getElementById('help-modal').classList.add('hidden'); }

  // ── Minimap (on minimap canvas — now in system view) ──
  // No separate minimap panel — galaxy/system Pixi canvases serve this role

  // ── Fleet panel update (no longer a panel — just toast) ─
  function updateFleetPanel() {} // no-op — removed

  // ── Full refresh ──────────────────────────────────────
  function refresh() {
    updateResources();
    updateTurn();
    updateBreadcrumb();
    updateViewLabel();
    updateModeButtons();
  }

  // ── Selection panel (stub — surface handles interaction) ─
  function updateSelectionPanel() {}

  return {
    refresh, updateResources, updateTurn, updateBreadcrumb,
    updateViewLabel, updateModeButtons,
    toast, showTooltip, hideTooltip,
    showCombatLog, closeCombatLog,
    openHelp, closeHelp,
    updateFleetPanel, updateSelectionPanel,
    // Stubs for compatibility
    toggleHUD: () => {},
    toggleSurfaceDrawer: () => {},
    drawMinimap: () => {},
  };
})();
