// ============================================================
//  clock.js — Central real-time game clock
// ============================================================

const Clock = (() => {

  const TICK_MS      = 2000;  // resource tick every 2s
  const AI_MS        = 15000; // AI evaluates every 15s
  const YEAR_MS      = 60000; // 1 game-year = 60s real

  let lastTick   = 0;
  let lastAI     = 0;
  let startTime  = 0;
  let running    = false;
  let rafId      = null;

  const subscribers = { tick:[], ai:[], frame:[] };

  function on(event, fn) { subscribers[event]?.push(fn); }

  function start() {
    if (running) return;
    running   = true;
    startTime = performance.now() - (State.get().elapsedMs || 0);
    lastTick  = performance.now();
    lastAI    = performance.now();
    _loop(performance.now());
  }

  function stop() { running=false; if (rafId) cancelAnimationFrame(rafId); }

  function _loop(now) {
    if (!running) return;
    rafId = requestAnimationFrame(_loop);

    const elapsed = now - startTime;
    State.get().elapsedMs = elapsed;

    // Update game year display
    const year = 2247 + Math.floor(elapsed / YEAR_MS);
    State.get().year = year;

    // Resource tick
    if (now - lastTick >= TICK_MS) {
      const dt = (now - lastTick) / 1000; // seconds since last tick
      lastTick = now;
      subscribers.tick.forEach(fn => fn(dt));
    }

    // AI tick
    if (now - lastAI >= AI_MS) {
      lastAI = now;
      subscribers.ai.forEach(fn => fn());
    }

    // Per-frame (rendering, travel, construction progress)
    const dt = 1/60; // approx frame dt — renderers use their own RAF
    subscribers.frame.forEach(fn => fn(now, elapsed));
  }

  function gameYear() {
    return 2247 + Math.floor((State.get().elapsedMs||0) / YEAR_MS);
  }

  function elapsedSec() {
    return (State.get().elapsedMs||0) / 1000;
  }

  return { on, start, stop, gameYear, elapsedSec };
})();
