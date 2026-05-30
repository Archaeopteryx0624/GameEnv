// ============================================================
//  galaxy.js — Galaxy map with traveling fleet triangles
// ============================================================

const GalaxyView = (() => {

  let app=null;
  let laneLayer, starLayer, travelLayer, labelLayer;
  let selectRing=null;
  let travelSprites={};
  let galaxyTicker=null;

  function init() {
    const mount=document.getElementById('canvas-mount');
    const W=mount.clientWidth, H=mount.clientHeight;
    app=new PIXI.Application({
      width:W,height:H,backgroundColor:0x020810,
      antialias:true,resolution:window.devicePixelRatio||1,autoDensity:true,
    });
    mount.appendChild(app.view);

    const root=new PIXI.Container();
    laneLayer=new PIXI.Container();
    starLayer=new PIXI.Container();
    travelLayer=new PIXI.Container();
    labelLayer=new PIXI.Container();
    root.addChild(laneLayer,starLayer,travelLayer,labelLayer);
    app.stage.addChild(root);
    _drawBgStars(W,H);
    _buildScene(W,H);
    galaxyTicker = ()=>_updateTravelSprites();
    app.ticker.add(galaxyTicker);

    window.addEventListener('resize',()=>{
      app.renderer.resize(mount.clientWidth,mount.clientHeight);
      rebuildScene();
    });
  }

  function rebuildScene() {
    if(!app)return;
    [laneLayer,starLayer,labelLayer].forEach(l=>{
      while(l.children.length){ const c=l.children[0]; l.removeChild(c); try{c.destroy({children:true});}catch(e){} }
    });
    // Travel sprites need special cleanup (separate trail graphics)
    for(const id in travelSprites){
      const grp=travelSprites[id];
      if(grp._trail){ try{ if(!grp._trail.destroyed){travelLayer.removeChild(grp._trail);grp._trail.destroy();} }catch(e){} }
      try{ if(!grp.destroyed){travelLayer.removeChild(grp);grp.destroy({children:true});} }catch(e){}
    }
    while(travelLayer.children.length){ const c=travelLayer.children[0]; travelLayer.removeChild(c); try{ if(!c.destroyed) c.destroy({children:true}); }catch(e){} }
    travelSprites={};selectRing=null;
    const W=app.renderer.width/(window.devicePixelRatio||1);
    const H=app.renderer.height/(window.devicePixelRatio||1);
    _buildScene(W,H);
  }

  function _drawBgStars(W,H){
    const bg=new PIXI.Graphics();
    for(let i=0,n=Math.floor((W*H)/2500);i<n;i++){
      bg.beginFill(0xffffff,0.15+Math.random()*0.45);
      bg.drawCircle(Math.random()*W,Math.random()*H,Math.random()*0.8+0.2);bg.endFill();
    }
    app.stage.addChildAt(bg,0);
  }

  function _buildScene(W,H){
    const s=State.get();
    const lg=new PIXI.Graphics();
    for(const [aId,bId] of Data.LANES){
      const a=s.systems.find(x=>x.id===aId), b=s.systems.find(x=>x.id===bId);
      if(!a||!b)continue;
      let col=0x0f2050,alpha=0.55;
      if(a.owner==='player'&&b.owner==='player')col=0x003a5a;
      else if(a.owner==='enemy'||b.owner==='enemy')col=0x3a0f1a;
      if(!a.explored||!b.explored)alpha=0.18;
      lg.lineStyle(1,col,alpha);
      lg.moveTo(a.x*W,a.y*H);lg.lineTo(b.x*W,b.y*H);
    }
    laneLayer.addChild(lg);

    for(const sys of s.systems){
      const x=sys.x*W,y=sys.y*H;
      const hex=parseInt(sys.starColor.replace('#',''),16);
      const r=sys.starSize;
      const haloCol=sys.owner==='player'?0x00c8ff:sys.owner==='enemy'?0xff3355:0xffcc44;
      const haloA=sys.explored?0.07:0.015;
      const halo=new PIXI.Graphics();
      halo.beginFill(haloCol,haloA);halo.drawCircle(x,y,r*5);halo.endFill();
      halo.beginFill(haloCol,haloA*.5);halo.drawCircle(x,y,r*8);halo.endFill();
      laneLayer.addChild(halo);
      const gfx=new PIXI.Graphics();
      gfx.beginFill(hex,0.12);gfx.drawCircle(x,y,r*3.5);gfx.endFill();
      gfx.beginFill(hex,0.28);gfx.drawCircle(x,y,r*2);gfx.endFill();
      gfx.beginFill(hex,1);gfx.drawCircle(x,y,r);gfx.endFill();
      if(!sys.explored){gfx.beginFill(0x020810,0.55);gfx.drawCircle(x,y,r*3.5);gfx.endFill();}
      if(sys.owner!=='none'&&sys.explored){
        const dot=new PIXI.Graphics();
        dot.beginFill(sys.owner==='player'?0x00c8ff:0xff3355,0.9);
        dot.drawCircle(x+r+3,y-r-3,3);dot.endFill();
        labelLayer.addChild(dot);
      }
      const lbl=new PIXI.Text(sys.name.toUpperCase(),new PIXI.TextStyle({
        fontFamily:'Share Tech Mono',fontSize:11,letterSpacing:1,
        fill:sys.explored?(sys.owner==='enemy'?'#ff8899':'#b8cce8'):'#2a3a5a',
      }));
      lbl.x=x-lbl.width/2;lbl.y=y+r+6;
      labelLayer.addChild(lbl);

      const hitR=Math.max(r*3,32);
      const hit=new PIXI.Graphics();
      hit.beginFill(0xffffff,0.001);hit.drawCircle(x,y,hitR);hit.endFill();
      hit.interactive=true;hit.cursor='pointer';
      let tapStart=0,firstTap=0;
      hit.on('pointerdown',()=>{tapStart=Date.now();gfx.scale.set(1.12);});
      hit.on('pointerup',()=>{
        gfx.scale.set(1.0);
        const now=Date.now();
        if(now-tapStart>400)return;
        const dt=now-firstTap;
        if(dt<380&&firstTap>0){
          // Double tap — enter system
          firstTap=0;
          Game.goSystem(sys.id);
        } else {
          firstTap=now;
          // Single tap — select
          State.select({kind:'system',id:sys.id});
          const own=sys.owner==='player'?'YOU':sys.owner==='enemy'?'ENEMY':'NEUTRAL';
          UI.toast(`${sys.name} · ${sys.starType} · ${own} · ${sys.planets.length} planets${sys.explored?'':' · UNEXPLORED'}`,'',2500);
          _showSelectRing(sys,x,y,r);
        }
      });
      hit.on('pointerupoutside',()=>gfx.scale.set(1.0));
      const grp=new PIXI.Container();
      grp.addChild(gfx,hit);
      starLayer.addChild(grp);
    }
  }

  function _showSelectRing(sys,x,y,r){
    if(selectRing)starLayer.removeChild(selectRing);
    const ring=new PIXI.Graphics();
    ring.lineStyle(1.5,0x00c8ff,0.85);
    ring.drawCircle(x,y,r*2.5+10);
    starLayer.addChild(ring);selectRing=ring;
    let tick=0;
    const tid=app.ticker.add(()=>{ring.alpha=0.5+0.5*Math.sin(++tick*0.08);if(tick>220)app.ticker.remove(tid);});
  }

  function _updateTravelSprites(){
    if(!app)return;
    const W=app.renderer.width/(window.devicePixelRatio||1);
    const H=app.renderer.height/(window.devicePixelRatio||1);
    const tfs=State.get().travelingFleets;

    for(const id in travelSprites){
      if(!tfs.find(tf=>tf.id===id)){
        const grp=travelSprites[id];
        if(grp._trail)travelLayer.removeChild(grp._trail);
        travelLayer.removeChild(grp);
        delete travelSprites[id];
      }
    }

    for(const tf of tfs){
      const from=State.getSystem(tf.fromSystemId);
      const to=State.getSystem(tf.targetSystemId);
      if(!from||!to)continue;
      const fx=from.x*W,fy=from.y*H,tx=to.x*W,ty=to.y*H;
      const p=tf.progress||0;
      const cx=fx+(tx-fx)*p,cy=fy+(ty-fy)*p;
      const angle=Math.atan2(ty-fy,tx-fx);

      if(!travelSprites[tf.id]){
        const col=tf.owner==='player'?0x00c8ff:0xff3355;
        const isDN=tf.ships?.some(s=>Data.SHIP_TYPES[s.type]?.isDreadnought);
        const sz=isDN?11:7;
        const sp=new PIXI.Graphics();
        sp.beginFill(col,0.9);
        sp.moveTo(0,-sz);sp.lineTo(sz*.7,sz*.7);sp.lineTo(-sz*.7,sz*.7);
        sp.closePath();sp.endFill();
        sp.beginFill(col,1);sp.drawCircle(0,0,isDN?3:2);sp.endFill();
        sp.interactive=true;sp.cursor='pointer';
        sp.on('pointertap',()=>{
          const dest=State.getSystem(tf.targetSystemId);
          UI.toast(`${tf.ships.length} ships → ${dest?.name||'?'} · ${Math.round(p*100)}% · ${tf.owner==='enemy'?'⚠ ENEMY':'Player fleet'}`,'',3000);
        });

        const trail=new PIXI.Graphics();
        trail.lineStyle(1,col,0.2);
        trail.moveTo(fx,fy);trail.lineTo(cx,cy);

        const grp=new PIXI.Container();
        grp._trail=trail;grp._sp=sp;grp._tf=tf;
        travelLayer.addChild(trail);
        travelLayer.addChild(grp);
        grp.addChild(sp);
        travelSprites[tf.id]=grp;
      }

      const grp=travelSprites[tf.id];
      grp.x=cx;grp.y=cy;
      grp._sp.rotation=angle+Math.PI/2;
      if(grp._trail){
        const col=tf.owner==='player'?0x00c8ff:0xff3355;
        grp._trail.clear();
        grp._trail.lineStyle(1,col,0.2);
        grp._trail.moveTo(fx,fy);grp._trail.lineTo(cx,cy);
      }
      if(tf.warp&&grp._sp){grp._sp.scale.x=0.4;grp._sp.scale.y=2.2;}
    }
  }

  function show(){
    if(!app){
      init();
    } else {
      if(galaxyTicker){ try{app.ticker.remove(galaxyTicker);}catch(e){} galaxyTicker=null; }
      app.view.style.display='block';
      galaxyTicker = ()=>_updateTravelSprites();
      app.ticker.add(galaxyTicker);
    }
    rebuildScene();
    const legend=document.getElementById('legend');
    if(legend)legend.classList.remove('hidden');
  }
  function hide(){
    if(galaxyTicker&&app){ try{app.ticker.remove(galaxyTicker);}catch(e){} galaxyTicker=null; }
    if(app)app.view.style.display='none';
    const legend=document.getElementById('legend');
    if(legend)legend.classList.add('hidden');
  }

  return{show,hide,rebuildScene};
})();
