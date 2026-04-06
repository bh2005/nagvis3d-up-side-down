import { SCENE_MAX, FLOOR_STEP, BBOX_PAD, MINE_ACCENTS, BUILD_ACCENTS } from './config.js';

// ─────────────────────────────────────────────────────────────
//  GEO HELPERS
// ─────────────────────────────────────────────────────────────
const EARTH_R = 6_371_000;

/** Convert lat/lon to metres offset from a reference point.
 *  Returns { xM (east+), zM (north = -z in Three.js) }
 */
function latLonToM(lat, lon, refLat, refLon) {
  const xM =  Math.cos(refLat * Math.PI / 180) * (lon - refLon) * Math.PI / 180 * EARTH_R;
  const zM = -(lat - refLat) * Math.PI / 180 * EARTH_R;
  return { xM, zM };
}

export const fmtM = (m) => {
  if (m == null) return '?';
  if (m >= 1_000_000) return `${(m/1_000_000).toFixed(1)} Mm`;
  if (m >=     1_000) return `${(m/1_000).toFixed(1)} km`;
  return `${Math.round(m)} m`;
};

// ─────────────────────────────────────────────────────────────
//  GEO LAYOUT COMPUTER
//
//  Given nodes with { lat, lon, floor } and floors with { label, y },
//  computes:
//    • widthM / lengthM per floor  (BBox of nodes on that floor + padding)
//    • scene x/y/z per node        (projected + normalised to SCENE_MAX)
// ─────────────────────────────────────────────────────────────
export function computeGeoLayout(nodes, floors, cfg) {
  const refLat = cfg.lat, refLon = cfg.lon;

  // 1. Convert every node to metres from model reference point
  const nm = {};   // id → { xM, zM }
  nodes.forEach(n => { nm[n.id] = latLonToM(n.lat, n.lon, refLat, refLon); });

  // 2. Re-centre: subtract cluster centroid so the node cloud sits at
  //    scene origin (0,0) regardless of where the reference point is.
  //    Without this, models whose reference ≠ data centre show all nodes
  //    offset from the floor planes.
  const ids = Object.keys(nm);
  if (ids.length > 0) {
    const meanX = ids.reduce((s, id) => s + nm[id].xM, 0) / ids.length;
    const meanZ = ids.reduce((s, id) => s + nm[id].zM, 0) / ids.length;
    ids.forEach(id => { nm[id].xM -= meanX; nm[id].zM -= meanZ; });
  }

  // 3. BBox per floor (centred around origin)
  const updatedFloors = floors.map(fc => {
    const fn = nodes.filter(n => n.floor === fc.label);
    if (fn.length === 0) return { ...fc, widthM: BBOX_PAD * 2, lengthM: BBOX_PAD * 2 };

    const xs = fn.map(n => nm[n.id].xM);
    const zs = fn.map(n => nm[n.id].zM);
    return {
      ...fc,
      widthM:  Math.max(...xs) - Math.min(...xs) + BBOX_PAD * 2,
      lengthM: Math.max(...zs) - Math.min(...zs) + BBOX_PAD * 2,
    };
  });

  // 4. Global scale: largest floor dimension → SCENE_MAX
  const maxDimM = Math.max(...updatedFloors.map(f => Math.max(f.widthM, f.lengthM)));
  const scale   = SCENE_MAX / maxDimM;

  // 5. Node scene positions (centred)
  const nodePos = {};
  nodes.forEach(n => {
    const floor = updatedFloors.find(f => f.label === n.floor);
    nodePos[n.id] = {
      x: nm[n.id].xM * scale,
      y: floor?.y ?? 0,
      z: nm[n.id].zM * scale,
    };
  });

  return { floors: updatedFloors, nodePos, scale };
}

