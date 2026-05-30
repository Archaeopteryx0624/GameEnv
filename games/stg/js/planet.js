// ============================================================
//  planet.js — Surface view (primary control hub)
//  - Tap HQ → build structures
//  - Tap Shipyard → build ships/missiles
//  - Tap Silo → launch missiles
//  - Tap docked ships → send fleet
//  - Cities are big 8×8 clusters
// ============================================================

const PlanetView = (() => {

  let canvas, ctx;
  let planet, systemId, planetIdx;
  let W=0, H=0;
  let camX=0, camY=0;
  const TILE=36;
  let map=null;          // terrain grid
  let structureSprites=[];  // {key, bldg, tx, ty, w, h, worldX, worldY}
  let shipSprites=[];    // {ship, tx, ty, worldX, worldY, liftAnim}
  let buildingAnim=[];   // {type:'missile_move', ...}
  let animId=null;
  let keys={}, lastMove=0;
  let playerShipX=0, playerShipY=0, showPlayerShip=false;
  const MOVE_DELAY=150;
  let _pendingExitToSystem=false;

  // Active context menu
  let ctxMenu=null;  // {kind:'hq'|'shipyard'|'silo'|'ship'|'structure', data, px, py}

  // ── Biome colours ─────────────────────────────────────
  const BIOMES={
    terrestrial:{ deep:'#0d2a5a',shallow:'#1a4a8a',sand:'#c8aa6e',plains:'#3a7a3a',forest:'#1a5a1a',hills:'#5a7a4a',mtn:'#6a5a4a',snow:'#ddeeff' },
    barren:     { deep:'#2a1a0a',shallow:'#3a2a1a',sand:'#5a4a3a',plains:'#4a3a2a',forest:'#3a2a1a',hills:'#5a4a3a',mtn:'#6a5a4a',snow:'#8a8a8a' },
    volcanic:   { deep:'#8a0a0a',shallow:'#cc2200',sand:'#442200',plains:'#3a1a00',forest:'#5a2a0a',hills:'#6a3a1a',mtn:'#4a2a0a',snow:'#cc4400' },
    frozen:     { deep:'#5a8aaa',shallow:'#7aaabb',sand:'#aaccdd',plains:'#ccddee',forest:'#aabbcc',hills:'#bbccdd',mtn:'#ccdde0',snow:'#eef4f8' },
    default:    { deep:'#2a1a0a',shallow:'#3a2a1a',sand:'#5a4a3a',plains:'#4a3a2a',forest:'#3a2a1a',hills:'#5a4a3a',mtn:'#6a5a4a',snow:'#8a8a8a' },
  };

  // ── Noise ─────────────────────────────────────────────
  function _hash(x,y,seed){
    let h=0; for(const c of (seed+x+','+y)) h=Math.imul(31,h)+c.charCodeAt(0)|0;
    h^=h>>>16; h=Math.imul(h,0x45d9f3b); h^=h>>>16;
    return (h>>>0)/0xffffffff;
  }
  function _rng(seed){
    let s=0; for(let i=0;i<seed.length;i++) s=(s*31+seed.charCodeAt(i))>>>0;
    return ()=>{ s=(s^(s<<13))>>>0;s=(s^(s>>17))>>>0;s=(s^(s<<5))>>>0;return s/0xffffffff; };
  }

  // ── Terrain generation ────────────────────────────────
  function _genTerrain(planet, cols, rows){
    const heights=Array.from({length:rows},(_,y)=>Array.from({length:cols},(_,x)=>{
      let v=0;
      for(let o=0;o<6;o++){
        const freq=Math.pow(2,o),amp=1/freq;
        const nx=x/cols*freq,ny=y/rows*freq;
        const ix=Math.floor(nx),iy=Math.floor(ny);
        const fx=nx-ix,fy=ny-iy;
        const sx=fx*fx*(3-2*fx),sy=fy*fy*(3-2*fy);
        v+=(_hash(ix,iy,planet.name)*(1-sx)*(1-sy)+_hash(ix+1,iy,planet.name)*sx*(1-sy)+
            _hash(ix,iy+1,planet.name)*(1-sx)*sy+_hash(ix+1,iy+1,planet.name)*sx*sy)*amp;
      }
      return v;
    }));
    let mn=Infinity,mx=-Infinity;
    heights.forEach(r=>r.forEach(v=>{if(v<mn)mn=v;if(v>mx)mx=v;}));
    const range=mx-mn||1;
    return heights.map(row=>row.map(raw=>{
      const h=(raw-mn)/range;
      let kind='plains',passable=true;
      if(h<.20){kind='deep';passable=false;}
      else if(h<.32){kind='shallow';passable=false;}
      else if(h<.38)kind='sand';
      else if(h<.55)kind='plains';
      else if(h<.70)kind='forest';
      else if(h<.82)kind='hills';
      else if(h<.92){kind='mtn';passable=false;}
      else{kind='snow';passable=false;}
      return{h,kind,passable,overlay:null};
    }));
  }

  // ── Place structures on map ───────────────────────────
  function _placeStructures(){
    structureSprites=[];
    const rng=_rng(planet.name+'struct');
    const cols=map[0].length, rows=map.length;

    for(const bldg of (planet.buildings||[])){
      const def=Data.STRUCTURES[bldg.key]; if(!def) continue;
      const [sw,sh]=def.size||[2,2];

      // Use stored position, snap to passable area
      let tx=bldg.x||Math.floor(rng()*Math.max(1,cols-sw));
      let ty=bldg.y||Math.floor(rng()*Math.max(1,rows-sh));
      tx=Math.max(0,Math.min(cols-sw,tx));
      ty=Math.max(0,Math.min(rows-sh,ty));

      // Mark tiles as occupied
      for(let dy=0;dy<sh;dy++) for(let dx=0;dx<sw;dx++){
        if(map[ty+dy]?.[tx+dx]) map[ty+dy][tx+dx].overlay=bldg.key;
      }
      structureSprites.push({key:bldg.key, bldg, tx, ty, sw, sh,
        worldX:tx*TILE+sw*TILE/2, worldY:ty*TILE+sh*TILE/2});
    }
  }

  // ── Place ships near shipyard ──────────────────────────
  function _placeShips(){
    shipSprites=[];
    const sy=structureSprites.find(s=>s.key==='shipyard');
    let baseX=10, baseY=map.length-4;
    if(sy){ baseX=sy.tx; baseY=sy.ty+sy.sh+1; }

    const docked=(planet.ships||[]).filter(s=>s.state==='dock');
    docked.forEach((ship,i)=>{
      const tx=baseX+(i%4)*2;
      const ty=baseY+Math.floor(i/4)*2;
      shipSprites.push({ship, tx:Math.min(tx,map[0].length-2), ty:Math.min(ty,map.length-2),
        worldX:tx*TILE+TILE/2, worldY:ty*TILE+TILE/2,
        liftAnim:null, selected:false});
    });
  }

  // ── Draw terrain tile ─────────────────────────────────
  function _drawTile(tile, px, py, biome){
    if(tile.overlay){
      _drawStructureTile(tile.overlay, px, py);
    } else {
      ctx.fillStyle=biome[tile.kind]||'#333';
      ctx.fillRect(px,py,TILE,TILE);
      ctx.strokeStyle='rgba(0,0,0,0.04)';
      ctx.lineWidth=0.5;
      ctx.strokeRect(px,py,TILE,TILE);
    }
  }

  // ── Draw a structure tile ─────────────────────────────
  function _drawStructureTile(key, px, py){
    const def=Data.STRUCTURES[key]||{};
    ctx.fillStyle=def.color||'#1a2a3a';
    ctx.fillRect(px,py,TILE,TILE);
    ctx.fillStyle=def.roofColor||'#2a4a6a';
    ctx.fillRect(px+2,py+2,TILE-4,TILE/3);
    ctx.strokeStyle='rgba(0,0,0,0.2)';
    ctx.lineWidth=0.5;
    ctx.strokeRect(px,py,TILE,TILE);
  }

  // ── Draw structure sprites (labels, icons, highlights) ─
  function _drawStructureSprites(){
    for(const ss of structureSprites){
      const def=Data.STRUCTURES[ss.key]; if(!def) continue;
      const px=ss.tx*TILE-camX, py=ss.ty*TILE-camY;
      const pw=ss.sw*TILE, ph=ss.sh*TILE;

      // Skip offscreen
      if(px+pw<0||px>W||py+ph<0||py>H) continue;

      // Special rendering per type
      if(ss.key==='hq')          _drawHQ(px,py,pw,ph,def);
      else if(ss.key==='city')   _drawCity(px,py,pw,ph,ss);
      else if(ss.key==='shipyard')_drawShipyard(px,py,pw,ph,def);
      else if(ss.key==='missile_silo') _drawSilo(px,py,pw,ph);
      else                       _drawGenericStructure(px,py,pw,ph,def);

      // Interactive outline on hover (managed via ctxMenu)
    }
  }

  function _drawHQ(px,py,pw,ph,def){
    // Big command building
    ctx.fillStyle='#0d1a40';
    ctx.fillRect(px,py,pw,ph);
    // Stepped facade
    ctx.fillStyle='#1a2a6a';
    ctx.fillRect(px+pw*.1,py+ph*.1,pw*.8,ph*.7);
    ctx.fillStyle='#2a3a8a';
    ctx.fillRect(px+pw*.2,py+ph*.05,pw*.6,ph*.5);
    // Antenna
    ctx.strokeStyle='#4466ff';
    ctx.lineWidth=2;
    ctx.beginPath();
    ctx.moveTo(px+pw/2,py+ph*.05);
    ctx.lineTo(px+pw/2,py-ph*.35);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(px+pw/2,py-ph*.35,4,0,Math.PI*2);
    ctx.fillStyle='#00c8ff';
    ctx.fill();
    // Windows grid
    ctx.fillStyle='rgba(100,150,255,0.4)';
    const wCols=4,wRows=3;
    for(let r=0;r<wRows;r++) for(let c=0;c<wCols;c++){
      ctx.fillRect(px+pw*.22+c*(pw*.15),py+ph*.18+r*(ph*.15),pw*.1,ph*.1);
    }
    // HQ label
    ctx.fillStyle='#00c8ff';
    ctx.font=`bold ${Math.max(9,pw*.12)}px Share Tech Mono`;
    ctx.textAlign='center'; ctx.textBaseline='bottom';
    ctx.fillText('HQ',px+pw/2,py+ph+12);
  }

  function _drawCity(px,py,pw,ph,ss){
    // City fills its large footprint with a district layout
    const tileW=pw/8, tileH=ph/8;
    const rng2=_rng(ss.tx+','+ss.ty+'city');

    // Base roads
    ctx.fillStyle='#3a3a4a';
    ctx.fillRect(px,py,pw,ph);

    // Road grid
    ctx.fillStyle='#4a4a5a';
    for(let i=0;i<=8;i+=2){
      ctx.fillRect(px+i*tileW,py,tileW*.35,ph);
      ctx.fillRect(px,py+i*tileH,pw,tileH*.35);
    }

    // Building blocks
    for(let r=0;r<4;r++){
      for(let c=0;c<4;c++){
        const bx=px+c*(pw/4)+tileW*.2;
        const by_=py+r*(ph/4)+tileH*.2;
        const bw=pw/4-tileW*.5;
        const bh=ph/4-tileH*.5;
        const hue=200+Math.floor(rng2()*30);
        const light=20+Math.floor(rng2()*15);
        ctx.fillStyle=`hsl(${hue},30%,${light}%)`;
        ctx.fillRect(bx,by_,bw,bh);
        // Roof
        ctx.fillStyle=`hsl(${hue},35%,${light+10}%)`;
        ctx.fillRect(bx,by_,bw,bh*.18);
        // Windows
        ctx.fillStyle='rgba(255,220,100,0.3)';
        const wc=Math.floor(bw/7),wr=Math.floor(bh/7);
        for(let wi=0;wi<wc;wi++) for(let wj=0;wj<wr;wj++){
          if(rng2()>0.3) ctx.fillRect(bx+3+wi*7,by_+bh*.2+wj*7,5,4);
        }
      }
    }
    // City label
    ctx.fillStyle='#ccccff';
    ctx.font=`${Math.max(8,pw*.09)}px Share Tech Mono`;
    ctx.textAlign='center'; ctx.textBaseline='bottom';
    ctx.fillText('CITY',px+pw/2,py+ph+12);
  }

  function _drawShipyard(px,py,pw,ph,def){
    ctx.fillStyle='#0a2010';
    ctx.fillRect(px,py,pw,ph);
    // Hangar doors
    ctx.fillStyle='#1a4a20';
    ctx.fillRect(px+4,py+ph*.3,pw*.45,ph*.6);
    ctx.fillRect(px+pw*.5+4,py+ph*.3,pw*.45,ph*.6);
    // Door gap
    ctx.fillStyle='#000a00';
    ctx.fillRect(px+pw/2-2,py+ph*.3,4,ph*.6);
    // Crane arm
    ctx.strokeStyle='#2a6a30';
    ctx.lineWidth=3;
    ctx.beginPath();
    ctx.moveTo(px+pw*.1,py+ph*.1);
    ctx.lineTo(px+pw*.9,py+ph*.1);
    ctx.lineTo(px+pw*.9,py+ph*.5);
    ctx.stroke();
    // Label
    ctx.fillStyle='#00e5a0';
    ctx.font=`${Math.max(8,pw*.1)}px Share Tech Mono`;
    ctx.textAlign='center'; ctx.textBaseline='bottom';
    ctx.fillText('SHIPYARD',px+pw/2,py+ph+12);
  }

  function _drawSilo(px,py,pw,ph){
    const ms=planet.missileStock||0;
    ctx.fillStyle='#200a0a';
    ctx.fillRect(px,py,pw,ph);
    // Hatch
    ctx.fillStyle=ms>0?'#6a1a1a':'#2a1a1a';
    ctx.fillRect(px+4,py+4,pw-8,ph*.5);
    // Missile stored indicator
    if(ms>0){
      ctx.fillStyle='#ff5500';
      ctx.fillRect(px+pw/2-2,py+8,4,ph*.35);
      ctx.beginPath();
      ctx.moveTo(px+pw/2-5,py+12);
      ctx.lineTo(px+pw/2+5,py+12);
      ctx.lineTo(px+pw/2,py+6);
      ctx.closePath();
      ctx.fillStyle='#ff8800';
      ctx.fill();
    }
    ctx.fillStyle=ms>0?'#ff9900':'#555555';
    ctx.font=`${Math.max(8,pw*.2)}px Share Tech Mono`;
    ctx.textAlign='center'; ctx.textBaseline='bottom';
    ctx.fillText('SILO ×'+ms,px+pw/2,py+ph+12);
  }

  function _drawGenericStructure(px,py,pw,ph,def){
    ctx.fillStyle=def.color||'#1a2a3a';
    ctx.fillRect(px,py,pw,ph);
    ctx.fillStyle=def.roofColor||'#2a3a5a';
    ctx.fillRect(px+2,py+2,pw-4,ph*.3);
    ctx.font=`${Math.max(10,pw*.35)}px serif`;
    ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillText(def.icon||'?',px+pw/2,py+ph*.6);
    ctx.fillStyle='#aaaacc';
    ctx.font=`${Math.max(7,pw*.12)}px Share Tech Mono`;
    ctx.textBaseline='bottom';
    ctx.fillText(def.name,px+pw/2,py+ph+12);
  }

  // ── Draw docked ships near shipyard ───────────────────
  function _drawShipSprites(){
    for(const ss of shipSprites){
      if(ss.liftAnim){
        // Lift-off: rise upward
        ss.liftAnim.y-=2;
        ss.liftAnim.alpha=Math.max(0,ss.liftAnim.alpha-0.015);
        if(ss.liftAnim.alpha<=0){
          // Remove from dock list
          planet.ships=(planet.ships||[]).filter(s=>s.id!==ss.ship.id);
          ss.ship.state='orbit';
          _placeShips();
          // If no more ships in flight and this was a sendSelectedShips call,
          // offer exit to system view to see the fleet
          const stillLaunching=shipSprites.some(s2=>s2.liftAnim);
          if(!stillLaunching && _pendingExitToSystem){
            _pendingExitToSystem=false;
            setTimeout(()=>{
              // Only auto-exit if still on surface and no menu open
              if(animId&&planet){
                UI.toast('Tap ◄ to watch your fleet in system view','',3000);
              }
            },400);
          }
          return;
        }
        const py2=ss.worldY-camY-((1-ss.liftAnim.alpha)*60);
        ctx.globalAlpha=ss.liftAnim.alpha;
        Ships.drawSurface(ctx,ss.ship,ss.worldX-camX,py2,TILE*.45,ss.ship.owner||planet.owner);
        ctx.globalAlpha=1;
        continue;
      }
      const px2=ss.worldX-camX, py2=ss.worldY-camY;
      if(px2<-TILE||px2>W+TILE||py2<-TILE||py2>H+TILE) continue;
      Ships.drawSurface(ctx,ss.ship,px2,py2,TILE*.45,ss.ship.owner||planet.owner);
      // Selection ring
      if(ss.selected){
        ctx.strokeStyle='#00c8ff'; ctx.lineWidth=2;
        ctx.beginPath(); ctx.arc(px2,py2,TILE*.5,0,Math.PI*2); ctx.stroke();
      }
    }
  }

  // ── Building animations (missile walk to silo) ────────
  function _drawBuildingAnims(){
    buildingAnim=buildingAnim.filter(anim=>{
      if(anim.type==='missile_move'){
        anim.progress=Math.min(1,(anim.progress||0)+0.012);
        const px2=anim.sx+(anim.tx-anim.sx)*anim.progress-camX;
        const py2=anim.sy+(anim.ty-anim.sy)*anim.progress-camY;
        ctx.font='16px serif';
        ctx.textAlign='center'; ctx.textBaseline='middle';
        ctx.globalAlpha=anim.progress<0.9?1:1-((anim.progress-0.9)/0.1);
        ctx.fillText('💥',px2,py2);
        ctx.globalAlpha=1;
        if(anim.progress>=1){
          planet.missileStock=(planet.missileStock||0)+anim.count;
          return false;
        }
        return true;
      }
      return false;
    });
  }

  // ── Context menu ──────────────────────────────────────
  function _showContextMenu(kind, data, screenX, screenY){
    ctxMenu={kind,data,screenX,screenY};
    _renderContextMenu();
  }

  function _renderContextMenu(){
    if(!ctxMenu) return;
    const el=document.getElementById('surface-ctx-menu');
    if(!el) return;

    // Position relative to the surface-overlay container, not raw canvas
    // canvas coords (cx2,cy2) are in canvas pixels; we need CSS pixels in the overlay
    const rect2 = canvas ? canvas.getBoundingClientRect() : {left:0,top:0,width:W,height:H};
    const scaleX2 = rect2.width  / (canvas?.width  || W);
    const scaleY2 = rect2.height / (canvas?.height || H);
    // Convert canvas-pixel screen coords back to CSS pixels within overlay
    const menuX = ctxMenu.screenX * scaleX2 + rect2.left - (document.getElementById('surface-overlay')?.getBoundingClientRect().left || 0);
    const menuY = ctxMenu.screenY * scaleY2 + rect2.top  - (document.getElementById('surface-overlay')?.getBoundingClientRect().top  || 0);
    const overlayW = document.getElementById('surface-overlay')?.clientWidth  || window.innerWidth;
    const overlayH = document.getElementById('surface-overlay')?.clientHeight || window.innerHeight;
    el.style.left = Math.max(4, Math.min(menuX, overlayW - 230)) + 'px';
    el.style.top  = Math.max(50, Math.min(menuY + 10, overlayH - 320)) + 'px';
    el.classList.remove('hidden');

    let html='';
    if(ctxMenu.kind==='hq'){
      html=`<div class="ctxm-title">🏛 HQ — BUILD</div>`;
      const {resources}=State.get();
      const applicable=Object.entries(Data.STRUCTURES).filter(([k,s])=>{
        if(k==='hq') return false;
        if(s.unique&&(planet.buildings||[]).some(b=>b.key===k)) return false;
        if(s.requires&&!s.requires.includes(planet.type)) return false;
        return true;
      });
      applicable.forEach(([key,s])=>{
        const ok=Object.entries(s.cost||{}).every(([r,v])=>(resources[r]||0)>=v);
        const costStr=Object.entries(s.cost||{}).map(([r,v])=>v+' '+r).join(' · ')||'Free';
        html+=`<div class="ctxm-item${ok?'':' dim'}" onclick="${ok?`PlanetView.buildFromHQ('${key}')`:''}">${s.icon} ${s.name}<span class="ctxm-cost">${costStr}</span></div>`;
      });
    } else if(ctxMenu.kind==='shipyard'){
      html=`<div class="ctxm-title">🏗 SHIPYARD</div>`;
      if(planet.buildQueue||planet.shipQueue){
        const q=planet.shipQueue||planet.buildQueue;
        const pct=Math.round((q.elapsed||0)/q.buildTime*100);
        html+=`<div class="ctxm-item dim">${q.name||Data.STRUCTURES[q.key]?.name||'Building'} — ${pct}%</div>`;
      } else {
        const {resources}=State.get();
        html+='<div class="ctxm-sub">SHIPS</div>';
        Object.entries(Data.SHIP_TYPES).forEach(([key,s])=>{
          const ok=Object.entries(s.buildCost||{}).every(([r,v])=>(resources[r]||0)>=v);
          const cost=Object.entries(s.buildCost||{}).map(([r,v])=>v+' '+r).join(' · ');
          html+=`<div class="ctxm-item${ok?'':' dim'}" onclick="${ok?`PlanetView.buildShip('${key}')`:''}">${s.surfaceIcon||'▲'} ${s.name} <span class="ctxm-cost">${cost} · ${s.buildTime}s</span></div>`;
        });
        html+='<div class="ctxm-sub">MISSILES</div>';
        const ms=planet.missileStock||0;
        const silos=(planet.buildings||[]).filter(b=>b.key==='missile_silo').length;
        const maxMs=silos*3;
        const canMs=(resources.crystal||0)>=50&&ms<maxMs;
        html+=`<div class="ctxm-item${canMs?'':' dim'}" onclick="${canMs?`PlanetView.buildMissiles(3)`:''}">${'💥'} Build 3 Missiles <span class="ctxm-cost">50 crystal${ms>=maxMs?' · FULL':''}</span></div>`;
        if(!silos) html+=`<div class="ctxm-note">Build a Missile Silo first (from HQ)</div>`;
      }
    } else if(ctxMenu.kind==='silo'){
      const ms=planet.missileStock||0;
      html=`<div class="ctxm-title">💥 MISSILE SILO — ×${ms}</div>`;
      if(ms===0){
        html+=`<div class="ctxm-item dim">No missiles — build via Shipyard</div>`;
      } else {
        html+=`<div class="ctxm-sub">TARGET MODE</div>`;
        html+=`<div class="ctxm-item" onclick="PlanetView.launchMissile('auto')">🤖 Auto-defend (incoming enemies)</div>`;
        html+=`<div class="ctxm-item" onclick="PlanetView.launchMissile('planet')">🎯 Target enemy planet</div>`;
        html+=`<div class="ctxm-item" onclick="PlanetView.launchMissile('ship')">🚀 Target enemy ship</div>`;
        html+=`<div class="ctxm-item" onclick="PlanetView.launchMissile('watchdog')">⬡ Target watchdog station</div>`;
      }
    } else if(ctxMenu.kind==='ships'){
      const selected=shipSprites.filter(s=>s.selected);
      const probesOnly=selected.length>0&&selected.every(s=>Data.SHIP_TYPES[s.ship.type]?.isProbe);
      html=`<div class="ctxm-title">${probesOnly?'🔭':'🚀'} <span id="ctxm-sel-count">${selected.length}</span> ${probesOnly?'PROBE(S)':'SHIP(S)'} SELECTED</div>`;
      html+=`<div class="ctxm-note" style="padding:4px 12px;color:var(--dim)">Tap more ships to add to group</div>`;
      if(!selected.length){
        html+=`<div class="ctxm-note">Tap ships to select, then open menu again</div>`;
      } else if(probesOnly){
        html+=`<div class="ctxm-sub">STAR SYSTEMS — tap to send probe</div>`;
        State.get().systems.forEach(sys=>{
          // Skip current system — probes should go somewhere else
          if(sys.id===systemId) return;
          const icon = sys.explored ? '🔭' : '❓';
          const status = sys.explored ? 'already explored' : 'UNEXPLORED';
          const dim = sys.explored ? ' dim' : '';
          html+=`<div class="ctxm-item${dim}" onclick="PlanetView.sendProbes('${sys.id}')">${icon} ${sys.name} · ${status}</div>`;
        });
      } else {
        html+=`<div class="ctxm-sub">DESTINATION</div>`;
        // List all known planets (friendly + enemy + neutral)
        State.get().systems.forEach(sys=>{
          if(!sys.explored) return;
          sys.planets.forEach((pl,pIdx)=>{
            if(pl===planet) return;
            const icon=pl.owner==='player'?'🟦':pl.owner==='enemy'?'🔴':'⬜';
            html+=`<div class="ctxm-item" onclick="PlanetView.sendSelectedShips('${sys.id}',${pIdx})">${icon} ${pl.name} · ${sys.name} · ${pl.owner==='enemy'?'ATTACK':'DEPLOY'}</div>`;
          });
        });
      }
    } else if(ctxMenu.kind==='structure'){
      const def=Data.STRUCTURES[ctxMenu.data.key]||{};
      html=`<div class="ctxm-title">${def.icon} ${def.name}</div>`;
      html+=`<div class="ctxm-note">${def.desc}</div>`;
      if(def.effect){
        Object.entries(def.effect).forEach(([k,v])=>{
          html+=`<div class="ctxm-item dim">+${v} ${k}/s</div>`;
        });
      }
    }

    html+=`<div class="ctxm-close" onclick="PlanetView.closeCtxMenu()">✕ CLOSE</div>`;
    el.innerHTML=html;
  }

  function closeCtxMenu(){
    ctxMenu=null;
    const el=document.getElementById('surface-ctx-menu');
    if(el) el.classList.add('hidden');
  }

  // ── Build actions ─────────────────────────────────────
  function buildFromHQ(key){
    closeCtxMenu();
    const def=Data.STRUCTURES[key]; if(!def) return;
    const ok=State.queueBuild(systemId,planetIdx,key);
    if(ok){
      UI.toast(`✓ ${def.name} construction started (${def.buildTime}s)`,'',2500);
    } else {
      UI.toast('✗ Cannot build — insufficient resources or already building','',2000);
    }
  }

  function buildShip(type){
    closeCtxMenu();
    const ok=State.queueShip(systemId,planetIdx,type);
    if(ok){
      UI.toast(`✓ ${Data.SHIP_TYPES[type].name} queued (${Data.SHIP_TYPES[type].buildTime}s)`,'',2500);
    } else {
      UI.toast('✗ Cannot build ship','',1500);
    }
  }

  function buildMissiles(count){
    closeCtxMenu();
    const s=State.get();
    if((s.resources.crystal||0)<50){ UI.toast('✗ Need 50 crystal','',1500); return; }
    const silos=(planet.buildings||[]).filter(b=>b.key==='missile_silo').length;
    if(!silos){ UI.toast('✗ Build a Missile Silo first','',1500); return; }
    const maxMs=silos*3;
    if((planet.missileStock||0)>=maxMs){ UI.toast('Silos are full','',1500); return; }
    s.resources.crystal-=50;

    // Find shipyard and silo world positions for animation
    const sy=structureSprites.find(s2=>s2.key==='shipyard');
    const silo=structureSprites.find(s2=>s2.key==='missile_silo');
    if(sy&&silo){
      buildingAnim.push({
        type:'missile_move',
        sx:sy.worldX, sy:sy.worldY,
        tx:silo.worldX, ty:silo.worldY,
        progress:0, count,
      });
      UI.toast('Missiles moving to silo...','',2000);
    } else {
      planet.missileStock=(planet.missileStock||0)+count;
      UI.toast(`💥 +${count} missiles ready`,'',1500);
    }
    UI.updateResources();
  }

  function launchMissile(mode){
    closeCtxMenu();
    if((planet.missileStock||0)<1){ UI.toast('No missiles','',1500); return; }

    if(mode==='auto'){
      planet.autoDefend=!planet.autoDefend;
      UI.toast(planet.autoDefend?'🛡 Auto-defend ON':'Auto-defend OFF','',2500);
      return;
    }

    // Build a target picker directly — no world coords needed.
    // Missiles resolve targets by ship ID or planet sysId/pIdx, not screen coords.
    const el=document.getElementById('surface-ctx-menu');
    if(!el) return;

    let html=`<div class="ctxm-title">💥 MISSILE TARGET (×${planet.missileStock})</div>`;

    if(mode==='planet'){
      html+=`<div class="ctxm-sub">ENEMY PLANETS</div>`;
      let found=false;
      State.get().systems.forEach(sys=>{
        sys.planets.forEach((pl,pIdx)=>{
          if(pl.owner!=='enemy') return;
          found=true;
          html+=`<div class="ctxm-item" onclick="PlanetView._fireMissileAt('planet','${sys.id}',${pIdx})">
            🔴 ${pl.name} · ${sys.name}
            <span class="ctxm-cost">${(pl.buildings||[]).filter(b=>b.key==='shield_gen').length} shields</span>
          </div>`;
        });
      });
      if(!found) html+=`<div class="ctxm-note">No enemy planets known</div>`;

    } else if(mode==='ship'){
      html+=`<div class="ctxm-sub">ENEMY SHIPS</div>`;
      let found=false;
      State.get().systems.forEach(sys=>{
        sys.planets.forEach(pl=>{
          (pl.ships||[]).filter(s=>s.owner==='enemy'&&s.type!=='watchdog').forEach(sh=>{
            found=true;
            html+=`<div class="ctxm-item" onclick="PlanetView._fireMissileAt('ship','${sh.id}')">
              ▲ ${sh.name} · ${Data.SHIP_TYPES[sh.type]?.name||sh.type} · HP:${sh.hp}
            </div>`;
          });
        });
      });
      // Also traveling fleets
      State.get().travelingFleets.filter(tf=>tf.owner==='enemy').forEach(tf=>{
        tf.ships.forEach(sh=>{
          found=true;
          html+=`<div class="ctxm-item" onclick="PlanetView._fireMissileAt('ship','${sh.id}')">
            ▲ ${sh.name} (traveling) · HP:${sh.hp}
          </div>`;
        });
      });
      if(!found) html+=`<div class="ctxm-note">No enemy ships visible</div>`;

    } else if(mode==='watchdog'){
      html+=`<div class="ctxm-sub">WATCHDOG STATIONS</div>`;
      let found=false;
      State.get().systems.forEach(sys=>{
        sys.planets.forEach(pl=>{
          (pl.ships||[]).filter(s=>s.type==='watchdog'&&pl.owner==='enemy').forEach(wd=>{
            found=true;
            html+=`<div class="ctxm-item" onclick="PlanetView._fireMissileAt('watchdog','${wd.id}')">
              ⬡ ${wd.name||'Watchdog'} at ${pl.name} · HP:${wd.hp}
            </div>`;
          });
        });
      });
      if(!found) html+=`<div class="ctxm-note">No enemy watchdogs visible</div>`;
    }

    html+=`<div class="ctxm-close" onclick="PlanetView.closeCtxMenu()">✕ CLOSE</div>`;
    el.innerHTML=html;
    // Position near centre of screen
    const overlayEl=document.getElementById('surface-overlay');
    const oW=overlayEl?.clientWidth||window.innerWidth;
    const oH=overlayEl?.clientHeight||window.innerHeight;
    el.style.left=Math.max(4,oW/2-110)+'px';
    el.style.top=Math.max(50,oH/4)+'px';
    el.classList.remove('hidden');
    ctxMenu={kind:'_missile_picker'};
  }

  // Fire missile by ID or planet coords — no world coords needed
  function _fireMissileAt(targetType, idOrSysId, pIdx){
    closeCtxMenu();
    if((planet.missileStock||0)<1){ UI.toast('No missiles','',1500); return; }

    let targetObj=null;
    if(targetType==='planet'){
      targetObj=State.getPlanet(idOrSysId, pIdx);
      if(targetObj){
        // Use approximate world coords (doesn't matter — missile uses ID-based tracking)
        targetObj._worldX=targetObj._worldX||500;
        targetObj._worldY=targetObj._worldY||300;
        targetObj._sysId=idOrSysId;
        targetObj._pIdx=pIdx;
      }
    } else {
      // ship or watchdog — find by ID
      targetObj=State.getShip(idOrSysId);
      if(targetObj){
        targetObj._worldX=targetObj._worldX||500;
        targetObj._worldY=targetObj._worldY||300;
      }
    }

    if(!targetObj){ UI.toast('Target not found','',1500); return; }

    // Source world coords — use planet's stored position or default
    planet._worldX=planet._worldX||400;
    planet._worldY=planet._worldY||300;

    const ok=Missiles.fire(planet, targetObj, targetType, 'player');
    if(ok){
      UI.toast(`💥 Missile launched → ${targetObj.name||targetType}`,'',2000);
      UI.updateResources();
      // Update silo display in the info panel
      const siloEl=document.querySelector('.ctxm-title');
      if(siloEl) siloEl.textContent=`💥 MISSILE SILO — ×${planet.missileStock}`;
    } else {
      UI.toast('✗ No missiles left','',1500);
    }
  }

  // ── Ship selection + send ─────────────────────────────
  function _tapShip(ss, screenX, screenY){
    const wasSelected = ss.selected;
    ss.selected = !ss.selected;
    const sel = shipSprites.filter(s => s.selected);

    if(sel.length === 0){
      // Deselected last ship — close menu
      closeCtxMenu();
    } else if(wasSelected && !ss.selected){
      // Just deselected one — update count in menu if open
      const countEl = document.getElementById('ctxm-sel-count');
      if(countEl) countEl.textContent = sel.length + ' selected';
    } else {
      // Just selected a ship — show/update the send menu
      _showContextMenu('ships', {selected:sel}, screenX, screenY);
    }
  }

  function sendProbes(toSysId){
    closeCtxMenu();
    const selected=shipSprites.filter(s=>s.selected&&Data.SHIP_TYPES[s.ship.type]?.isProbe);
    if(!selected.length){ UI.toast('No probes selected','',1500); return; }

    const hasRam=_checkRam();
    selected.forEach(ss=>{
      if(hasRam) ss.liftAnim={y:ss.worldY,alpha:1};
      else { planet.ships=(planet.ships||[]).filter(s=>s.id!==ss.ship.id); ss.ship.state='orbit'; }
      ss.selected=false;
    });
    _pendingExitToSystem=true;
    const ships=selected.map(s=>s.ship);
    const targetSys=State.getSystem(toSysId);
    const sysName=targetSys?.name||toSysId;

    setTimeout(()=>{
      ships.forEach(sh=>{ sh.owner='player'; });
      planet.ships=(planet.ships||[]).filter(s=>!ships.find(sh=>sh.id===s.id));
      const warp=Combat.hasWarp(systemId);
      // toPlanetIdx=0 placeholder — arrival handler detects probe + unexplored
      // Wire arrival handler FIRST, before sendFleet
      const isUnexplored = targetSys && !targetSys.explored;
      const probeArrivalHandler = (ev, s, data) => {
        if(ev !== 'fleet_arrived') return;
        // Match by checking ships — tf not yet defined so match by target system
        if(data?.targetSystemId !== toSysId) return;
        if(!data?.ships?.every(sh => Data.SHIP_TYPES[sh.type]?.isProbe)) return;
        if(data) data._shipsHandled = true; // probes consumed on arrival
        const sys2 = State.getSystem(toSysId);
        if(!sys2) return;
        if(!sys2.explored) {
          sys2.explored = true;
          sys2.planets = State._generatePlanetsPublic();
          State.notify('explore');
          UI.toast(`🔭 ${sys2.name} explored — ${sys2.planets.length} planets found`, '', 3500);
        } else {
          UI.toast(`🔭 Probe reached ${sys2.name}`, '', 2000);
        }
        UI.refresh();
      };
      if(isUnexplored) State.subscribe(probeArrivalHandler);

      const tf = State.sendFleet(ships, systemId, toSysId, 0, warp);
      if(tf) {
        tf.owner = 'player';
        tf.isProbe = true;
      }
      UI.toast(`🔭 ${ships.length} probe(s) → ${sysName}${warp?' ⚡':''}`, '', 2500);
      _placeShips();
    }, hasRam?1200:0);
  }

  function sendSelectedShips(toSysId, toPlanetIdx){
    closeCtxMenu();
    const selected=shipSprites.filter(s=>s.selected);
    if(!selected.length){ UI.toast('No ships selected','',1500); return; }

    // Animate lift-off
    const hasRam=_checkRam();
    selected.forEach(ss=>{
      if(hasRam){
        ss.liftAnim={y:ss.worldY,alpha:1};
      } else {
        // Instant — just remove from dock
        planet.ships=(planet.ships||[]).filter(s=>s.id!==ss.ship.id);
        ss.ship.state='orbit';
      }
      ss.selected=false;
    });

    // After lift-off delay, dispatch fleet
    _pendingExitToSystem=true;
    const ships=selected.map(s=>s.ship);
    setTimeout(()=>{
      const warp=Combat.hasWarp(systemId);
      ships.forEach(sh=>{ sh.owner=sh.owner||'player'; });
      // Remove from planet
      planet.ships=(planet.ships||[]).filter(s=>!ships.find(sh=>sh.id===s.id));
      const tf=State.sendFleet(ships,systemId,toSysId,toPlanetIdx,warp);
      if(tf){
        tf.owner='player';
        const destPl=State.getPlanet(toSysId,toPlanetIdx);
        if(destPl&&destPl.owner==='enemy'){
          tf.isAttack=true;
          Modes._wireArrivalCombat(tf,toSysId,toPlanetIdx);
        } else if(destPl&&destPl.owner==='none'){
          // Wire colonise: places HQ or SCS automatically on arrival
          State.subscribe((ev,s,data)=>{
            if(ev!=='fleet_arrived'||data?.id!==tf.id) return;
            const pl=State.getPlanet(toSysId,toPlanetIdx);
            if(!pl||pl.owner!=='none') return;
            pl.owner='player';
            pl.buildings=pl.buildings||[];
            const tmpl=Data.PLANET_TYPES[pl.type];
            if(tmpl.landable){
              if(!pl.buildings.some(b=>b.key==='hq')){
                const pos=State._findBuildPos(pl,[3,3]);
                pl.buildings.push({key:'hq',x:pos.x,y:pos.y});
              }
            } else {
              if(!pl.buildings.some(b=>b.key==='space_station')){
                pl.buildings.push({key:'space_station',x:2,y:2});
              }
            }
            tf._shipsHandled = true;
            tf.ships.forEach(sh=>{
              sh.state='orbit';
              pl.ships=pl.ships||[];
              if(!pl.ships.find(s=>s.id===sh.id)) pl.ships.push(sh);
            });
            State.notify('colonise');
            const struct=tmpl.landable?'HQ':'Space Control Station';
            UI.toast(`✓ ${pl.name} colonised — ${struct} established!`,'',3000);
            UI.refresh();
          });
        }
        // Friendly destination — ships just orbit on arrival (handled by state.js _arriveFleet)
      }
      const destName=State.getSystem(toSysId)?.name||'?';
      UI.toast(`🚀 ${ships.length} ships → ${destName}${warp?' ⚡':''}`,'',2500);
      _placeShips();
    }, hasRam ? 1200 : 0);
  }

  function _checkRam(){
    // navigator.deviceMemory is in GB; fallback to true on unknown
    const mem=navigator.deviceMemory;
    if(!mem) return true;
    return mem>=1;
  }

  // ── Main render loop ──────────────────────────────────
  function _loop(){
    // Guard: if hide() was called, animId was nulled — stop the loop
    if(!animId||!canvas||!map) return;

    // WASD movement
    const now=Date.now();
    if(showPlayerShip&&now-lastMove>MOVE_DELAY){
      let nx=playerShipX,ny=playerShipY;
      if(keys['ArrowUp']   ||keys['w']||keys['W'])ny--;
      if(keys['ArrowDown'] ||keys['s']||keys['S'])ny++;
      if(keys['ArrowLeft'] ||keys['a']||keys['A'])nx--;
      if(keys['ArrowRight']||keys['d']||keys['D'])nx++;
      const cols=map[0].length,rows=map.length;
      nx=Math.max(0,Math.min(cols-1,nx));
      ny=Math.max(0,Math.min(rows-1,ny));
      if(map[ny]?.[nx]?.passable!==false&&!map[ny]?.[nx]?.overlay){
        playerShipX=nx;playerShipY=ny;lastMove=now;
        camX=playerShipX*TILE-W/2;camY=playerShipY*TILE-H/2;
        _clampCam();
      }
    }

    ctx.clearRect(0,0,W,H);

    // Terrain
    const biome=BIOMES[planet.type]||BIOMES.default;
    const sx=Math.max(0,Math.floor(camX/TILE));
    const sy=Math.max(0,Math.floor(camY/TILE));
    const ex=Math.min(map[0].length,sx+Math.ceil(W/TILE)+2);
    const ey=Math.min(map.length,   sy+Math.ceil(H/TILE)+2);
    for(let y=sy;y<ey;y++) for(let x=sx;x<ex;x++){
      _drawTile(map[y][x], x*TILE-camX, y*TILE-camY, biome);
    }

    _drawStructureSprites();
    _drawShipSprites();
    _drawBuildingAnims();

    // Player ship
    if(showPlayerShip){
      const el=document.getElementById('surface-ship');
      el.style.left=(playerShipX*TILE-camX+TILE/2)+'px';
      el.style.top =(playerShipY*TILE-camY+TILE/2)+'px';
    }

    // Scanlines
    ctx.fillStyle='rgba(0,0,0,0.025)';
    for(let y2=0;y2<H;y2+=2) ctx.fillRect(0,y2,W,1);

    // Update missiles even from surface view (they travel in background)
    Missiles.update();

    // Only schedule next frame if still active
    if(animId!==null) animId=requestAnimationFrame(_loop);
  }

  function _clampCam(){
    if(!map) return;
    camX=Math.max(0,Math.min(map[0].length*TILE-W,camX));
    camY=Math.max(0,Math.min(map.length*TILE-H,camY));
  }

  // ── Canvas click/tap handler ──────────────────────────
  function _onTap(e){
    if(!map) return;
    e.preventDefault();
    e.stopPropagation();

    // Get touch or mouse point relative to CANVAS element
    // Must account for CSS scaling: canvas may be styled differently from its pixel size
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width  / rect.width;
    const scaleY = canvas.height / rect.height;

    const touch = e.touches?.[0] || e.changedTouches?.[0];
    const rawX = touch ? touch.clientX : e.clientX;
    const rawY = touch ? touch.clientY : e.clientY;

    // Pixel coords inside the canvas element
    const cx2 = (rawX - rect.left) * scaleX;
    const cy2 = (rawY - rect.top)  * scaleY;

    // World coords (adding camera offset)
    const wx = cx2 + camX;
    const wy = cy2 + camY;
    const tx = Math.floor(wx / TILE);
    const ty = Math.floor(wy / TILE);

    // Priority 1: check structure tiles FIRST (they sit on top visually)
    // Use world-pixel distance for HQ/city/shipyard (large multi-tile structures)
    for(const ss of structureSprites){
      // Test whether the tapped tile falls within this structure's tile footprint
      if(tx >= ss.tx && tx < ss.tx + ss.sw && ty >= ss.ty && ty < ss.ty + ss.sh){
        _tapStructure(ss, cx2, cy2);
        return;
      }
    }

    // Priority 2: docked ships (near shipyard area)
    for(const ss of shipSprites){
      if(!ss.liftAnim && Math.abs(ss.worldX - wx) < TILE * 1.2 && Math.abs(ss.worldY - wy) < TILE * 1.2){
        _tapShip(ss, cx2, cy2);
        return;
      }
    }

    // Nothing hit — deselect + close menu + move ship
    shipSprites.forEach(s => s.selected = false);
    closeCtxMenu();

    if(showPlayerShip && map[ty]?.[tx]?.passable !== false && !map[ty]?.[tx]?.overlay){
      playerShipX = tx; playerShipY = ty;
      camX = playerShipX * TILE - W/2;
      camY = playerShipY * TILE - H/2;
      _clampCam();
    }
  }

  function _tapStructure(ss, screenX, screenY){
    closeCtxMenu();
    const key=ss.key;
    if(key==='hq') _showContextMenu('hq',ss,screenX,screenY);
    else if(key==='shipyard') _showContextMenu('shipyard',ss,screenX,screenY);
    else if(key==='missile_silo') _showContextMenu('silo',ss,screenX,screenY);
    else _showContextMenu('structure',ss,screenX,screenY);
  }

  // ── Build complete hook ───────────────────────────────
  function onBuildComplete(key){
    const def=Data.STRUCTURES[key];
    if(!def) return;
    // Refresh structure sprites
    _rebuildMap();
    if(def.isShipyard) UI.toast('🏗 Shipyard complete — tap to build ships','',3000);
    else UI.toast(`✓ ${def.name} complete`,'',2000);
  }

  function onShipBuilt(ship){
    _placeShips();
    const sy=structureSprites.find(s=>s.key==='shipyard');
    UI.toast(`✓ ${ship.name} ready at ${sy?'Shipyard':'dock'}`,'',2500);
  }

  function _rebuildMap(){
    if(!planet) return;
    // Re-overlay structure tiles
    for(const row of map) for(const t of row) t.overlay=null;
    _placeStructures();
    _placeShips();
  }

  // ── Show/hide ─────────────────────────────────────────
  function show(sysId, pIdx){
    systemId=sysId; planetIdx=pIdx;
    planet=State.getPlanet(sysId,pIdx);
    if(!planet) return;

    const tmpl=Data.PLANET_TYPES[planet.type];
    const overlay=document.getElementById('surface-overlay');
    overlay.classList.remove('hidden');
    document.getElementById('surface-title').textContent=planet.name.toUpperCase();
    document.getElementById('surface-subtitle').textContent=
      tmpl.label.toUpperCase()+' · '+(planet.owner==='player'?'CONTROLLED':planet.owner==='enemy'?'ENEMY':'UNCOLONISED');

    canvas=document.getElementById('surface-canvas');
    const wrap=document.getElementById('surface-canvas-wrap');
    W=wrap.clientWidth; H=wrap.clientHeight;
    canvas.width=W; canvas.height=H;
    ctx=canvas.getContext('2d');

    // Grid size scaled to planet radius
    const scale=Math.max(1,Math.log10(planet.radius||1000)-2.5);
    const COLS=Math.round(42*scale), ROWS=Math.round(28*scale);
    map=_genTerrain(planet,COLS,ROWS);
    _placeStructures();
    _placeShips();

    showPlayerShip=planet.owner==='player';
    if(showPlayerShip){
      // Start near HQ
      const hq=structureSprites.find(s=>s.key==='hq');
      playerShipX=hq?hq.tx+hq.sw+1:Math.floor(COLS/2);
      playerShipY=hq?hq.ty:Math.floor(ROWS/2);
      document.getElementById('surface-ship').classList.remove('hidden');
    } else {
      document.getElementById('surface-ship').classList.add('hidden');
    }
    camX=playerShipX*TILE-W/2; camY=playerShipY*TILE-H/2; _clampCam();

    // Use pointerup for unified mouse+touch. touchend for iOS compatibility.
    // Do NOT use 'click' — it fires after touchend and causes double-triggers on mobile.
    canvas.addEventListener('pointerup', _onTap);
    canvas.addEventListener('touchend', e=>{ e.preventDefault(); _onTap(e); }, {passive:false});

    keys={};
    const kd=e=>{keys[e.key]=true;};
    const ku=e=>{keys[e.key]=false;};
    window.addEventListener('keydown',kd);
    window.addEventListener('keyup',ku);
    canvas._kd=kd; canvas._ku=ku;

    // Wire dpad
    const dpad=document.getElementById('dpad');
    if(showPlayerShip&&dpad){
      dpad.classList.remove('hidden');
      const btn=(id,dx,dy)=>{
        const el2=document.getElementById(id); if(!el2) return;
        let t=null;
        el2.onpointerdown=()=>{
          const _move=()=>{
            const nx=Math.max(0,Math.min(map[0].length-1,playerShipX+dx));
            const ny=Math.max(0,Math.min(map.length-1,playerShipY+dy));
            if(map[ny]?.[nx]?.passable!==false&&!map[ny]?.[nx]?.overlay){
              playerShipX=nx;playerShipY=ny;
              camX=playerShipX*TILE-W/2;camY=playerShipY*TILE-H/2;_clampCam();
            }
          };
          _move(); t=setInterval(_move,MOVE_DELAY);
        };
        el2.onpointerup=el2.onpointercancel=()=>clearInterval(t);
      };
      btn('dp-up',0,-1);btn('dp-down',0,1);btn('dp-left',-1,0);btn('dp-right',1,0);
    }

    State.enterSurface(sysId,pIdx);
    UI.updateBreadcrumb();

    if(animId) cancelAnimationFrame(animId);
    animId=requestAnimationFrame(_loop);
  }

  function hide(){
    const id=animId;
    animId=null;  // null first so any in-flight _loop call exits cleanly
    if(id) cancelAnimationFrame(id);
    canvas=null; // also null canvas so _loop guard catches it
    if(canvas){
      canvas.removeEventListener('pointerup',_onTap);
      canvas.removeEventListener('touchend',_onTap);
      window.removeEventListener('keydown',canvas._kd);
      window.removeEventListener('keyup',canvas._ku);
    }
    document.getElementById('surface-overlay').classList.add('hidden');
    document.getElementById('surface-ship').classList.add('hidden');
    document.getElementById('dpad').classList.add('hidden');
    const el=document.getElementById('surface-ctx-menu');
    if(el) el.classList.add('hidden');
    closeCtxMenu();
    map=null;
  }

  function refresh(){
    planet=State.getPlanet(systemId,planetIdx);
    if(planet&&map) _rebuildMap();
  }

  // Expose for external calls (build complete callbacks)
  return { show, hide, refresh, buildFromHQ, buildShip, buildMissiles, launchMissile, sendSelectedShips, sendProbes, _fireMissileAt, closeCtxMenu, onBuildComplete, onShipBuilt };
})();
