// ============================================================
//  data.js — Static game definitions (surface-first redesign)
// ============================================================

const Data = (() => {

  // ── Planet types ──────────────────────────────────────
  const PLANET_TYPES = {
    terrestrial: {
      label:'Terrestrial', icon:'🌍', habitability:'High', landable:true,
      colors:['#2a6e3a','#3a8a50','#2a5a8a','#1a4a6a'], oceanCol:'#1a3a8a',
      resources:{ metal:2.0, crystal:0.3, hydrogen:0.05, ammonia:0.8 },
    },
    gas_giant: {
      label:'Gas Giant', icon:'🪐', habitability:'None', landable:false,
      colors:['#c87c2a','#a05a18','#e8b060','#8a4a10'], oceanCol:null,
      resources:{ metal:0, crystal:0.2, hydrogen:4.0, ammonia:1.5 },
    },
    ice_giant: {
      label:'Ice Giant', icon:'🔵', habitability:'None', landable:false,
      colors:['#3a6aaa','#2a4a8a','#5a8acc','#6a9adc'], oceanCol:'#2a4a8a',
      resources:{ metal:0.1, crystal:2.0, hydrogen:0.3, ammonia:3.0 },
    },
    barren: {
      label:'Barren', icon:'🪨', habitability:'Low', landable:true,
      colors:['#5a4a3a','#4a3a2a','#6a5a4a','#3a2a1a'], oceanCol:null,
      resources:{ metal:1.0, crystal:0.8, hydrogen:0, ammonia:0 },
    },
    volcanic: {
      label:'Volcanic', icon:'🌋', habitability:'Low', landable:true,
      colors:['#8a2a1a','#6a1a0a','#aa3a2a','#cc5a3a'], oceanCol:'#cc3300',
      resources:{ metal:3.5, crystal:0.2, hydrogen:0, ammonia:0 },
    },
    frozen: {
      label:'Frozen', icon:'❄️', habitability:'Low', landable:true,
      colors:['#aaccdd','#8aaabb','#cce0ee','#6a8899'], oceanCol:'#88aacc',
      resources:{ metal:0.4, crystal:1.5, hydrogen:0.1, ammonia:1.0 },
    },
  };

  // ── Surface structures ────────────────────────────────
  // size: tile footprint [w, h]
  const STRUCTURES = {
    hq: {
      name:'HQ', icon:'🏛', desc:'Command center. Tap to build structures.',
      cost:{}, buildTime:0, size:[3,3],
      color:'#1a2a5a', roofColor:'#2244aa',
      requires:null, unique:true,
      isHQ:true,
    },
    city: {
      name:'City', icon:'🏙', desc:'Population center. Generates income.',
      cost:{ metal:500 }, buildTime:60, size:[8,8],
      color:'#2a2a3a', roofColor:'#3a3a5a',
      requires:['terrestrial'],
    },
    shipyard: {
      name:'Shipyard', icon:'🏗', desc:'Builds warships and missiles.',
      cost:{ metal:800, crystal:100 }, buildTime:90, size:[4,3],
      color:'#1a3a2a', roofColor:'#2a6a3a',
      requires:['terrestrial','barren'],
      isShipyard:true,
    },
    mine: {
      name:'Metal Mine', icon:'⛏', desc:'Extracts metal ore.',
      cost:{ metal:200 }, buildTime:30, size:[2,2],
      color:'#3a2a1a', roofColor:'#6a4a2a',
      requires:['terrestrial','barren','volcanic'],
      effect:{ metal:1.5 },
    },
    crystal_drill: {
      name:'Crystal Drill', icon:'💎', desc:'Extracts crystal deposits.',
      cost:{ metal:300, crystal:50 }, buildTime:45, size:[2,2],
      color:'#1a2a4a', roofColor:'#2a4a8a',
      requires:['barren','ice_giant','frozen'],
      effect:{ crystal:1.0 },
    },
    h2_platform: {
      name:'H₂ Platform', icon:'🛢', desc:'Hydrogen extraction.',
      cost:{ metal:400 }, buildTime:60, size:[3,2],
      color:'#3a2a0a', roofColor:'#8a5a1a',
      requires:['gas_giant'],
      effect:{ hydrogen:3.0 },
    },
    ammonia_plant: {
      name:'Ammonia Plant', icon:'🧪', desc:'Ammonia processing.',
      cost:{ metal:250, crystal:80 }, buildTime:40, size:[2,2],
      color:'#1a3a2a', roofColor:'#2a6a3a',
      requires:['ice_giant','frozen','terrestrial'],
      effect:{ ammonia:1.5 },
    },
    missile_silo: {
      name:'Missile Silo', icon:'💥', desc:'Stores missiles. Tap to launch.',
      cost:{ metal:400, crystal:200 }, buildTime:50, size:[2,2],
      color:'#3a1a1a', roofColor:'#6a2a2a',
      requires:null,
      isSilo:true,
    },
    shield_gen: {
      name:'Shield Generator', icon:'🛡', desc:'+80 planetary defense.',
      cost:{ metal:800, crystal:200 }, buildTime:80, size:[2,2],
      color:'#1a2a3a', roofColor:'#2a4a6a',
      requires:null,
      effect:{ defense:80 },
    },
    spaceport: {
      name:'Spaceport', icon:'🚀', desc:'Fleet hub, -20% fuel cost.',
      cost:{ metal:600, hydrogen:100 }, buildTime:50, size:[4,4],
      color:'#1a1a3a', roofColor:'#2a2a6a',
      requires:['terrestrial','barren'],
      effect:{ fuelDiscount:0.2 },
    },
    sensor_array: {
      name:'Sensor Array', icon:'📡', desc:'Reveals nearby systems.',
      cost:{ metal:300, crystal:100 }, buildTime:35, size:[2,2],
      color:'#1a2a1a', roofColor:'#3a5a3a',
      requires:null,
      effect:{ scanRange:2 },
    },
    warp_engine: {
      name:'Warp Engine', icon:'⚡', desc:'+50% fleet speed for one trip.',
      cost:{ metal:1000, crystal:400 }, buildTime:120, size:[3,2],
      color:'#2a1a3a', roofColor:'#5a2a8a',
      requires:['terrestrial'],
      effect:{ warp:true },
    },
    space_station: {
      name:'Space Control Station', icon:'🛰', desc:'Orbital control for non-landable planets.',
      cost:{ metal:600, crystal:200 }, buildTime:70, size:[3,3],
      color:'#1a1a2a', roofColor:'#2a2a5a',
      requires:['gas_giant','ice_giant'],
      isSCS:true,
    },
  };

  // ── Ship types ────────────────────────────────────────
  const SHIP_TYPES = {
    fighter: {
      name:'Fighter', icon:'▲', surfaceIcon:'✈',
      hp:40, attack:20, defense:8, speed:120,
      fuelCost:30, buildCost:{ metal:150 }, buildTime:0,
      desc:'Fast interceptor — single gun',
      canDestroyWatchdog:false,
    },
    destroyer: {
      name:'Destroyer', icon:'▲', surfaceIcon:'⊳',
      hp:90, attack:40, defense:18, speed:90,
      fuelCost:50, buildCost:{ metal:300, crystal:30 }, buildTime:1,
      desc:'Twin-gun escort vessel',
      canDestroyWatchdog:false,
    },
    battle_cruiser: {
      name:'Battle Cruiser', icon:'▲', surfaceIcon:'◈',
      hp:200, attack:80, defense:40, speed:60,
      fuelCost:100, buildCost:{ metal:700, crystal:150 }, buildTime:2,
      desc:'Siege cannon, long range low accuracy',
      canDestroyWatchdog:true, siegeAccuracy:0.45,
    },
    dreadnought: {
      name:'Dreadnought', icon:'▲', surfaceIcon:'⬟',
      hp:600, attack:200, defense:120, speed:30,
      fuelCost:200, buildCost:{ metal:2000, crystal:600 }, buildTime:3,
      desc:'Positron beam mothership',
      canDestroyWatchdog:true, isDreadnought:true,
    },
    watchdog: {
      name:'Watchdog Station', icon:'⬡', surfaceIcon:'⬡',
      hp:300, attack:60, defense:60, speed:0,
      fuelCost:0, buildCost:{ metal:1200, crystal:300 }, buildTime:2,
      desc:'Orbital station, auto-fires. Reload: 8s',
      isStation:true, reloadTime:8,
      canDestroyWatchdog:false,
    },
    transporter: {
      name:'Transporter', icon:'▲', surfaceIcon:'▭',
      hp:60, attack:0, defense:5, speed:70,
      fuelCost:50, buildCost:{ metal:400 }, buildTime:1,
      desc:'Robot mineral hauler',
      isTransport:true, canDestroyWatchdog:false,
    },
    probe: {
      name:'Probe', icon:'·', surfaceIcon:'◦',
      hp:5, attack:0, defense:0, speed:180,
      fuelCost:10, buildCost:{ metal:80, crystal:20 }, buildTime:0,
      desc:'Unmanned scout — explores unknown star systems on arrival',
      isProbe:true, canDestroyWatchdog:false,
    },
  };

  // ── Galaxy systems ────────────────────────────────────
  const SYSTEMS = [
    {
      id:'sol', name:'Sol', x:0.50, y:0.50,
      owner:'player', explored:true,
      starColor:'#ffe898', starSize:10, starType:'G-Type Yellow',
      planets:[
        {
          name:'Mercury', type:'barren', owner:'player',
          radius:2440, gravity:0.38, atmo:'Vacuum', temp:'-180–430°C', water:'0%',
          buildings:[
            { key:'hq', x:10, y:8 },
            { key:'mine', x:5, y:5 },
            { key:'mine', x:14, y:5 },
          ],
          ships:[], shipQueue:null, buildQueue:null, missileStock:0,
        },
        {
          name:'Terra Nova', type:'terrestrial', owner:'player',
          radius:6400, gravity:1.0, atmo:'Breathable', temp:'18°C avg', water:'71%',
          buildings:[
            { key:'hq',          x:20, y:12 },
            { key:'city',        x:5,  y:5  },
            { key:'city',        x:28, y:5  },
            { key:'shipyard',    x:15, y:20 },
            { key:'mine',        x:8,  y:20 },
            { key:'mine',        x:35, y:18 },
            { key:'shield_gen',  x:38, y:8  },
            { key:'missile_silo',x:22, y:22 },
          ],
          ships:[
            { id:'s1', type:'fighter',     name:'Fighter-1',   hp:40,  maxHp:40,  state:'dock', owner:'player', systemId:'sol', planetIdx:1 },
            { id:'s2', type:'destroyer',   name:'Destroyer-1', hp:90,  maxHp:90,  state:'dock', owner:'player', systemId:'sol', planetIdx:1 },
            { id:'s3', type:'dreadnought', name:'ISS Colossus',hp:600, maxHp:600, state:'orbit',owner:'player', systemId:'sol', planetIdx:1 },
          ],
          shipQueue:null, buildQueue:null, missileStock:3,
        },
        {
          name:'Red Reach', type:'barren', owner:'player',
          radius:3390, gravity:0.38, atmo:'Thin CO₂', temp:'-63°C avg', water:'0%',
          buildings:[
            { key:'hq',   x:8,  y:8  },
            { key:'mine', x:5,  y:14 },
            { key:'mine', x:12, y:14 },
          ],
          ships:[], shipQueue:null, buildQueue:null, missileStock:0,
        },
        {
          name:'Jovian Rex', type:'gas_giant', owner:'player',
          radius:71000, gravity:2.53, atmo:'H₂/He', temp:'-108°C', water:'0%',
          buildings:[
            { key:'space_station', x:0, y:0 },
            { key:'h2_platform',   x:0, y:0 },
            { key:'h2_platform',   x:0, y:0 },
          ],
          ships:[], shipQueue:null, buildQueue:null, missileStock:0,
        },
        {
          name:'Crystalis', type:'ice_giant', owner:'none',
          radius:25000, gravity:1.14, atmo:'CH₄/NH₃', temp:'-200°C', water:'Frozen',
          buildings:[], ships:[], shipQueue:null, buildQueue:null, missileStock:0,
        },
      ],
    },
    {
      id:'alpha', name:'Alpha Centauri', x:0.28, y:0.34,
      owner:'player', explored:true,
      starColor:'#ffbb88', starSize:9, starType:'K-Type Orange',
      planets:[
        {
          name:'Verdana', type:'terrestrial', owner:'player',
          radius:7200, gravity:1.1, atmo:'Breathable', temp:'22°C avg', water:'55%',
          buildings:[
            { key:'hq',           x:18, y:10 },
            { key:'city',         x:4,  y:4  },
            { key:'shipyard',     x:14, y:18 },
            { key:'mine',         x:26, y:14 },
            { key:'ammonia_plant',x:8,  y:18 },
            { key:'missile_silo', x:22, y:20 },
          ],
          ships:[
            { id:'s4', type:'fighter', name:'Fighter-2', hp:40, maxHp:40, state:'dock', owner:'player', systemId:'alpha', planetIdx:0 },
          ],
          shipQueue:null, buildQueue:null, missileStock:3,
        },
        {
          name:'Dust Isle', type:'barren', owner:'none',
          radius:2800, gravity:0.4, atmo:'None', temp:'-90°C', water:'0%',
          buildings:[], ships:[], shipQueue:null, buildQueue:null, missileStock:0,
        },
        {
          name:'Gasmire', type:'gas_giant', owner:'none',
          radius:60000, gravity:2.1, atmo:'H₂/He', temp:'-130°C', water:'0%',
          buildings:[], ships:[], shipQueue:null, buildQueue:null, missileStock:0,
        },
      ],
    },
    {
      id:'sirius', name:'Sirius', x:0.72, y:0.22,
      owner:'enemy', explored:true,
      starColor:'#aaddff', starSize:13, starType:'A-Type White',
      planets:[
        {
          name:'Voraxis I', type:'terrestrial', owner:'enemy',
          radius:5800, gravity:0.9, atmo:'Toxic', temp:'45°C avg', water:'20%',
          buildings:[
            { key:'hq',          x:15, y:10 },
            { key:'city',        x:4,  y:4  },
            { key:'city',        x:24, y:4  },
            { key:'shipyard',    x:12, y:18 },
            { key:'shield_gen',  x:28, y:12 },
            { key:'missile_silo',x:20, y:20 },
          ],
          ships:[
            { id:'e1', type:'battle_cruiser', name:'BC-Alpha',  hp:200, maxHp:200, state:'orbit', owner:'enemy', systemId:'sirius', planetIdx:0 },
            { id:'e2', type:'destroyer',      name:'Dest-1',    hp:90,  maxHp:90,  state:'dock',  owner:'enemy', systemId:'sirius', planetIdx:0 },
          ],
          shipQueue:null, buildQueue:null, missileStock:2,
        },
        {
          name:'Voraxis II', type:'terrestrial', owner:'enemy',
          radius:6900, gravity:1.2, atmo:'Breathable', temp:'30°C avg', water:'60%',
          buildings:[
            { key:'hq',   x:12, y:10 },
            { key:'city', x:4,  y:4  },
            { key:'mine', x:22, y:14 },
            { key:'mine', x:8,  y:18 },
          ],
          ships:[
            { id:'e3', type:'fighter', name:'Fighter-E1', hp:40, maxHp:40, state:'dock', owner:'enemy', systemId:'sirius', planetIdx:1 },
            { id:'e4', type:'fighter', name:'Fighter-E2', hp:40, maxHp:40, state:'dock', owner:'enemy', systemId:'sirius', planetIdx:1 },
          ],
          shipQueue:null, buildQueue:null, missileStock:0,
        },
        {
          name:'Ironveil', type:'volcanic', owner:'enemy',
          radius:3000, gravity:0.5, atmo:'SO₂', temp:'400°C', water:'0%',
          buildings:[
            { key:'hq',   x:8,  y:8  },
            { key:'mine', x:4,  y:14 },
            { key:'mine', x:12, y:14 },
          ],
          ships:[], shipQueue:null, buildQueue:null, missileStock:0,
        },
        {
          name:'Cloudbane', type:'gas_giant', owner:'enemy',
          radius:55000, gravity:2.4, atmo:'H₂/He', temp:'-120°C', water:'0%',
          buildings:[
            { key:'space_station', x:0, y:0 },
            { key:'h2_platform',   x:0, y:0 },
          ],
          ships:[], shipQueue:null, buildQueue:null, missileStock:0,
        },
      ],
    },
    {
      id:'tau_ceti', name:'Tau Ceti', x:0.38, y:0.68,
      owner:'none', explored:true,
      starColor:'#ffeeaa', starSize:8, starType:'G-Type Yellow',
      planets:[
        { name:'Cerulean', type:'terrestrial', owner:'none', radius:6000, gravity:0.95, atmo:'Breathable', temp:'25°C avg', water:'65%', buildings:[], ships:[], shipQueue:null, buildQueue:null, missileStock:0 },
        { name:'Aurite',   type:'barren',      owner:'none', radius:2100, gravity:0.3,  atmo:'None',       temp:'-50°C',   water:'0%',  buildings:[], ships:[], shipQueue:null, buildQueue:null, missileStock:0 },
        { name:'Neptara',  type:'ice_giant',   owner:'none', radius:22000,gravity:1.1,  atmo:'CH₄',        temp:'-210°C',  water:'Ice', buildings:[], ships:[], shipQueue:null, buildQueue:null, missileStock:0 },
      ],
    },
    {
      id:'vega', name:'Vega', x:0.80, y:0.56,
      owner:'enemy', explored:true,
      starColor:'#ccddff', starSize:11, starType:'A-Type White',
      planets:[
        {
          name:'Pyros', type:'volcanic', owner:'enemy',
          radius:4000, gravity:0.7, atmo:'SO₂', temp:'600°C', water:'0%',
          buildings:[
            { key:'hq',   x:8,  y:8  },
            { key:'mine', x:4,  y:14 },
            { key:'mine', x:12, y:12 },
            { key:'mine', x:18, y:16 },
          ],
          ships:[
            { id:'e5', type:'dreadnought', name:'Void Hammer', hp:600, maxHp:600, state:'orbit', owner:'enemy', systemId:'vega', planetIdx:0 },
          ],
          shipQueue:null, buildQueue:null, missileStock:0,
        },
        { name:'Glacivex',   type:'ice_giant', owner:'enemy', radius:28000, gravity:1.2, atmo:'CH₄/NH₃', temp:'-220°C', water:'Ice', buildings:[{key:'space_station',x:0,y:0},{key:'crystal_drill',x:0,y:0}], ships:[], shipQueue:null, buildQueue:null, missileStock:0 },
        { name:'Veld Prime', type:'gas_giant', owner:'enemy', radius:80000, gravity:2.8, atmo:'H₂/He',   temp:'-140°C', water:'0%',  buildings:[{key:'space_station',x:0,y:0},{key:'h2_platform',x:0,y:0},{key:'h2_platform',x:0,y:0}], ships:[], shipQueue:null, buildQueue:null, missileStock:0 },
      ],
    },
    { id:'proxima',   name:'Proxima',          x:0.18, y:0.55, owner:'none', explored:false, starColor:'#ff8866', starSize:6,  starType:'M-Type Red Dwarf', planets:[] },
    { id:'epsilon',   name:'Epsilon Eridani',   x:0.60, y:0.78, owner:'none', explored:false, starColor:'#ffaa88', starSize:7,  starType:'K-Type Orange',   planets:[] },
    { id:'barnard',   name:"Barnard's Star",    x:0.44, y:0.20, owner:'none', explored:false, starColor:'#ff6644', starSize:5,  starType:'M-Type Red Dwarf', planets:[] },
    { id:'fomalhaut', name:'Fomalhaut',          x:0.86, y:0.36, owner:'none', explored:false, starColor:'#ffffff', starSize:10, starType:'A-Type White',    planets:[] },
{
  id:'acrux', name:'Acrux', x:0.88, y:0.72,
  owner:'none', explored:false,
  starColor:'#eef0ff', starSize:12, starType:'B-Type Blue-White',
  planets:[
    { name:'Azura', type:'terrestrial', owner:'none', radius:6800, gravity:1.05, atmo:'Breathable', temp:'15°C avg', water:'58%', buildings:[], ships:[], shipQueue:null, buildQueue:null, missileStock:0 },
    { name:'Cinder', type:'volcanic', owner:'none', radius:3500, gravity:0.55, atmo:'SO₂', temp:'550°C', water:'0%', buildings:[], ships:[], shipQueue:null, buildQueue:null, missileStock:0 },
    { name:'Vapros', type:'gas_giant', owner:'none', radius:65000, gravity:2.2, atmo:'H₂/He', temp:'-150°C', water:'0%', buildings:[], ships:[], shipQueue:null, buildQueue:null, missileStock:0 },
  ],
},
{
  id:'betelgeuse', name:'Betelgeuse', x:0.15, y:0.82,
  owner:'none', explored:false,
  starColor:'#ff8866', starSize:18, starType:'M-Type Red Supergiant',
  planets:[
    { name:'Emberheart', type:'volcanic', owner:'none', radius:5200, gravity:0.85, atmo:'Toxic', temp:'750°C', water:'0%', buildings:[], ships:[], shipQueue:null, buildQueue:null, missileStock:0 },
    { name:'Ashveil', type:'barren', owner:'none', radius:2700, gravity:0.35, atmo:'Thin Dust', temp:'-30°C', water:'0%', buildings:[], ships:[], shipQueue:null, buildQueue:null, missileStock:0 },
    { name:'Pyrax', type:'gas_giant', owner:'none', radius:95000, gravity:3.1, atmo:'H₂/He', temp:'-100°C', water:'0%', buildings:[], ships:[], shipQueue:null, buildQueue:null, missileStock:0 },
  ],
},
{
  id:'rigil', name:'Rigil Kentaurus', x:0.32, y:0.29,
  owner:'none', explored:false,
  starColor:'#fff4cc', starSize:9, starType:'G-Type Yellow',
  planets:[
    { name:'New Eden', type:'terrestrial', owner:'none', radius:6300, gravity:0.98, atmo:'Breathable', temp:'20°C avg', water:'62%', buildings:[], ships:[], shipQueue:null, buildQueue:null, missileStock:0 },
    { name:'Frosthold', type:'ice_giant', owner:'none', radius:24000, gravity:1.08, atmo:'CH₄/NH₃', temp:'-195°C', water:'Frozen', buildings:[], ships:[], shipQueue:null, buildQueue:null, missileStock:0 },
    { name:'Dustfall', type:'barren', owner:'none', radius:1900, gravity:0.25, atmo:'None', temp:'-70°C', water:'0%', buildings:[], ships:[], shipQueue:null, buildQueue:null, missileStock:0 },
  ],
},
{
  id:'polaris', name:'Polaris', x:0.50, y:0.05,
  owner:'none', explored:false,
  starColor:'#ffffcc', starSize:14, starType:'F-Type Yellow-White Supergiant',
  planets:[
    { name:'Avalon', type:'terrestrial', owner:'none', radius:7100, gravity:1.12, atmo:'Breathable', temp:'10°C avg', water:'48%', buildings:[], ships:[], shipQueue:null, buildQueue:null, missileStock:0 },
    { name:'Permafrost', type:'ice_giant', owner:'none', radius:26000, gravity:1.15, atmo:'CH₄', temp:'-210°C', water:'Ice', buildings:[], ships:[], shipQueue:null, buildQueue:null, missileStock:0 },
    { name:'Nyx', type:'gas_giant', owner:'none', radius:72000, gravity:2.6, atmo:'H₂/He', temp:'-170°C', water:'0%', buildings:[], ships:[], shipQueue:null, buildQueue:null, missileStock:0 },
    { name:'Obsidian', type:'volcanic', owner:'none', radius:3800, gravity:0.6, atmo:'SO₂', temp:'480°C', water:'0%', buildings:[], ships:[], shipQueue:null, buildQueue:null, missileStock:0 },
  ],
},
{
  id:'antares', name:'Antares', x:0.68, y:0.92,
  owner:'none', explored:false,
  starColor:'#ff6644', starSize:16, starType:'M-Type Red Supergiant',
  planets:[
    { name:'Scorch', type:'volcanic', owner:'none', radius:4800, gravity:0.78, atmo:'CO₂/SO₂', temp:'680°C', water:'0%', buildings:[], ships:[], shipQueue:null, buildQueue:null, missileStock:0 },
    { name:'Crag', type:'barren', owner:'none', radius:3100, gravity:0.42, atmo:'Thin CO₂', temp:'-20°C', water:'0%', buildings:[], ships:[], shipQueue:null, buildQueue:null, missileStock:0 },
    { name:'Titanis', type:'gas_giant', owner:'none', radius:88000, gravity:2.9, atmo:'H₂/He', temp:'-130°C', water:'0%', buildings:[], ships:[], shipQueue:null, buildQueue:null, missileStock:0 },
    { name:'Helheim', type:'ice_giant', owner:'none', radius:30000, gravity:1.25, atmo:'CH₄/NH₃', temp:'-225°C', water:'Ice', buildings:[], ships:[], shipQueue:null, buildQueue:null, missileStock:0 },
  ],
},
  ];

  const LANES = [
    ['sol','alpha'],['sol','tau_ceti'],['sol','barnard'],
    ['alpha','proxima'],['alpha','tau_ceti'],
    ['tau_ceti','epsilon'],['sirius','vega'],
    ['sirius','barnard'],['vega','fomalhaut'],
    ['epsilon','vega'],['sol','sirius'],
  ];

  return { PLANET_TYPES, STRUCTURES, SHIP_TYPES, SYSTEMS, LANES };
})();
