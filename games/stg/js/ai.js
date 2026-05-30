// ============================================================
//  ai.js — Enemy AI (real-time, timer-based)
// ============================================================

const AI = (() => {

  let lastBuild=0, lastAttack=0;
  let shipCounter=500;
  const BUILD_INTERVAL=28000, ATTACK_INTERVAL=35000;

  function tick(){
    const now=performance.now();
    const state=State.get();
    if(now-lastBuild>BUILD_INTERVAL){ lastBuild=now; _tryBuild(state); }
    if(now-lastAttack>ATTACK_INTERVAL){ lastAttack=now; _tryAttack(state); _tryMissileFire(state); }
    _coloniseNeutral(state);
    _advanceEnemyConstruction(state);
  }

  function _advanceEnemyConstruction(state){
    const dt=0.5; // approximate 0.5s per AI frame
    for(const sys of state.systems){
      for(const pl of sys.planets){
        if(pl.owner!=='enemy')continue;
        if(pl.buildQueue){
          pl.buildQueue.elapsed=(pl.buildQueue.elapsed||0)+dt;
          if(pl.buildQueue.elapsed>=pl.buildQueue.buildTime){
            pl.buildings=pl.buildings||[];
            const def=Data.STRUCTURES[pl.buildQueue.key]||{};
            const pos={x:Math.floor(Math.random()*30)+2,y:Math.floor(Math.random()*20)+2};
            pl.buildings.push({key:pl.buildQueue.key,x:pos.x,y:pos.y});
            if(def.effect?.missiles) pl.missileStock=(pl.missileStock||0)+def.effect.missiles;
            pl.buildQueue=null;
          }
        }
        if(pl.shipQueue){
          pl.shipQueue.elapsed=(pl.shipQueue.elapsed||0)+dt;
          if(pl.shipQueue.elapsed>=pl.shipQueue.buildTime){
            const tmpl=Data.SHIP_TYPES[pl.shipQueue.type];
            pl.ships=pl.ships||[];
            pl.ships.push({
              id:'eai_'+(++shipCounter),type:pl.shipQueue.type,
              name:pl.shipQueue.name,hp:tmpl.hp,maxHp:tmpl.hp,
              state:'dock',owner:'enemy',
              systemId:sys.id,planetIdx:sys.planets.indexOf(pl),
            });
            pl.shipQueue=null;
          }
        }
      }
    }
  }

  function _tryBuild(state){
    for(const sys of state.systems){
      if(sys.owner!=='enemy')continue;
      for(const pl of sys.planets){
        if(pl.owner!=='enemy'||pl.shipQueue||pl.buildQueue)continue;
        // Build shipyard if missing
        if(!(pl.buildings||[]).some(b=>b.key==='shipyard')&&(state._enemy.metal||0)>=800){
          state._enemy.metal-=800;
          pl.buildQueue={key:'shipyard',buildTime:Data.STRUCTURES.shipyard.buildTime,elapsed:0};
          continue;
        }
        // Build ships
        if((pl.buildings||[]).some(b=>b.key==='shipyard')){
          const roster=[{type:'battle_cruiser',cost:700},{type:'destroyer',cost:300},{type:'fighter',cost:150}];
          for(const entry of roster){
            if((state._enemy.metal||0)>=entry.cost){
              state._enemy.metal-=entry.cost;
              const name=Data.SHIP_TYPES[entry.type].name+'-'+(++shipCounter);
              pl.shipQueue={type:entry.type,name,buildTime:Data.SHIP_TYPES[entry.type].buildTime,elapsed:0};
              break;
            }
          }
        }
        // Build missile silo if none
        if(!(pl.buildings||[]).some(b=>b.key==='missile_silo')&&(state._enemy.metal||0)>=400&&(state._enemy.crystal||0)>=200){
          state._enemy.metal-=400; state._enemy.crystal-=200;
          pl.buildQueue={key:'missile_silo',buildTime:50,elapsed:0};
        }
      }
    }
  }

  function _tryAttack(state){
    for(const sys of state.systems){
      if(sys.owner!=='enemy')continue;
      const ships=[];
      sys.planets.forEach(pl=>{
        (pl.ships||[]).filter(s=>s.owner==='enemy'&&(s.state==='orbit'||s.state==='dock'))
          .forEach(s=>{ ships.push({...s,_src:pl}); });
      });
      if(ships.length<2)continue;
      const target=_findTarget(sys,state);
      if(!target)continue;
      const attackers=ships.slice(0,Math.min(ships.length,5));
      attackers.forEach(sh=>{
        if(sh._src)sh._src.ships=(sh._src.ships||[]).filter(s=>s.id!==sh.id);
        delete sh._src; sh.state='travel';
      });
      const warp=Combat.hasWarp(sys.id);
      const tf=State.sendFleet(attackers,sys.id,target.sysId,target.pIdx,warp);
      if(tf){
        tf.owner='enemy';tf.isAttack=true;
        State.subscribe((ev,s,data)=>{
          if(ev!=='fleet_arrived'||data?.id!==tf.id)return;
          const planet=State.getPlanet(target.sysId,target.pIdx);
          if(!planet||planet.owner!=='player')return;
          const result=Combat.resolveInvasion(tf.ships,planet,'enemy');
          if(result.won){
            State.capturePlanet(target.sysId,target.pIdx,'enemy');
            result.survivingAttackers.forEach(sh=>{sh.state='orbit';planet.ships=planet.ships||[];planet.ships.push(sh);});
            State.notify('enemy_capture',{sysId:target.sysId,planetIdx:target.pIdx});
          }
          UI.showCombatLog(result.log,false);
          UI.refresh();
        });
      }
      break;
    }
  }

  function _tryMissileFire(state){
    for(const sys of state.systems){
      if(sys.owner!=='enemy')continue;
      for(const pl of sys.planets){
        if(pl.owner!=='enemy'||(pl.missileStock||0)<1)continue;
        const target=_findTarget(sys,state);
        if(!target)continue;
        const tSys=state.systems.find(s=>s.id===target.sysId);
        const tPl=tSys?.planets[target.pIdx];
        if(!tPl)continue;
        pl._worldX=(sys.x||0.5)*800; pl._worldY=(sys.y||0.5)*600;
        tPl._worldX=(tSys.x||0.5)*800; tPl._worldY=(tSys.y||0.5)*600;
        tPl._sysId=target.sysId; tPl._pIdx=target.pIdx;
        Missiles.fire(pl,tPl,'planet','enemy');
        break;
      }
    }
  }

  function _findTarget(fromSys,state){
    // Same system first
    for(let i=0;i<fromSys.planets.length;i++){
      if(fromSys.planets[i].owner==='player')return{sysId:fromSys.id,pIdx:i};
    }
    // Adjacent
    for(const [a,b] of Data.LANES){
      const adjId=a===fromSys.id?b:b===fromSys.id?a:null;
      if(!adjId)continue;
      const adj=state.systems.find(s=>s.id===adjId);
      if(!adj)continue;
      for(let i=0;i<adj.planets.length;i++){
        if(adj.planets[i].owner==='player')return{sysId:adj.id,pIdx:i};
      }
    }
    return null;
  }

  function _coloniseNeutral(state){
    for(const sys of state.systems){
      if(sys.owner!=='enemy')continue;
      for(const pl of sys.planets){
        if(pl.owner==='none'&&(state._enemy.hydrogen||0)>=200){
          pl.owner='enemy';
          state._enemy.hydrogen-=200;
          pl.buildings=pl.buildings||[];
          // Clear stale hq/scs and place appropriate one
          pl.buildings=pl.buildings.filter(b=>b.key!=='hq'&&b.key!=='space_station');
          const tmpl=Data.PLANET_TYPES[pl.type];
          if(tmpl.landable){
            pl.buildings.push({key:'hq',x:10,y:8});
          } else {
            pl.buildings.push({key:'space_station',x:2,y:2});
          }
        }
      }
    }
  }

  return{tick};
})();
