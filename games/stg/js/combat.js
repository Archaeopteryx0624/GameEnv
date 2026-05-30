// ============================================================
//  combat.js — Battle resolution (fixed)
// ============================================================

const Combat = (() => {

  // Use maxHp for power calculation — not current hp
  function shipsPower(ships) {
    let atk = 0, hp = 0;
    for (const s of ships) {
      const t = Data.SHIP_TYPES[s.type] || {};
      atk += t.attack  || 0;
      hp  += t.hp      || s.maxHp || s.hp || 0; // use template hp, not battle-damaged hp
    }
    return { atk, hp, total: atk * 2 + hp }; // attack weighted more heavily
  }

  function planetDefense(planet) {
    let def = 10;
    for (const b of (planet.buildings || [])) {
      if (b.key === 'shield_gen') def += 80;
    }
    const docked = (planet.ships || []).filter(s => s.state === 'dock');
    def += shipsPower(docked).total;
    return def;
  }

  function winChance(atkPow, defPow) {
    const r = atkPow / Math.max(defPow, 1);
    return Math.min(0.95, Math.max(0.05, r / (r + 1)));
  }

  // 3-phase invasion: orbit → watchdog → ground
  function resolveInvasion(attackerShips, planet, attackerOwner) {
    const log = [];
    let atkShips = [...attackerShips];

    // Phase 1: orbital defenders
    const defenders = (planet.ships || []).filter(s => s.state === 'orbit' && s.type !== 'watchdog');
    if (defenders.length) {
      log.push({ type:'info', text:`⚔ Phase 1: Orbital — ${atkShips.length} attackers vs ${defenders.length} defenders` });
      const r1 = _battle(atkShips, defenders, log);
      atkShips = r1.survivors;
      planet.ships = (planet.ships || []).filter(s => s.state !== 'orbit' || s.type === 'watchdog');
      planet.ships.push(...r1.defSurvivors);
      log.push({ type:'info', text:`  → ${atkShips.length} attackers remain, ${r1.defSurvivors.length} defenders remain` });
    }
    if (!atkShips.length) {
      log.push({ type:'lose', text:'✗ All attackers destroyed in orbital battle' });
      return { won:false, log, survivingAttackers:[] };
    }

    // Phase 2: watchdog stations
    const watchdogs = (planet.ships || []).filter(s => s.type === 'watchdog');
    if (watchdogs.length) {
      log.push({ type:'info', text:`Phase 2: Watchdog station (${watchdogs.length})` });
      const canKill = atkShips.some(s => Data.SHIP_TYPES[s.type]?.canDestroyWatchdog);
      if (!canKill) {
        // Watchdog repels non-BC/DN ships — attacker takes losses and retreats
        const lost = Math.ceil(atkShips.length * 0.5);
        const survivors = atkShips.slice(lost);
        log.push({ type:'lose', text:`Watchdog repelled attack — ${lost} ships lost. Need Battle Cruiser or Dreadnought.` });
        return { won:false, log, survivingAttackers: survivors };
      }
      // BC/DN can destroy watchdog but take moderate damage
      const wdPow = shipsPower(watchdogs);
      const atkPow = shipsPower(atkShips);
      const dmgRatio = Math.min(0.4, wdPow.atk / Math.max(atkPow.hp, 1));
      atkShips = atkShips.filter(() => Math.random() > dmgRatio);
      planet.ships = (planet.ships || []).filter(s => s.type !== 'watchdog');
      log.push({ type:'hit', text:`Watchdog destroyed — ${atkShips.length} attackers remain` });
    }
    if (!atkShips.length) {
      log.push({ type:'lose', text:'✗ Fleet destroyed by watchdog' });
      return { won:false, log, survivingAttackers:[] };
    }

    // Phase 3: ground assault — attacker vs docked ships + structure defense
    const docked    = (planet.ships || []).filter(s => s.state === 'dock');
    const structDef = _structureDefense(planet);
    const atkPow3   = shipsPower(atkShips);
    const defPow3   = { atk: shipsPower(docked).atk * 0.6 + structDef * 0.15, hp: structDef + shipsPower(docked).hp };

    log.push({ type:'info', text:`Phase 3: Ground assault — atk:${Math.round(atkPow3.atk)} vs def:${Math.round(defPow3.atk)} (structures:${Math.round(structDef)} docked:${docked.length})` });

    // Simulate round by round
    let atkHp  = atkPow3.hp;
    let defHp  = defPow3.hp;
    let round  = 0;
    while (atkHp > 0 && defHp > 0 && round < 30) {
      round++;
      const atkDmg = atkPow3.atk * (0.8 + Math.random() * 0.4);
      const defDmg = defPow3.atk * (0.8 + Math.random() * 0.4);
      defHp -= atkDmg;
      atkHp -= defDmg;
      if (round <= 4) log.push({ type:'hit', text:`  Round ${round}: dealt ${Math.round(atkDmg)} / took ${Math.round(defDmg)}` });
    }

    const won = defHp <= 0;

    // Survivors: based on remaining hp fraction — attacker wins → keeps most ships
    const atkHpFrac = Math.max(0, atkHp / Math.max(atkPow3.hp, 1));
    // Each ship survives proportional to remaining hp fraction, with some randomness
    const finals = atkShips.filter(() => Math.random() < Math.max(0.15, atkHpFrac));

    if (won) {
      log.push({ type:'win', text:`✓ VICTORY — ${planet.name} captured! (${finals.length}/${attackerShips.length} ships survived)` });
      planet.ships = (planet.ships || []).filter(s => s.state !== 'dock');
    } else {
      // Defender wins — attacker retreats with survivors
      log.push({ type:'lose', text:`✗ DEFEAT — defense held after ${round} rounds (${finals.length} attackers retreat)` });
    }
    return { won, log, survivingAttackers: finals };
  }

  // Sub-battle between two ship groups — returns survivors of each
  function _battle(attackers, defenders, log) {
    const aPow = shipsPower(attackers);
    const dPow = shipsPower(defenders);

    let aHp = aPow.hp, dHp = dPow.hp;
    let round = 0;

    while (aHp > 0 && dHp > 0 && round < 20) {
      round++;
      const aDmg = aPow.atk * (0.8 + Math.random() * 0.4);
      const dDmg = dPow.atk * (0.8 + Math.random() * 0.4);
      dHp -= aDmg;
      aHp -= dDmg;
      if (round <= 3) log.push({ type:'hit', text:`    Round ${round}: atk ${Math.round(aDmg)} / def ${Math.round(dDmg)}` });
    }

    // Fraction of hp remaining determines survival probability
    const aFrac = Math.max(0, aHp / Math.max(aPow.hp, 1));
    const dFrac = Math.max(0, dHp / Math.max(dPow.hp, 1));

    return {
      survivors:    attackers.filter(() => Math.random() < Math.max(0.1, aFrac)),
      defSurvivors: defenders.filter(() => Math.random() < Math.max(0.1, dFrac)),
    };
  }

  function _structureDefense(planet) {
    let d = 10;
    for (const b of (planet.buildings || [])) {
      const ef = Data.STRUCTURES[b.key]?.effect || {};
      d += ef.defense || 0;
    }
    return d;
  }

  function watchdogFire(watchdogShip, attackingShips, now) {
    const timers = State.get().watchdogTimers;
    const last   = timers[watchdogShip.id] || 0;
    const reload = Data.SHIP_TYPES.watchdog.reloadTime * 1000;
    if (now - last < reload) return null;
    timers[watchdogShip.id] = now;
    if (!attackingShips.length) return null;
    const target = attackingShips[Math.floor(Math.random() * attackingShips.length)];
    const dmg = Data.SHIP_TYPES.watchdog.attack * (0.8 + Math.random() * 0.4);
    target.hp = Math.max(0, (target.hp || 0) - dmg);
    return { watchdog: watchdogShip, target, dmg };
  }

  function hasWarp(systemId) {
    const sys = State.getSystem(systemId);
    if (!sys) return false;
    return sys.planets.some(p => p.owner === 'player' && (p.buildings || []).some(b => b.key === 'warp_engine'));
  }

  return { shipsPower, planetDefense, winChance, resolveInvasion, watchdogFire, hasWarp };
})();
