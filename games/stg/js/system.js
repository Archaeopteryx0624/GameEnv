// ============================================================
//  system.js — System view: bigger planets, ship movement
// ============================================================

const SystemView = (() => {

  let app=null, sysId=null;
  let orbLayer, planetLayer, shipLayer, labelLayer, uiLayer;
  let missileCanvas=null, missileCtx=null;
  let animTicker=null;
  let planetSprites=[];
  let shipSprites={};
  let lastTap={};
  const worldCoords={};
  let inSystemFlights=[];
  let beamEffects=[]; // BC/DN beam shots — module scope so ticker always finds it
  let _lastAbortUIKey=''; // track when abort UI needs rebuild

  function _init(){
    const mount=document.getElementById('canvas-mount');
    const W=mount.clientWidth, H=mount.clientHeight;
    app=new PIXI.Application({
      width:W,height:H,backgroundColor:0x020810,
      antialias:true,resolution:window.devicePixelRatio||1,autoDensity:true,
    });
    mount.appendChild(app.view);

    missileCanvas=document.createElement('canvas');
    missileCanvas.width=W; missileCanvas.height=H;
    missileCanvas.style.cssText='position:absolute;top:0;left:0;pointer-events:none;z-index:5;';
    mount.appendChild(missileCanvas);
    missileCtx=missileCanvas.getContext('2d');

    const root=new PIXI.Container();
    orbLayer=new PIXI.Container();
    planetLayer=new PIXI.Container();
    shipLayer=new PIXI.Container();
    labelLayer=new PIXI.Container();
    uiLayer=new PIXI.Container();
    root.addChild(orbLayer,planetLayer,shipLayer,labelLayer,uiLayer);
    app.stage.addChild(root);
    _drawBgStars(W,H);

    window.addEventListener('resize',()=>{
      const nW=mount.clientWidth,nH=mount.clientHeight;
      app.renderer.resize(nW,nH);
      if(missileCanvas){missileCanvas.width=nW;missileCanvas.height=nH;}
      if(sysId)_buildScene(sysId);
    });
  }

  const _W=()=>app.renderer.width/(window.devicePixelRatio||1);
  const _H=()=>app.renderer.height/(window.devicePixelRatio||1);

  function _buildScene(id){
    sysId=id;
    [orbLayer,planetLayer,shipLayer,labelLayer,uiLayer].forEach(l=>{
      while(l.children.length) {
        const c=l.children[0];
        l.removeChild(c);
        try { c.destroy({children:true,texture:false,baseTexture:false}); } catch(e){}
      }
    });
    planetSprites=[];shipSprites={};
    for(const k in worldCoords)delete worldCoords[k];
    inSystemFlights=[];

    const sys=State.getSystem(id); if(!sys) return;
    const W=_W(),H=_H(),cx=W/2,cy=H/2;

    // Star — larger
    const sc=parseInt(sys.starColor.replace('#',''),16),sr=sys.starSize+12;
    [5,3.5,2].forEach((m,i)=>{
      const g=new PIXI.Graphics();
      g.beginFill(sc,0.04*(i+1));g.drawCircle(cx,cy,sr*m);g.endFill();
      orbLayer.addChild(g);
    });
    const starG=new PIXI.Graphics();
    starG.beginFill(sc);starG.drawCircle(cx,cy,sr);starG.endFill();
    planetLayer.addChild(starG);
    let fl=0, starAlive=true;
    const starTick=()=>{ if(!starAlive){app.ticker.remove(starTick);return;} starG.scale.set(1+0.015*Math.sin((++fl)*0.03)); };
    app.ticker.add(starTick);
    // Kill this ticker when scene rebuilds — tracked via _buildScene clearing planetLayer
    starG.on('destroyed',()=>{ starAlive=false; });

    // Planets — fill much more of the screen
    // Use elliptical orbits, planets are BIG
    const nPlanets=sys.planets.length;
    // Spread planets across much more of the screen
    const minR = Math.max(60, Math.min(cx, cy) * 0.22);
    // maxR: allow planets to reach near screen edge but never exceed it
    const maxR = Math.max(minR + 80, cx * 0.82);
    const step=nPlanets>1?(maxR-minR)/(nPlanets-1):0;

    sys.planets.forEach((planet,pIdx)=>{
      const orbitR=minR+pIdx*step;
      const tmpl=Data.PLANET_TYPES[planet.type];
      // Bigger planet sizes — log scale but larger base
      const pSize=Math.max(16, 14+Math.log10(planet.radius||1000)*5);
      const angle0=(pIdx/Math.max(nPlanets,1))*Math.PI*2;

      // Orbit ring
      const orb=new PIXI.Graphics();
      const orbCol=planet.owner==='player'?0x003a5a:planet.owner==='enemy'?0x3a0f1a:0x0f2050;
      orb.lineStyle(1,orbCol,0.4);
      if(orbitR>0&&isFinite(orbitR)) orb.drawEllipse(cx,cy,orbitR,orbitR*0.45);
      orbLayer.addChild(orb);

      // Planet container
      const pc=new PIXI.Container();
      const pGfx=new PIXI.Graphics();
      _drawPlanet(pGfx,planet,tmpl,pSize);
      pc.addChild(pGfx);

      // Owner ring
      if(planet.owner!=='none'){
        const ring=new PIXI.Graphics();
        ring.lineStyle(2.5,planet.owner==='player'?0x00c8ff:0xff3355,0.8);
        ring.drawCircle(0,0,pSize+6);pc.addChild(ring);
      }
      // Gas giant rings
      if(planet.type==='gas_giant'){
        const gr=new PIXI.Graphics();
        gr.lineStyle(4,0xc87c2a,0.35);gr.drawEllipse(0,0,pSize*2.4,pSize*0.55);
        gr.lineStyle(2.5,0xe8b060,0.2);gr.drawEllipse(0,0,pSize*3.0,pSize*0.7);
        pc.addChild(gr);
      }

      const px0=isFinite(orbitR)?cx+orbitR*Math.cos(angle0):cx;
      const py0=isFinite(orbitR)?cy+orbitR*0.45*Math.sin(angle0):cy;
      pc.x=px0;pc.y=py0;
      planetLayer.addChild(pc);

      // World coords for missiles
      worldCoords['planet:'+id+':'+pIdx]={x:px0,y:py0};
      planet._worldX=px0;planet._worldY=py0;
      planet._sysId=id;planet._pIdx=pIdx;

      // Ship count badge
      const orbitCount=(planet.ships||[]).filter(s=>s.state==='orbit').length;
      const dockCount=(planet.ships||[]).filter(s=>s.state==='dock').length;
      if(orbitCount+dockCount>0){
        const badge=new PIXI.Text(
          (orbitCount?`↑${orbitCount} `:'')+( dockCount?`⚓${dockCount}`:''),
          new PIXI.TextStyle({fontFamily:'Share Tech Mono',fontSize:10,fill:planet.owner==='player'?'#00c8ff':'#ff8899'})
        );
        badge.x=-badge.width/2; badge.y=pSize+8;
        pc.addChild(badge);
      }

      // Missile stock badge
      if((planet.missileStock||0)>0){
        const msT=new PIXI.Text('💥×'+(planet.missileStock),new PIXI.TextStyle({
          fontFamily:'Share Tech Mono',fontSize:9,fill:'#ff9900',
        }));
        msT.x=-msT.width/2; msT.y=pSize+22;
        pc.addChild(msT);
      }

      // Label
      const lbl=new PIXI.Text(planet.name.toUpperCase(),new PIXI.TextStyle({
        fontFamily:'Share Tech Mono',fontSize:11,letterSpacing:1,
        fill:planet.owner==='player'?'#b8cce8':planet.owner==='enemy'?'#ff8899':'#4a5a80',
      }));
      lbl.x=px0-lbl.width/2;lbl.y=py0+pSize+36;
      labelLayer.addChild(lbl);

      // Hit area
      const hitR=Math.max(pSize*1.6,36);
      const hit=new PIXI.Graphics();
      hit.beginFill(0xffffff,0.001);hit.drawCircle(0,0,hitR);hit.endFill();
      hit.interactive=true;hit.cursor='pointer';
      pc.addChild(hit);

      let tapT=0;
      let _planetAlive=true;
      pGfx.on('destroyed',()=>{ _planetAlive=false; });
      hit.on('pointerdown',()=>{tapT=Date.now();if(_planetAlive)pGfx.scale.set(1.1);});
      hit.on('pointerup',()=>{
        if(_planetAlive)pGfx.scale.set(1.0);
        const now=Date.now();if(now-tapT>400)return;
        const m=Modes.get();
        if(m==='sendfleet'||m==='missile'){
          Modes.handleClick({kind:'planet',sysId:id,planetIdx:pIdx,
            worldX:pc.x,worldY:pc.y,
            srcWorldX:_srcCoords().x,srcWorldY:_srcCoords().y});
          return;
        }
        const key=id+'-'+pIdx;
        const dt=now-(lastTap[key]||0);lastTap[key]=now;
        if(dt<380){
          // Double-tap = land (if landable and owned)
          const tmpl2=Data.PLANET_TYPES[planet.type];
          if(tmpl2.landable&&planet.owner==='player'){
            Game.landOnPlanet(id,pIdx);
          } else if(!tmpl2.landable){
            UI.toast(`${planet.name} — not landable. Build a Space Control Station.`,'',2500);
          } else {
            UI.toast(`${planet.name} — enemy territory`,'',2000);
          }
        } else {
          // Single tap = info + set source
          Modes.setSrc(id,pIdx);
          const own=planet.owner==='player'?'YOU':planet.owner==='enemy'?'ENEMY':'NEUTRAL';
          const ms=planet.missileStock||0;
          const ships=(planet.ships||[]).length;
          UI.toast(`${planet.name} · ${tmpl.label} · ${own} · ${ships} ships${ms>0?' · 💥×'+ms:''}`,'',2500);
        }
      });
      hit.on('pointerupoutside',()=>{if(_planetAlive)pGfx.scale.set(1.0);});

      planetSprites.push({container:pc,label:lbl,orbitR,angle:angle0,
        speed:0.0012/(pIdx+1),cx,cy,pSize,pIdx});
    });

    _rebuildShipSprites(sys);
    _buildAbortUI();
  }

  function _srcCoords(){
    const src=Modes.getSrc();if(!src)return{x:0,y:0};
    return worldCoords['planet:'+src.sysId+':'+src.planetIdx]||{x:0,y:0};
  }

  function _rebuildShipSprites(sys){
    while(shipLayer.children.length){ const c=shipLayer.children[0]; shipLayer.removeChild(c); try{c.destroy({children:true,texture:false,baseTexture:false});}catch(e){} }
    shipSprites={};

    sys.planets.forEach((planet,pIdx)=>{
      const ps=planetSprites[pIdx];if(!ps)return;

      // Orbit ships — circle around planet
      const orbitShips=(planet.ships||[]).filter(s=>s.state==='orbit'&&s.type!=='watchdog');
      orbitShips.forEach((ship,si)=>{
        const owner=ship.owner||planet.owner;
        const sp=Ships.makeOrbitSprite(ship,owner);
        const a=ps.angle+si*0.6;
        const r=ps.pSize+22+si*14;
        sp.x=ps.container.x+r*Math.cos(a);
        sp.y=ps.container.y+r*Math.sin(a);
        sp.rotation=a+Math.PI/2;
        sp.interactive=true;sp.cursor='pointer';
        sp.on('pointertap',()=>{
          const m=Modes.get();
          if(m==='missile'){
            Modes.handleClick({kind:'ship',shipId:ship.id,
              worldX:sp.x,worldY:sp.y,
              srcWorldX:_srcCoords().x,srcWorldY:_srcCoords().y});
            return;
          }
          UI.toast(`${ship.name} · ${Data.SHIP_TYPES[ship.type]?.name} · HP:${ship.hp}/${ship.maxHp}`,'',2000);
        });
        shipLayer.addChild(sp);
        shipSprites[ship.id]={sprite:sp,orbitAngle:a,orbitR:r,pIdx,si};
        worldCoords['ship:'+ship.id]={x:sp.x,y:sp.y};
        ship._worldX=sp.x;ship._worldY=sp.y;
      });

      // Watchdog STATIONS — rendered as hex rings, not triangles
      (planet.ships||[]).filter(s=>s.type==='watchdog').forEach((wd,wi)=>{
        const col = planet.owner==='player' ? 0x00c8ff : 0xff3355;
        const a = -Math.PI/2 + wi*0.65;
        const r = ps.pSize + 42 + wi*20;
        const sx = ps.container.x + r*Math.cos(a);
        const sy = ps.container.y + r*Math.sin(a);

        // Draw hex station
        const sp = new PIXI.Graphics();
        const R = 12; // station radius
        // Outer hex ring
        sp.lineStyle(2, col, 0.85);
        sp.beginFill(col, 0.12);
        for(let i=0;i<6;i++){
          const ha = i*Math.PI/3 - Math.PI/6;
          const nx = R*Math.cos(ha), ny = R*Math.sin(ha);
          i===0 ? sp.moveTo(nx,ny) : sp.lineTo(nx,ny);
        }
        sp.closePath(); sp.endFill();
        // Inner ring
        sp.lineStyle(1, col, 0.5);
        sp.drawCircle(0, 0, R*0.5);
        // Gun barrels at hex vertices
        sp.lineStyle(1.5, col, 0.9);
        for(let i=0;i<6;i++){
          const ha = i*Math.PI/3 - Math.PI/6;
          sp.moveTo(R*0.5*Math.cos(ha), R*0.5*Math.sin(ha));
          sp.lineTo((R+5)*Math.cos(ha), (R+5)*Math.sin(ha));
        }
        // Scan ring pulse (slow rotation handled in ticker)
        sp.lineStyle(0.5, col, 0.2);
        sp.drawCircle(0, 0, R*2.2);

        sp.x = sx; sp.y = sy;
        sp.interactive = true; sp.cursor = 'pointer';
        sp._wdId = wd.id;

        sp.on('pointertap',()=>{
          const m=Modes.get();
          if(m==='missile'){
            Modes.handleClick({kind:'watchdog',shipId:wd.id,
              worldX:sp.x,worldY:sp.y,
              srcWorldX:_srcCoords().x,srcWorldY:_srcCoords().y});
            return;
          }
          UI.toast(`⬡ ${wd.name||'Watchdog'} Station · HP:${wd.hp}/${wd.maxHp} · Auto-fires at enemies in range`,'',2800);
          Modes.setSrc(sysId,pIdx);
        });

        shipLayer.addChild(sp);
        shipSprites[wd.id]={sprite:sp, static:true, pIdx, isStation:true};
        worldCoords['ship:'+wd.id]={x:sp.x,y:sp.y};
        wd._worldX=sp.x; wd._worldY=sp.y;
      });
    });

    // In-system traveling ships (visible triangles)
    for(const flight of inSystemFlights){
      if(!flight._sprite){
        flight._sprite=Ships.makeOrbitSprite(flight.ship,flight.ship.owner||'player');
        shipLayer.addChild(flight._sprite);
      }
      flight._sprite.x=flight.fromX+(flight.toX-flight.fromX)*flight.progress;
      flight._sprite.y=flight.fromY+(flight.toY-flight.fromY)*flight.progress;
      flight._sprite.rotation=Math.atan2(flight.toY-flight.fromY,flight.toX-flight.fromX)+Math.PI/2;
    }
  }

  function _buildAbortUI(){
    // Clear uiLayer safely
    while(uiLayer.children.length){
      const c=uiLayer.children[0];
      uiLayer.removeChild(c);
      try{ if(!c.destroyed) c.destroy({children:true}); }catch(e){}
    }
    const W=_W(),H=_H();
    const tfs=State.get().travelingFleets.filter(
      tf=>tf.fromSystemId===sysId||tf.targetSystemId===sysId
    );
    tfs.forEach((tf,i)=>{
      if(tf.ships?.some(s=>Data.SHIP_TYPES[s.type]?.isDreadnought)){
        const from=State.getSystem(tf.fromSystemId);
        const to=State.getSystem(tf.targetSystemId);
        if(from&&to){
          const p=tf.progress||0;
          const dn=Ships.makeOrbitSprite(tf.ships.find(s=>Data.SHIP_TYPES[s.type]?.isDreadnought),tf.owner);
          dn.x=from.x*W+(to.x-from.x)*W*p;
          dn.y=from.y*H+(to.y-from.y)*H*p;
          dn.rotation=Math.atan2(to.y-from.y,to.x-from.x)+Math.PI/2;
          dn._tfId=tf.id;
          Ships.applyWarp(dn,tf.warp);
          uiLayer.addChild(dn);
        }
      }
      if(tf.owner!=='player')return;
      const btn=new PIXI.Container();
      btn.interactive=true;btn.cursor='pointer';
      const bg=new PIXI.Graphics();
      bg.beginFill(0x0a1428,0.9);bg.drawRoundedRect(-32,-15,64,30,4);bg.endFill();
      bg.lineStyle(1,0xff3355,0.8);bg.drawRoundedRect(-32,-15,64,30,4);
      const txt=new PIXI.Text('✕ ABORT',new PIXI.TextStyle({fontFamily:'Share Tech Mono',fontSize:10,fill:'#ff3355'}));
      txt.anchor.set(0.5);
      btn.addChild(bg,txt);btn.x=W-88;btn.y=72+i*42;
      btn.on('pointertap',()=>{State.abortFleet(tf.id);UI.toast('Fleet recalled','',1500);_buildScene(sysId);});
      uiLayer.addChild(btn);
    });

    // Mode instruction at bottom
    const m=Modes.get();
    if(m==='sendfleet'||m==='missile'){
      const instr=new PIXI.Text(
        m==='sendfleet'?'TAP DESTINATION PLANET':'TAP TARGET — PLANET / SHIP / WATCHDOG',
        new PIXI.TextStyle({fontFamily:'Share Tech Mono',fontSize:11,fill:'#ffc844',letterSpacing:2})
      );
      instr.x=W/2-instr.width/2;instr.y=H-38;
      uiLayer.addChild(instr);
    }
  }

  // ── In-system ship flight ─────────────────────────────
  // Called when a ship is sent from one planet to another in the SAME system
  function launchInSystem(ship, fromPlanetIdx, toPlanetIdx, onArrive){
    const from=planetSprites[fromPlanetIdx];
    const to=planetSprites[toPlanetIdx];
    if(!from||!to) return;
    const speed=0.008/(Data.SHIP_TYPES[ship.type]?.speed||60)*1000;
    inSystemFlights.push({
      ship, fromX:from.container.x, fromY:from.container.y,
      toX:to.container.x, toY:to.container.y,
      progress:0, speed:0.004, onArrive, _sprite:null,
    });
  }

  function _drawPlanet(gfx,planet,tmpl,size){
    const cols=tmpl.colors.map(c=>parseInt(c.replace('#',''),16));
    gfx.beginFill(cols[0]);gfx.drawCircle(0,0,size);gfx.endFill();
    if(planet.type==='terrestrial'){
      gfx.beginFill(0x1a3a8a,0.7);gfx.drawEllipse(-size*.1,size*.1,size*.6,size*.55);gfx.endFill();
      gfx.beginFill(cols[0],0.9);gfx.drawEllipse(size*.2,-size*.2,size*.45,size*.35);gfx.endFill();
      gfx.beginFill(0xffffff,0.1);gfx.drawEllipse(0,-size*.05,size*.9,size*.18);gfx.endFill();
    }else if(planet.type==='gas_giant'){
      [0.3,0.6,-0.2,-0.5].forEach((y,i)=>{
        gfx.beginFill(cols[i%cols.length],0.6);gfx.drawEllipse(0,y*size,size,size*0.18);gfx.endFill();
      });
    }else if(planet.type==='ice_giant'){
      gfx.beginFill(0x5a8acc,0.4);gfx.drawEllipse(-size*.15,0,size*.7,size*.9);gfx.endFill();
      gfx.beginFill(0xaaccee,0.15);gfx.drawEllipse(0,-size*.2,size*.9,size*.35);gfx.endFill();
    }else if(planet.type==='volcanic'){
      gfx.beginFill(0xcc3300,0.5);gfx.drawEllipse(size*.1,size*.2,size*.4,size*.3);gfx.endFill();
      gfx.beginFill(0xff6600,0.3);gfx.drawEllipse(-size*.2,-size*.1,size*.3,size*.25);gfx.endFill();
    }else if(planet.type==='frozen'){
      gfx.beginFill(0xeef4f8,0.4);gfx.drawEllipse(0,-size*.1,size*.8,size*.3);gfx.endFill();
    }
    gfx.beginFill(0x020810,0.45);gfx.drawEllipse(size*.2,0,size*.8,size);gfx.endFill();
    const mask=new PIXI.Graphics();mask.beginFill(0xffffff);mask.drawCircle(0,0,size);mask.endFill();
    gfx.addChild(mask);gfx.mask=mask;
  }

  function _drawBgStars(W,H){
    const bg=new PIXI.Graphics();
    for(let i=0,n=Math.floor((W*H)/1600);i<n;i++){
      bg.beginFill(0xffffff,0.1+Math.random()*0.45);
      bg.drawCircle(Math.random()*W,Math.random()*H,Math.random()*0.8+0.2);bg.endFill();
    }
    app.stage.addChildAt(bg,0);
  }

  function _startOrbits(){
    if(animTicker)app.ticker.remove(animTicker);
    animTicker=()=>{
      const now=performance.now();
      const sys=State.getSystem(sysId);if(!sys)return;

      for(const ps of planetSprites){
        ps.angle+=ps.speed;
        const px=ps.cx+ps.orbitR*Math.cos(ps.angle);
        const py=ps.cy+ps.orbitR*0.45*Math.sin(ps.angle);
        ps.container.x=px;ps.container.y=py;
        if(ps.label){ps.label.x=px-ps.label.width/2;ps.label.y=py+ps.pSize+36;}

        const planet=sys.planets[ps.pIdx];
        if(planet){
          worldCoords['planet:'+sysId+':'+ps.pIdx]={x:px,y:py};
          planet._worldX=px;planet._worldY=py;

          // Slowly rotate watchdog stations
          (planet.ships||[]).filter(s=>s.type==='watchdog').forEach(wd=>{
            const ss=shipSprites[wd.id]; if(!ss||!ss.sprite) return;
            ss.sprite.rotation=(ss.sprite.rotation||0)+0.005;
          });

          // Update orbit ship positions
          (planet.ships||[]).filter(s=>s.state==='orbit'&&s.type!=='watchdog').forEach((ship,si)=>{
            const ss=shipSprites[ship.id];if(!ss||ss.static)return;
            const a=ps.angle+si*0.6+now*0.0007;
            const r=ps.pSize+22+si*14;
            if(!isFinite(px)||!isFinite(py)||!isFinite(r))return;
            ss.sprite.x=px+r*Math.cos(a);ss.sprite.y=py+r*Math.sin(a);
            ss.sprite.rotation=a+Math.PI/2;
            worldCoords['ship:'+ship.id]={x:ss.sprite.x,y:ss.sprite.y};
            ship._worldX=ss.sprite.x;ship._worldY=ss.sprite.y;
          });
        }
      }

      // In-system flights
      inSystemFlights=inSystemFlights.filter(fl=>{
        fl.progress=Math.min(1,(fl.progress||0)+fl.speed);
        if(fl._sprite){
          fl._sprite.x=fl.fromX+(fl.toX-fl.fromX)*fl.progress;
          fl._sprite.y=fl.fromY+(fl.toY-fl.fromY)*fl.progress;
        }
        if(fl.progress>=1){
          if(fl._sprite)shipLayer.removeChild(fl._sprite);
          fl.onArrive?.();
          return false;
        }
        return true;
      });

      // DN travel
      State.get().travelingFleets.forEach(tf=>{
        uiLayer.children.forEach(c=>{
          if(c._tfId!==tf.id)return;
          const from=State.getSystem(tf.fromSystemId);
          const to=State.getSystem(tf.targetSystemId);
          if(!from||!to)return;
          c.x=from.x*_W()+(to.x-from.x)*_W()*tf.progress;
          c.y=from.y*_H()+(to.y-from.y)*_H()*tf.progress;
        });
      });

      // Missiles
      Missiles.clearCoords();
      for(const k in worldCoords)Missiles.registerCoord(k,worldCoords[k].x,worldCoords[k].y);
      Missiles.update();
      if(missileCtx){
        missileCtx.clearRect(0,0,missileCanvas.width,missileCanvas.height);
        Missiles.draw(missileCtx);

        // Draw BC/DN beam effects
        for(let bi=beamEffects.length-1;bi>=0;bi--){
          const beam=beamEffects[bi];
          beam.life--;
          if(beam.life<=0){beamEffects.splice(bi,1);continue;}
          const alpha=beam.life/beam.maxLife;
          const width=beam.isDN?4:2;
          missileCtx.save();
          missileCtx.globalAlpha=alpha;
          missileCtx.strokeStyle=beam.col;
          missileCtx.lineWidth=width;
          missileCtx.shadowColor=beam.col;
          missileCtx.shadowBlur=beam.isDN?20:10;
          missileCtx.beginPath();
          missileCtx.moveTo(beam.fromX,beam.fromY);
          missileCtx.lineTo(beam.toX,beam.toY);
          missileCtx.stroke();
          // Impact flash at target
          if(beam.life>beam.maxLife*0.6){
            missileCtx.beginPath();
            missileCtx.arc(beam.toX,beam.toY,beam.isDN?12:6,0,Math.PI*2);
            missileCtx.fillStyle=beam.col;
            missileCtx.globalAlpha=alpha*0.5;
            missileCtx.fill();
          }
          missileCtx.restore();
        }

        // Check for BC/DN ships attacking watchdogs — trigger beams
        if(sys){
          for(const pl of sys.planets){
            const watchdogs=(pl.ships||[]).filter(s=>s.type==='watchdog'&&pl.owner!=='player');
            if(!watchdogs.length) continue;
            for(const wd of watchdogs){
              const wdPos=worldCoords['ship:'+wd.id];
              if(!wdPos) continue;
              // Find nearby player BC/DN in orbit
              for(const pl2 of sys.planets){
                if(pl2.owner!=='player') continue;
                (pl2.ships||[]).filter(s=>s.state==='orbit'&&Data.SHIP_TYPES[s.type]?.canDestroyWatchdog).forEach(sh=>{
                  const shPos=worldCoords['ship:'+sh.id];
                  if(!shPos) return;
                  const dist=Math.hypot(wdPos.x-shPos.x,wdPos.y-shPos.y);
                  if(dist<350&&Math.random()<0.008){ // occasional beam fire
                    const isDN=Data.SHIP_TYPES[sh.type]?.isDreadnought;
                    beamEffects.push({
                      fromX:shPos.x,fromY:shPos.y,
                      toX:wdPos.x,toY:wdPos.y,
                      col:isDN?'#cc44ff':'#ffcc44',
                      life:18, maxLife:18, isDN,
                    });
                  }
                });
              }
            }
          }
        }
      }

      State.travelTick(performance.now());
      // Only rebuild abort UI when fleet count or mode changes (not every frame)
      const _abortKey = State.get().travelingFleets.length + '|' + Modes.get();
      if(_abortKey !== _lastAbortUIKey){ _lastAbortUIKey=_abortKey; _buildAbortUI(); }
    };
    app.ticker.add(animTicker);
  }

  function show(id){
    if(!app){
      _init();
    } else {
      // Stop old ticker before rebuilding to prevent ghost frames
      if(animTicker){ app.ticker.remove(animTicker); animTicker=null; }
      app.view.style.display='block';
      if(missileCanvas) missileCanvas.style.display='block';
    }
    _buildScene(id);
    _startOrbits();
    State.enterSystem(id);
    UI.updateBreadcrumb();UI.updateViewLabel();UI.refresh();
  }

  function hide(){
    if(animTicker&&app){
      try{ app.ticker.remove(animTicker); }catch(e){}
      animTicker=null;
    }
    if(app) app.view.style.display='none';
    if(missileCanvas) missileCanvas.style.display='none';
    if(missileCtx) missileCtx.clearRect(0, 0, missileCanvas?.width||1, missileCanvas?.height||1);
    Modes.set('normal');
  }

  function refresh(){
    if(!app||!sysId)return;
    const sys=State.getSystem(sysId);if(!sys)return;
    _rebuildShipSprites(sys);
    _buildAbortUI();
  }

  return{show,hide,refresh,launchInSystem};
})();