// ─────────────────────────────────────────────────────────────
//  MODEL PRESETS
// ─────────────────────────────────────────────────────────────
const MODEL_PRESETS = [
  {
    id:'dc1', name:'Datacenter DC1', type:'datacenter',
    width:20, length:10, rows:3, racksPerRow:5, rackUnits:42,
    dataUrl: 'data/dc1.json',
  },
  {
    id:'building1', name:'Building 1 · Kassel', type:'building',
    floorCount:4, width:110, length:110, floorHeight:3,
    lat:51.3127, lon:9.4797,   // Kassel
    dataUrl: 'data/building.json',
  },
  {
    id:'building2', name:'Building 2 · Bad Hersfeld', type:'building',
    floorCount:6, width:80, length:60, floorHeight:4,
    lat:50.8681, lon:9.7059,   // Bad Hersfeld
    dataUrl: 'data/building.json',
  },
  {
    id:'grube1', name:'Grube 1 · Heringen', type:'mine',
    floorHeight:300, lat:50.8922, lon:9.8979,   // Heringen (Werra)
    floors: [
      { label:'ÜBERTAGE', sub:'Schachtanlage'  },
      { label:'SOHLE 1',  sub:'−300 m'         },
      { label:'SOHLE 2',  sub:'−600 m'         },
      { label:'SOHLE 3',  sub:'−900 m'         },
    ],
    dataUrl: 'data/grube1.json',
  },
  {
    id:'grube2', name:'Grube 2 · Philippsthal', type:'mine',
    floorHeight:300, lat:50.8507, lon:9.9673,   // Philippsthal (Werra)
    floors: [
      { label:'ÜBERTAGE', sub:'Schachtanlage'  },
      { label:'SOHLE 1',  sub:'−300 m'         },
      { label:'SOHLE 2',  sub:'−600 m'         },
      { label:'SOHLE 3',  sub:'−900 m'         },
      { label:'SOHLE 4',  sub:'−1.200 m'       },
    ],
    dataUrl: 'data/grube2.json',
  },
];
// ─────────────────────────────────────────────────────────────
//  FLOOR BUILDER  →  { y, label, sub, accent }  per floor
//  widthM / lengthM added later by computeGeoLayout (or static)
// ─────────────────────────────────────────────────────────────
export function buildFloors(cfg) {
  // Datacenter: single virtual floor in der Mitte der Racks
  if (cfg.type === 'datacenter') {
    const rows = cfg.rows ?? 3, rpRow = cfg.racksPerRow ?? 5;
    return [{ y: 4, label: 'Datacenter',
      sub: `${rows} Reihen · ${rpRow} Racks · ${cfg.rackUnits ?? 42} HE`,
      accent: [13, 176, 245], widthM: cfg.width, lengthM: cfg.length }];
  }

  const n    = cfg.floors?.length ?? cfg.floorCount;
  const half = (n - 1) * FLOOR_STEP / 2;

  if (cfg.floors) {
    return cfg.floors.map((f, i) => ({
      ...f,
      y:      cfg.type === 'mine' ? half - i * FLOOR_STEP : -half + i * FLOOR_STEP,
      accent: f.accent ?? (cfg.type === 'mine'
                ? MINE_ACCENTS[i % MINE_ACCENTS.length]
                : BUILD_ACCENTS[i % BUILD_ACCENTS.length]),
      widthM:  f.widthM  ?? null,   // filled by computeGeoLayout
      lengthM: f.lengthM ?? null,
    }));
  }

  const wM = cfg.width, lM = cfg.length;
  if (cfg.type === 'mine') {
    return Array.from({ length: n }, (_, i) => ({
      y:       half - i * FLOOR_STEP,
      label:   i === 0 ? 'ÜBERTAGE' : `SOHLE ${i}`,
      sub:     i === 0 ? 'Oberfläche' : `−${i * cfg.floorHeight} m`,
      accent:  MINE_ACCENTS[i % MINE_ACCENTS.length],
      widthM: wM, lengthM: lM,
    }));
  } else {
    return Array.from({ length: n }, (_, i) => ({
      y:       -half + i * FLOOR_STEP,
      label:   i === 0 ? 'EG' : `${i}. OG`,
      sub:     i === 0 ? 'Erdgeschoss' : `+${i * cfg.floorHeight} m`,
      accent:  BUILD_ACCENTS[i % BUILD_ACCENTS.length],
      widthM: wM, lengthM: lM,
    }));
  }
}
// ─────────────────────────────────────────────────────────────
//  MODEL MANAGER
// ─────────────────────────────────────────────────────────────
const LS_KEY = 'nv2_3d_models_v1';
export const ModelManager = {
  _cache:          new Map(),
  _user()          { try { return JSON.parse(localStorage.getItem(LS_KEY)) || []; } catch { return []; } },
  _save(arr)       { localStorage.setItem(LS_KEY, JSON.stringify(arr)); },
  getAll()         { return [...MODEL_PRESETS, ...this._user()]; },
  getById(id)      { return this.getAll().find(m => m.id === id); },
  isPreset(id)     { return MODEL_PRESETS.some(m => m.id === id); },
  add(cfg)         { const a = this._user(); a.push(cfg); this._save(a); },
  remove(id)       { if (!this.isPreset(id)) this._save(this._user().filter(m => m.id !== id)); },
  getInitial()     {
    const hash = location.hash.replace('#', '');
    return this.getById(hash) ?? MODEL_PRESETS[0];
  },

  /** Fetch node/link data for a model config.
   *  Priority: cfg.data (inline) → cache → cfg.dataUrl (fetch) → empty */
  async fetchData(cfg) {
    if (cfg.data)     return cfg.data;
    if (!cfg.dataUrl) return { nodes: [], links: [] };
    if (this._cache.has(cfg.id)) return this._cache.get(cfg.id);
    const res = await fetch(cfg.dataUrl);
    if (!res.ok) throw new Error(`HTTP ${res.status} – ${cfg.dataUrl}`);
    const data = await res.json();
    this._cache.set(cfg.id, data);
    return data;
  },

  /** Optionally bootstrap additional models from an external JSON registry.
   *  The registry is an array of model-config objects (same shape as MODEL_PRESETS).
   *  Models whose id already exists in MODEL_PRESETS are skipped. */
  async loadRegistry(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Registry nicht erreichbar: ${url}`);
    const models = await res.json();
    models.forEach(m => {
      if (!MODEL_PRESETS.some(p => p.id === m.id)) MODEL_PRESETS.push(m);
    });
  },
};
