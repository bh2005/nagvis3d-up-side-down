import * as THREE        from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer,
         CSS2DObject }   from 'three/addons/renderers/CSS2DRenderer.js';

// ─────────────────────────────────────────────────────────────
//  STATUS CONFIG
// ─────────────────────────────────────────────────────────────
const SC = {
  ok:       { hex:0x27ae60, emissive:0x1a7a40, badge:'s-ok',   cls:'ok',   label:'OK',       sev:0 },
  warning:  { hex:0xe67e22, emissive:0xa05510, badge:'s-warn',  cls:'warn', label:'WARNING',  sev:1 },
  unknown:  { hex:0x7f8c8d, emissive:0x4a5455, badge:'s-unkn',  cls:'unkn', label:'UNKNOWN',  sev:2 },
  critical: { hex:0xe74c3c, emissive:0xb02020, badge:'s-crit',  cls:'crit', label:'CRITICAL', sev:3 },
  down:     { hex:0xc0392b, emissive:0x801010, badge:'s-down',  cls:'down', label:'DOWN',     sev:4 },
};
const S  = (s) => SC[s] ?? SC.unknown;
const al = (s) => s === 'critical' || s === 'down';

// ─────────────────────────────────────────────────────────────
//  CONSTANTS
// ─────────────────────────────────────────────────────────────
const MINE_ACCENTS = [
  [19,211,142], [0,180,220],  [60,110,210],  [110,55,190],
  [150,30,150], [180,20,100], [200,50,50],   [220,100,20],
];
const BUILD_ACCENTS = [
  [130,140,160], [80,175,100],  [70,140,220],  [20,165,175],
  [180,120,60],  [160,90,180],  [200,160,40],  [90,190,140],
];

const SCENE_MAX      = 180;   // largest floor → this many scene units wide
const FLOOR_STEP     = 35;    // vertical gap between floors (scene units)
const BBOX_PAD       = 300;   // metres of padding around node cluster per floor
const TUNNEL_MIN_DIST = 30;   // scene-unit threshold: underground links longer than this → tunnel glow

// ─────────────────────────────────────────────────────────────
//  CSS2D CLEANUP
//  CSS2DRenderer nutzt eine WeakMap als Cache. Wird ein Objekt aus der
//  Szene entfernt und hat keine anderen JS-Referenzen mehr, kann der GC
//  den Eintrag löschen bevor der Renderer aufräumt → DOM-Element bleibt
//  sichtbar ("hängende Labels"). Explizites Entfernen aus dem DOM ist
//  die sichere Lösung.
// ─────────────────────────────────────────────────────────────
function disposeCSS2D(object) {
  object.traverse(child => {
    if (child.isCSS2DObject && child.element?.parentNode) {
      child.element.parentNode.removeChild(child.element);
    }
  });
}

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

const fmtM = (m) => {
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
function computeGeoLayout(nodes, floors, cfg) {
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
//  BUILDING DATA  →  data/building.json
// ─────────────────────────────────────────────────────────────
const BUILDING_DATA = {
  nodes: [
    // ── EG  ───────────────────────────────────────────────
    { id:'mdf-sw',     label:'MDF-Switch',   type:'switch', status:'ok',
      x:  0, y:-52, z:  0, floor:'EG' },
    { id:'portal-to-dc', label:'Datacenter-Raum', type:'host', status:'ok',
      x: -35, y:-52, z: -35, floor:'EG', linkedModel:'dc1' },
    { id:'reception',  label:'Reception-PC', type:'host',   status:'ok',
      x: 24, y:-52, z: 20, floor:'EG' },
    { id:'printer-eg', label:'Drucker EG',   type:'host',   status:'ok',
      x:-20, y:-52, z: 22, floor:'EG' },

    // ── 1. OG ─────────────────────────────────────────────
    { id:'sw-og1',  label:'SW-1.OG',   type:'switch', status:'ok',
      x:  0, y:-18, z:  0, floor:'1. OG' },
    { id:'ws-1-01', label:'WS-1-01',   type:'host',   status:'ok',
      x:-30, y:-18, z:-22, floor:'1. OG' },
    { id:'ws-1-02', label:'WS-1-02',   type:'host',   status:'warning',
      x: 30, y:-18, z:-22, floor:'1. OG' },
    { id:'ws-1-03', label:'WS-1-03',   type:'host',   status:'ok',
      x:  0, y:-18, z: 34, floor:'1. OG' },

    // ── 2. OG ─────────────────────────────────────────────
    { id:'sw-og2',  label:'SW-2.OG',   type:'switch', status:'ok',
      x:  0, y: 18, z:  0, floor:'2. OG' },
    { id:'ws-2-01', label:'WS-2-01',   type:'host',   status:'ok',
      x:-32, y: 18, z:-20, floor:'2. OG' },
    { id:'ws-2-02', label:'WS-2-02',   type:'host',   status:'critical',
      x: 32, y: 18, z:-20, floor:'2. OG' },
    { id:'voip-2',  label:'VoIP-2.OG', type:'host',   status:'ok',
      x: 16, y: 18, z: 30, floor:'2. OG' },

    // ── 3. OG ─────────────────────────────────────────────
    { id:'sw-og3',    label:'SW-3.OG',    type:'switch', status:'ok',
      x:  0, y: 52, z:  0, floor:'3. OG' },
    { id:'server-01', label:'server-01',  type:'host',   status:'ok',
      x:-26, y: 52, z:-24, floor:'3. OG' },
    { id:'server-02', label:'server-02',  type:'host',   status:'ok',
      x: 26, y: 52, z:-24, floor:'3. OG' },
    { id:'nas-01',    label:'NAS-01',     type:'host',   status:'warning',
      x:  0, y: 52, z: 34, floor:'3. OG' },

    // ── AccessPoints ──────────────────────────────────────
    { id:'ap-eg-01',  label:'AP-EG-01',   type:'accesspoint', status:'ok',
      wifiDbm:-52, x: 18, y:-52, z:-18, floor:'EG' },

    { id:'ap-og1-01', label:'AP-1OG-01',  type:'accesspoint', status:'ok',
      wifiDbm:-44, x:-22, y:-18, z: 10, floor:'1. OG' },
    { id:'ap-og1-02', label:'AP-1OG-02',  type:'accesspoint', status:'warning',
      wifiDbm:-68, x: 24, y:-18, z: 10, floor:'1. OG' },

    { id:'ap-og2-01', label:'AP-2OG-01',  type:'accesspoint', status:'ok',
      wifiDbm:-41, x:  0, y: 18, z:-12, floor:'2. OG' },

    { id:'ap-og3-01', label:'AP-3OG-01',  type:'accesspoint', status:'ok',
      wifiDbm:-55, x:-18, y: 52, z: 16, floor:'3. OG' },
    { id:'ap-og3-02', label:'AP-3OG-02',  type:'accesspoint', status:'ok',
      wifiDbm:-49, x: 20, y: 52, z: 16, floor:'3. OG' },
  ],
  links: [
    // ── Backbone / Steigleitung (vertikal, keine Tunnel-Optik) ─
    { source:'mdf-sw', target:'sw-og1', status:'ok' },
    { source:'sw-og1', target:'sw-og2', status:'ok' },
    { source:'sw-og2', target:'sw-og3', status:'ok' },

    // ── EG Distribution (Kabelkanal) ──────────────────────
    { source:'mdf-sw', target:'reception',  status:'ok', tunnel:true },
    { source:'mdf-sw', target:'printer-eg', status:'ok', tunnel:true },

    // ── 1.OG Distribution ─────────────────────────────────
    { source:'sw-og1', target:'ws-1-01', status:'ok',      tunnel:true },
    { source:'sw-og1', target:'ws-1-02', status:'warning',  tunnel:true },
    { source:'sw-og1', target:'ws-1-03', status:'ok',      tunnel:true },

    // ── 2.OG Distribution ─────────────────────────────────
    { source:'sw-og2', target:'ws-2-01', status:'ok',      tunnel:true },
    { source:'sw-og2', target:'ws-2-02', status:'critical', tunnel:true },
    { source:'sw-og2', target:'voip-2',  status:'ok',      tunnel:true },

    // ── 3.OG Distribution ─────────────────────────────────
    { source:'sw-og3', target:'server-01', status:'ok',     tunnel:true },
    { source:'sw-og3', target:'server-02', status:'ok',     tunnel:true },
    { source:'sw-og3', target:'nas-01',    status:'warning', tunnel:true },
  ],
};

// ─────────────────────────────────────────────────────────────
//  DATACENTER DATA
//  Koordinatensystem (scale: 1 Szeneneinheit = 0.5 m):
//    Raum 20×10 m → 40×20 Szeneneinheiten
//    3 Reihen (A/B/C) bei Z = −5, 0, +5
//    5 Racks pro Reihe bei X ≈ −13, −7, 0, +7, +13
//    Rack-Höhe: 8 Szeneneinheiten = 42 HE  (1 HE ≈ 0.19 u)
//    Y-Achse: 0 = Rack-Boden, 8 = Rack-Decke
//      y ≈ 0.5–1.5  → unteres Rack-Drittel (Server/Storage)
//      y ≈ 3.5–4.5  → Rack-Mitte
//      y ≈ 6.5–7.0  → oberes Rack-Drittel (Switches/Patchpanel)
// ─────────────────────────────────────────────────────────────
const DATACENTER_DATA = {
  nodes: [
    // ── Portal zurück zum Gebäude ─────────────────────────
    { id:'portal-to-bld', label:'Building 2 · EG', type:'host', status:'ok',
      x:-18, y:0.5, z: -9, floor:'Datacenter', linkedModel:'building2' },

    // ── Reihe A (Z=−5) · Netzwerk ─────────────────────────
    { id:'core-sw-dc',   label:'CORE-SW-DC',     type:'switch', status:'ok',
      x:-13, y:7.0, z:-5, floor:'Datacenter' },
    { id:'fw-dc-01',     label:'Firewall-DC',     type:'server', status:'ok',
      x:-13, y:6.2, z:-5, floor:'Datacenter' },
    { id:'dist-sw-a1',   label:'DIST-SW-A1',      type:'switch', status:'ok',
      x: -7, y:7.0, z:-5, floor:'Datacenter' },
    { id:'dist-sw-a2',   label:'DIST-SW-A2',      type:'switch', status:'warning',
      x:  0, y:7.0, z:-5, floor:'Datacenter' },
    { id:'lb-dc-01',     label:'Loadbalancer-01',  type:'server', status:'ok',
      x:  7, y:7.0, z:-5, floor:'Datacenter' },
    { id:'mon-dc-01',    label:'Monitoring-DC',    type:'server', status:'ok',
      x: 13, y:7.0, z:-5, floor:'Datacenter' },

    // ── Reihe B (Z=0) · Compute ───────────────────────────
    { id:'web-dc-01',    label:'web-dc-01',        type:'server', status:'ok',
      x:-13, y:1.0, z: 0, floor:'Datacenter' },
    { id:'web-dc-02',    label:'web-dc-02',         type:'server', status:'ok',
      x:-13, y:1.6, z: 0, floor:'Datacenter' },
    { id:'web-dc-03',    label:'web-dc-03',         type:'server', status:'critical',
      x: -7, y:1.0, z: 0, floor:'Datacenter' },
    { id:'web-dc-04',    label:'web-dc-04',         type:'server', status:'ok',
      x: -7, y:1.6, z: 0, floor:'Datacenter' },
    { id:'app-dc-01',    label:'app-dc-01',         type:'server', status:'ok',
      x:  0, y:1.0, z: 0, floor:'Datacenter' },
    { id:'app-dc-02',    label:'app-dc-02',         type:'server', status:'ok',
      x:  0, y:1.6, z: 0, floor:'Datacenter' },
    { id:'app-dc-03',    label:'app-dc-03',         type:'server', status:'ok',
      x:  7, y:1.0, z: 0, floor:'Datacenter' },
    { id:'app-dc-04',    label:'app-dc-04',         type:'server', status:'warning',
      x:  7, y:1.6, z: 0, floor:'Datacenter' },
    { id:'db-dc-01',     label:'db-primary-dc',     type:'server', status:'ok',
      x: 13, y:3.5, z: 0, floor:'Datacenter' },
    { id:'db-dc-02',     label:'db-replica-dc',     type:'server', status:'ok',
      x: 13, y:4.5, z: 0, floor:'Datacenter' },

    // ── Reihe C (Z=+5) · Storage ──────────────────────────
    { id:'san-sw-01',    label:'SAN-SW-01',         type:'switch', status:'ok',
      x: 13, y:7.0, z: 5, floor:'Datacenter' },
    { id:'nas-dc-01',    label:'NAS-DC-01',          type:'server', status:'ok',
      x:-13, y:3.5, z: 5, floor:'Datacenter' },
    { id:'nas-dc-02',    label:'NAS-DC-02',          type:'server', status:'ok',
      x: -7, y:3.5, z: 5, floor:'Datacenter' },
    { id:'backup-dc-01', label:'Backup-DC-01',       type:'server', status:'ok',
      x:  0, y:1.5, z: 5, floor:'Datacenter' },
    { id:'tape-dc-01',   label:'Tape-Library',       type:'server', status:'unknown',
      x:  7, y:2.5, z: 5, floor:'Datacenter' },
  ],
  links: [
    // ── Netzwerk-Backbone ──────────────────────────────────
    { source:'core-sw-dc',  target:'fw-dc-01',    status:'ok',      tunnel:true },
    { source:'core-sw-dc',  target:'dist-sw-a1',  status:'ok',      tunnel:true },
    { source:'core-sw-dc',  target:'dist-sw-a2',  status:'warning', tunnel:true },
    { source:'core-sw-dc',  target:'lb-dc-01',    status:'ok',      tunnel:true },
    { source:'core-sw-dc',  target:'mon-dc-01',   status:'ok',      tunnel:true },

    // ── Compute-Distribution ───────────────────────────────
    { source:'dist-sw-a1',  target:'web-dc-01',   status:'ok',      tunnel:true },
    { source:'dist-sw-a1',  target:'web-dc-02',   status:'ok',      tunnel:true },
    { source:'dist-sw-a1',  target:'web-dc-03',   status:'critical',tunnel:true },
    { source:'dist-sw-a1',  target:'web-dc-04',   status:'ok',      tunnel:true },
    { source:'dist-sw-a2',  target:'app-dc-01',   status:'ok',      tunnel:true },
    { source:'dist-sw-a2',  target:'app-dc-02',   status:'ok',      tunnel:true },
    { source:'dist-sw-a2',  target:'app-dc-03',   status:'ok',      tunnel:true },
    { source:'dist-sw-a2',  target:'app-dc-04',   status:'warning', tunnel:true },

    // ── Load Balancer → Web ────────────────────────────────
    { source:'lb-dc-01',    target:'web-dc-01',   status:'ok',      tunnel:true },
    { source:'lb-dc-01',    target:'web-dc-02',   status:'ok',      tunnel:true },
    { source:'lb-dc-01',    target:'web-dc-03',   status:'critical',tunnel:true },
    { source:'lb-dc-01',    target:'web-dc-04',   status:'ok',      tunnel:true },

    // ── App → DB ───────────────────────────────────────────
    { source:'app-dc-01',   target:'db-dc-01',    status:'ok',      tunnel:true },
    { source:'app-dc-02',   target:'db-dc-01',    status:'ok',      tunnel:true },
    { source:'app-dc-03',   target:'db-dc-01',    status:'ok',      tunnel:true },
    { source:'app-dc-04',   target:'db-dc-02',    status:'warning', tunnel:true },
    { source:'db-dc-01',    target:'db-dc-02',    status:'ok',      tunnel:true },

    // ── SAN / Storage ──────────────────────────────────────
    { source:'san-sw-01',   target:'nas-dc-01',   status:'ok',      tunnel:true },
    { source:'san-sw-01',   target:'nas-dc-02',   status:'ok',      tunnel:true },
    { source:'san-sw-01',   target:'backup-dc-01',status:'ok',      tunnel:true },
    { source:'san-sw-01',   target:'tape-dc-01',  status:'unknown', tunnel:true },
    { source:'nas-dc-01',   target:'backup-dc-01',status:'ok',      tunnel:true },
    { source:'nas-dc-02',   target:'backup-dc-01',status:'ok',      tunnel:true },
  ],
};

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
function buildFloors(cfg) {
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
const ModelManager = {
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

// ─────────────────────────────────────────────────────────────
//  MOCK DATA
//  Nodes carry BOTH static x/y/z (for building models) and
//  lat/lon/floor (for geo-projected mine models).
//  Grube 1 reference: 51.5062°N, 9.3327°E
// ─────────────────────────────────────────────────────────────
const MAP_DATA = {
  nodes: [
    // ── ÜBERTAGE  ─────────────────────────────────────────
    { id:'core-sw-ot',  label:'CORE-SW-ÜBERTAGE', type:'switch', status:'ok',
      x:  0, y: 52, z:  0,
      lat:51.5062, lon:9.3327, floor:'ÜBERTAGE' },

    // ── SOHLE 1  – Core + Dist-Switches (Stern) ───────────
    //   Core in der Mitte, Dist-Switches radial versetzt
    { id:'core-sw-s1',  label:'CORE-SW-SOHLE1',   type:'switch', status:'ok',
      x:  0, y: 17, z:  0,
      lat:51.5050, lon:9.3350, floor:'SOHLE 1' },
    { id:'dist-sw-01',  label:'DIST-SW-ALPHA',     type:'switch', status:'ok',
      x:-32, y: 17, z: -12,
      lat:51.4750, lon:9.2900, floor:'SOHLE 1' },
    { id:'dist-sw-02',  label:'DIST-SW-BETA',      type:'switch', status:'warning',
      x: 32, y: 17, z: -12,
      lat:51.5350, lon:9.3800, floor:'SOHLE 1' },
    { id:'dist-sw-03',  label:'DIST-SW-GAMMA',     type:'switch', status:'ok',
      x:  0, y: 17, z:  35,
      lat:51.4900, lon:9.3900, floor:'SOHLE 1' },

    // ── SOHLE 2  – Core + Hosts (Stern) ───────────────────
    { id:'core-sw-s2',  label:'CORE-SW-SOHLE2',   type:'switch', status:'ok',
      x:  0, y:-18, z:  0,
      lat:51.5062, lon:9.3327, floor:'SOHLE 2' },
    { id:'web-01',      label:'web-server-01',     type:'host',   status:'ok',
      x:-38, y:-18, z:-22,
      lat:51.4400, lon:9.1500, floor:'SOHLE 2' },
    { id:'web-02',      label:'web-server-02',     type:'host',   status:'critical',
      x:-18, y:-18, z:-32,
      lat:51.4300, lon:9.1800, floor:'SOHLE 2' },
    { id:'db-primary',  label:'db-primary',        type:'host',   status:'ok',
      x: 18, y:-18, z:-32,
      lat:51.5650, lon:9.4700, floor:'SOHLE 2' },
    { id:'db-replica',  label:'db-replica',        type:'host',   status:'warning',
      x: 38, y:-18, z:-22,
      lat:51.5700, lon:9.4900, floor:'SOHLE 2' },

    // ── SOHLE 3  – Core + Hosts (Stern) ───────────────────
    { id:'core-sw-s3',  label:'CORE-SW-SOHLE3',   type:'switch', status:'ok',
      x:  0, y:-52, z:  0,
      lat:51.5062, lon:9.3327, floor:'SOHLE 3' },
    { id:'mon-01',      label:'monitoring-01',     type:'host',   status:'ok',
      x: -8, y:-52, z: 36,
      lat:51.4550, lon:9.2100, floor:'SOHLE 3' },
    { id:'fw-01',       label:'firewall-01',       type:'host',   status:'down',
      x: 30, y:-52, z: 22,
      lat:51.4450, lon:9.2300, floor:'SOHLE 3' },
    { id:'backup-01',   label:'backup-srv-01',     type:'host',   status:'ok',
      x:-32, y:-52, z:  8,
      lat:51.5500, lon:9.4450, floor:'SOHLE 3' },
    { id:'ldap-01',     label:'ldap-server',       type:'host',   status:'unknown',
      x: 28, y:-52, z:-20,
      lat:51.5400, lon:9.4200, floor:'SOHLE 3' },

    // ── AccessPoints (WLAN Heatmap) ────────────────────────
    { id:'ap-ot-01', label:'AP-ÜBERTAGE-01', type:'accesspoint', status:'ok',
      wifiDbm: -45,
      x: -20, y: 52, z: 18,
      lat:51.5040, lon:9.3290, floor:'ÜBERTAGE' },
    { id:'ap-ot-02', label:'AP-ÜBERTAGE-02', type:'accesspoint', status:'warning',
      wifiDbm: -62,
      x:  22, y: 52, z: -15,
      lat:51.5080, lon:9.3370, floor:'ÜBERTAGE' },
    { id:'ap-s1-01', label:'AP-SOHLE1-01',  type:'accesspoint', status:'ok',
      wifiDbm: -38,
      x: -40, y: 17, z: 20,
      lat:51.4720, lon:9.2850, floor:'SOHLE 1' },
    { id:'ap-s1-02', label:'AP-SOHLE1-02',  type:'accesspoint', status:'critical',
      wifiDbm: -78,
      x:  35, y: 17, z: 15,
      lat:51.5380, lon:9.3850, floor:'SOHLE 1' },
  ],
  links: [
    // ── Backbone: ÜBERTAGE → SOHLE 1 → SOHLE 2 → SOHLE 3 (Schacht) ──
    { source:'core-sw-ot', target:'core-sw-s1', status:'ok'      },
    { source:'core-sw-s1', target:'core-sw-s2', status:'ok'      },
    { source:'core-sw-s2', target:'core-sw-s3', status:'warning' },

    // ── SOHLE 1: Stern vom Core zu Dist-Switches ──────────
    { source:'core-sw-s1', target:'dist-sw-01', status:'ok'      },
    { source:'core-sw-s1', target:'dist-sw-02', status:'warning' },
    { source:'core-sw-s1', target:'dist-sw-03', status:'ok'      },

    // ── SOHLE 2: Stern vom Core zu Hosts ──────────────────
    { source:'core-sw-s2', target:'web-01',     status:'ok'       },
    { source:'core-sw-s2', target:'web-02',     status:'critical' },
    { source:'core-sw-s2', target:'db-primary', status:'ok'       },
    { source:'core-sw-s2', target:'db-replica', status:'warning'  },

    // ── SOHLE 3: Stern vom Core zu Hosts ──────────────────
    { source:'core-sw-s3', target:'mon-01',     status:'ok'      },
    { source:'core-sw-s3', target:'fw-01',      status:'down'    },
    { source:'core-sw-s3', target:'backup-01',  status:'ok'      },
    { source:'core-sw-s3', target:'ldap-01',    status:'unknown' },
  ]
};

// ─────────────────────────────────────────────────────────────
//  NV2Map3D
// ─────────────────────────────────────────────────────────────
class NV2Map3D {
  constructor(data, initialModel) {
    this.data          = data;
    this.nodeObjects   = {};
    this.nodePositions = {};   // id → THREE.Vector3 (scene units)
    this.linkObjects   = [];
    this.tunnelObjects = [];
    this.alertObjs     = [];
    this.autoOrbit     = true;
    this.orbitRadius   = 90;   // Slider-gesteuert (30–250)
    this.flowSpeed     = 0.4;
    this._activeNode   = null;
    this._floorObjs    = [];
    this._floorPlates  = {};
    this._floorSceneWL = {};   // y → { W, L }
    this._bgMeshes     = {};
    this._bgMats       = {};
    this._mode2D       = false;
    this._floor2DY     = null;
    // ── New feature state ──
    this._pulseRings   = [];   // expanding alert rings
    this._searchRings  = [];   // highlight rings for search
    this._wifiMeshes   = {};   // id → heatmap mesh for APs
    this._cockpitMode  = false;
    this._prevStatus   = {};   // id → last known status (for pulse detection)

    this._model        = initialModel;
    this._activeFloors = buildFloors(initialModel);
    this._applyGeoLayout(data.nodes);   // enriches _activeFloors + fills nodePositions

    this._initScene();
    this._initLabels();
    this._buildNodes();
    this._buildLinks();
    this._buildFloors();
    this._buildFloorNav();
    this._setupUI();
    this._animate();
    this._log('Scene ready · ' + data.nodes.length + ' nodes');
  }

  // ── Geo layout ────────────────────────────────────────────
  // Uses lat/lon if nodes have them AND the model has a reference centre.
  // Falls back to static x/y/z otherwise.

  _applyGeoLayout(nodes) {
    const cfg = this._model;
    // Geo-Projektion nur für Modelle mit explizitem floors[]-Array
    // UND wenn mindestens ein Node ein passendes Floor-Label hat
    const hasGeo = cfg.lat && cfg.lon && Array.isArray(cfg.floors) &&
      nodes.some(n => n.lat != null && cfg.floors.some(f => f.label === n.floor));

    if (hasGeo) {
      const { floors, nodePos } = computeGeoLayout(nodes, this._activeFloors, cfg);
      this._activeFloors = floors;
      nodes.forEach(n => {
        const p = nodePos[n.id] ?? { x: 0, y: 0, z: 0 };
        this.nodePositions[n.id] = new THREE.Vector3(p.x, p.y, p.z);
      });
    } else {
      nodes.forEach(n => {
        this.nodePositions[n.id] = new THREE.Vector3(n.x ?? 0, n.y ?? 0, n.z ?? 0);
      });
    }
  }

  // ── Load / switch model ────────────────────────────────────

  async loadModel(cfg) {
    // ── Fetch external data (cached after first load) ──────
    const overlay = document.getElementById('load-overlay');
    if (overlay) overlay.style.display = 'flex';
    let data;
    try {
      data = await ModelManager.fetchData(cfg);
    } catch (err) {
      this._log(`Fehler beim Laden: ${err.message}`);
      console.error(err);
      if (overlay) overlay.style.display = 'none';
      return;
    }

    if (this._mode2D) this.exit2D();
    this.data          = data;
    this._model        = cfg;
    this._activeFloors = buildFloors(cfg);
    this.nodePositions = {};
    this._applyGeoLayout(this.data.nodes);

    // Clear search / pulse / wifi state
    this._clearSearch(false);
    this._pulseRings.forEach(r => { this.scene.remove(r.mesh); r.mesh.geometry.dispose(); r.mesh.material.dispose(); });
    this._pulseRings = [];
    Object.values(this._wifiMeshes).forEach(m => { this.scene.remove(m); m.geometry.dispose(); m.material.dispose(); });
    this._wifiMeshes = {};
    this._prevStatus = {};
    if (this._cockpitMode) this.toggleCockpit();   // exit cockpit on model switch

    // Rebuild node/link scene objects with new positions
    Object.values(this.nodeObjects).forEach(g => { disposeCSS2D(g); this.scene.remove(g); });
    this.linkObjects.forEach(({ line, spark }) => {
      this.scene.remove(line); this.scene.remove(spark);
    });
    this.tunnelObjects.forEach(({ tube, glow, spark }) => {
      this.scene.remove(tube); this.scene.remove(glow); this.scene.remove(spark);
      tube.geometry.dispose(); glow.geometry.dispose();
    });
    this.nodeObjects   = {};
    this.linkObjects   = [];
    this.tunnelObjects = [];
    this.alertObjs     = [];
    this._buildNodes();
    this._buildLinks();
    this._buildFloors();
    this._buildFloorNav();

    const nameEl = document.getElementById('btn-model-name');
    if (nameEl) nameEl.textContent = cfg.name;

    history.replaceState(null, '', '#' + cfg.id);
    this._log(`Model: ${cfg.name} · ${data.nodes.length} Nodes`);
    window.problemList?.update(this.data.nodes);
    window.mapOverlay?.update();   // aktiven Marker auf der OSM-Karte neu setzen
    if (overlay) overlay.style.display = 'none';
  }

  // ── Scene ──────────────────────────────────────────────────

  _initScene() {
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x080a0e, 0.003);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(devicePixelRatio);
    this.renderer.setSize(innerWidth, innerHeight);
    document.getElementById('canvas-wrap').appendChild(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(52, innerWidth / innerHeight, 0.1, 1500);
    this.camera.position.set(130, 80, 130);

    this.scene.add(new THREE.AmbientLight(0xffffff, 0.28));
    const sun = new THREE.DirectionalLight(0xffffff, 0.55);
    sun.position.set(60, 100, 40);
    this.scene.add(sun);
    this._accentLight = new THREE.PointLight(0x3060aa, 1.8, 280);
    this._accentLight.position.set(0, 55, 0);
    this.scene.add(this._accentLight);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.07;
    this.controls.minDistance   = 5;
    this.controls.maxDistance   = 900;

    this.renderer.domElement.addEventListener('pointerdown', () => {
      if (this.autoOrbit) this._setAutoOrbit(false);
    });

    window.addEventListener('resize', () => {
      this.camera.aspect = innerWidth / innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(innerWidth, innerHeight);
      this.labelRenderer.setSize(innerWidth, innerHeight);
    });
  }

  _initLabels() {
    this.labelRenderer = new CSS2DRenderer();
    this.labelRenderer.setSize(innerWidth, innerHeight);
    Object.assign(this.labelRenderer.domElement.style, {
      position:'absolute', top:'0', left:'0', pointerEvents:'none', zIndex:'2'
    });
    document.getElementById('canvas-wrap').appendChild(this.labelRenderer.domElement);
  }

  // ── Floor texture ──────────────────────────────────────────

  _genFloorTexture(fc, idx, total) {
    const sz = 512, cv = document.createElement('canvas');
    cv.width = cv.height = sz;
    const ctx = cv.getContext('2d');
    const [r,g,b] = fc.accent;
    const ac = (a) => `rgba(${r},${g},${b},${a})`;

    ctx.fillStyle = '#030608';
    ctx.fillRect(0, 0, sz, sz);

    // Dot grid
    ctx.fillStyle = ac(0.13);
    for (let i = 32; i < sz; i += 32)
      for (let j = 32; j < sz; j += 32)
        ctx.fillRect(i-1, j-1, 2, 2);

    // Outer frame + corners
    ctx.strokeStyle = ac(0.45); ctx.lineWidth = 2;
    ctx.strokeRect(18, 18, sz-36, sz-36);
    ctx.lineWidth = 1; ctx.strokeStyle = ac(0.7);
    [[18,18,1,1],[494,18,-1,1],[18,494,1,-1],[494,494,-1,-1]].forEach(([cx,cy,sx,sy]) => {
      ctx.beginPath();
      ctx.moveTo(cx+sx*24, cy); ctx.lineTo(cx,cy); ctx.lineTo(cx,cy+sy*24); ctx.stroke();
    });

    // Room plan outlines
    const plans = [
      [[60,60,200,160],[295,60,155,155],[60,260,390,160]],
      [[60,60,390,110],[60,210,175,205],[270,210,180,205]],
      [[60,60,135,135],[235,60,215,135],[60,240,390,210]],
      [[145,145,222,222]],
    ];
    ctx.strokeStyle = ac(0.22); ctx.lineWidth = 1.5;
    plans[idx % plans.length].forEach(([x,y,w,h]) => ctx.strokeRect(x,y,w,h));

    // Level dots
    for (let i = 0; i < total; i++) {
      ctx.beginPath(); ctx.fillStyle = i === idx ? ac(0.85) : ac(0.18);
      ctx.arc(38 + i*16, 487, i === idx ? 5 : 3, 0, Math.PI*2); ctx.fill();
    }

    // Watermarks
    ctx.fillStyle = ac(0.055); ctx.font = 'bold 66px monospace'; ctx.textAlign = 'center';
    ctx.fillText(fc.label, sz/2, 285);
    if (fc.widthM && fc.lengthM) {
      ctx.fillStyle = ac(0.05); ctx.font = 'italic 17px monospace';
      ctx.fillText(`${fmtM(fc.widthM)} × ${fmtM(fc.lengthM)}`, sz/2, 318);
    }

    // Header text
    ctx.fillStyle = ac(0.70); ctx.font = 'bold 15px monospace'; ctx.textAlign = 'left';
    ctx.fillText(fc.label, 32, 43);
    ctx.fillStyle = ac(0.40); ctx.font = '11px monospace';
    ctx.fillText(fc.sub, 32, 60);
    if (fc.widthM && fc.lengthM) {
      ctx.fillStyle = ac(0.25); ctx.font = '10px monospace';
      ctx.fillText(`${fmtM(fc.widthM)} × ${fmtM(fc.lengthM)}`, 32, 76);
    }

    return new THREE.CanvasTexture(cv);
  }

  // ── WLAN heatmap texture (radial gradient per AP status) ──

  _genWifiTexture(status) {
    const sz = 256, cv = document.createElement('canvas');
    cv.width = cv.height = sz;
    const ctx = cv.getContext('2d');
    const pal = { ok:[39,174,96], warning:[230,126,34], critical:[231,76,60], down:[192,57,43] };
    const [r,g,b] = pal[status] ?? pal.ok;
    const grd = ctx.createRadialGradient(sz/2,sz/2, 0, sz/2,sz/2, sz/2);
    grd.addColorStop(0,    `rgba(${r},${g},${b},0.50)`);
    grd.addColorStop(0.35, `rgba(${r},${g},${b},0.28)`);
    grd.addColorStop(0.70, `rgba(${r},${g},${b},0.10)`);
    grd.addColorStop(1,    `rgba(${r},${g},${b},0)`);
    // Concentric signal rings
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, sz, sz);
    ctx.strokeStyle = `rgba(${r},${g},${b},0.18)`;
    ctx.lineWidth = 1.5;
    [0.30, 0.55, 0.80].forEach(frac => {
      ctx.beginPath();
      ctx.arc(sz/2, sz/2, sz/2 * frac, 0, Math.PI*2);
      ctx.stroke();
    });
    return new THREE.CanvasTexture(cv);
  }

  // ── dBm → scene-unit radius  (-30 dBm strong → 48u, -90 dBm weak → 8u) ──

  _dbmToRadius(dbm) {
    const clamped = Math.max(-90, Math.min(-30, dbm ?? -65));
    // linear map: -30→48, -90→8
    return 8 + (clamped - (-90)) / 60 * 40;
  }

  // ── WLAN heatmap plane (placed on the nearest floor) ──────

  _buildWifiHeatmap(node, pos) {
    const radius = node.wifiDbm != null ? this._dbmToRadius(node.wifiDbm) : (node.wifiRadius ?? 22);
    const tex    = this._genWifiTexture(node.status);
    const mat    = new THREE.MeshBasicMaterial({
      map: tex, transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    });
    const geo  = new THREE.CircleGeometry(radius, 64);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = -Math.PI / 2;
    const floorY = this._activeFloors.length
      ? this._activeFloors.reduce((best, f) =>
          Math.abs(f.y - pos.y) < Math.abs(best - pos.y) ? f.y : best,
          this._activeFloors[0].y)
      : pos.y;
    mesh.position.set(pos.x, floorY + 0.25, pos.z);
    this.scene.add(mesh);
    this._wifiMeshes[node.id] = mesh;
  }

  // ── Build floors ───────────────────────────────────────────

  _buildFloors() {
    this._floorObjs.forEach(o => { disposeCSS2D(o); this.scene.remove(o); });
    this._floorObjs    = [];
    this._floorPlates  = {};
    this._floorSceneWL = {};

    if (this._model.type === 'datacenter') { this._buildDCLayout(); return; }

    // Normalise: largest floor → SCENE_MAX units
    const allW   = this._activeFloors.map(f => f.widthM  ?? 110);
    const allL   = this._activeFloors.map(f => f.lengthM ?? 110);
    const maxDim = Math.max(...allW, ...allL);
    const scale  = SCENE_MAX / maxDim;
    const total  = this._activeFloors.length;

    this._activeFloors.forEach((fc, idx) => {
      const W = (fc.widthM  ?? 110) * scale;
      const L = (fc.lengthM ?? 110) * scale;
      this._floorSceneWL[fc.y] = { W, L };

      const tex = this._genFloorTexture(fc, idx, total);
      const mat = new THREE.MeshBasicMaterial({
        map: tex, transparent: true, opacity: 0.72, side: THREE.DoubleSide
      });
      this._floorPlates[fc.y] = mat;

      const plate = new THREE.Mesh(new THREE.PlaneGeometry(W, L), mat);
      plate.rotation.x = -Math.PI / 2;
      plate.position.y = fc.y - 0.05;
      plate.userData.floorY = fc.y;
      this.scene.add(plate);
      this._floorObjs.push(plate);

      const edges = new THREE.LineSegments(
        new THREE.EdgesGeometry(new THREE.PlaneGeometry(W, L)),
        new THREE.LineBasicMaterial({
          color: new THREE.Color(...fc.accent.map(v=>v/255)),
          transparent: true, opacity: 0.3
        })
      );
      edges.rotation.x = -Math.PI / 2;
      edges.position.y = fc.y;
      edges.userData.floorY = fc.y;
      this.scene.add(edges);
      this._floorObjs.push(edges);

      // CSS2D label
      const div = document.createElement('div');
      div.className = 'node-label floor-label';
      const [r,g,b_] = fc.accent;
      div.style.cssText = `color:rgba(${r},${g},${b_},.7);border-color:rgba(${r},${g},${b_},.2)`;
      div.innerHTML = `<b>${fc.label}</b>` +
        (fc.widthM ? `<br><span style="opacity:.5;font-size:8px">${fmtM(fc.widthM)} × ${fmtM(fc.lengthM)}</span>` : '');

      const lbl = new CSS2DObject(div);
      lbl.position.set(-(W/2 + 6), fc.y + 0.5, 0);
      lbl.userData.floorY = fc.y;
      this.scene.add(lbl);
      this._floorObjs.push(lbl);
    });
  }

  // ── Datacenter layout: Bodenplatte + Rack-Rahmen ───────────

  _buildDCLayout() {
    const cfg    = this._model;
    const W      = (cfg.width  ?? 20) * 2;   // Szeneneinheiten (1 u = 0.5 m)
    const L      = (cfg.length ?? 10) * 2;
    const rows   = cfg.rows       ?? 3;
    const rpRow  = cfg.racksPerRow ?? 5;
    const rackH  = 8;    // 42 HE = 8 Szeneneinheiten
    const rackW  = 1.4;
    const rackD  = 0.8;

    // Bodenplatte (Doppelboden)
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(W, L),
      new THREE.MeshBasicMaterial({ color:0x0b1018, transparent:true, opacity:0.92, side:THREE.DoubleSide })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.1;
    this.scene.add(floor); this._floorObjs.push(floor);

    // Raster (Doppelbodenfliesen 0.6 m = 1.2 u)
    const tileSize = 1.2;
    const gridMat  = new THREE.LineBasicMaterial({ color:0x1c3a50, transparent:true, opacity:0.30 });
    for (let x = -W/2; x <= W/2 + 0.01; x += tileSize) {
      const l = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(x,0,-L/2), new THREE.Vector3(x,0,L/2)]),
        gridMat);
      this.scene.add(l); this._floorObjs.push(l);
    }
    for (let z = -L/2; z <= L/2 + 0.01; z += tileSize) {
      const l = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-W/2,0,z), new THREE.Vector3(W/2,0,z)]),
        gridMat);
      this.scene.add(l); this._floorObjs.push(l);
    }

    // Rack-Rahmen pro Reihe × Rack
    const rowColors = [[0,180,220],[19,211,142],[200,120,50]];
    for (let ri = 0; ri < rows; ri++) {
      const rz = -L/2 + (ri + 1) * L / (rows + 1);
      const [r,g,b] = rowColors[ri % rowColors.length];
      const edgeMat = new THREE.LineBasicMaterial({
        color: new THREE.Color(r/255, g/255, b/255), transparent:true, opacity:0.55 });
      const heMat = new THREE.LineBasicMaterial({
        color: new THREE.Color(r/255, g/255, b/255), transparent:true, opacity:0.14 });

      for (let xi = 0; xi < rpRow; xi++) {
        const rx = -W/2 + (xi + 1) * W / (rpRow + 1);

        // Rack-Rahmen (EdgesGeometry des Rack-Box)
        const rack = new THREE.LineSegments(
          new THREE.EdgesGeometry(new THREE.BoxGeometry(rackW, rackH, rackD)),
          edgeMat);
        rack.position.set(rx, rackH / 2, rz);
        this.scene.add(rack); this._floorObjs.push(rack);

        // HE-Markierungslinien (alle 7 HE)
        for (let u = 7; u < 42; u += 7) {
          const uy = (u / 42) * rackH;
          const shelf = new THREE.Line(
            new THREE.BufferGeometry().setFromPoints([
              new THREE.Vector3(rx - rackW/2, uy, rz - rackD/2),
              new THREE.Vector3(rx + rackW/2, uy, rz - rackD/2),
            ]), heMat);
          this.scene.add(shelf); this._floorObjs.push(shelf);
        }
      }

      // Reihen-Label
      const rowName = String.fromCharCode(65 + ri);
      const div = document.createElement('div');
      div.className = 'node-label floor-label';
      div.style.cssText = `color:rgba(${r},${g},${b},.65);border-color:rgba(${r},${g},${b},.2)`;
      div.innerHTML = `<b>Reihe ${rowName}</b>`;
      const lbl = new CSS2DObject(div);
      lbl.position.set(-W/2 - 3, rackH / 2, rz);
      this.scene.add(lbl); this._floorObjs.push(lbl);
    }
  }

  // ── Floor nav panel ────────────────────────────────────────

  _buildFloorNav() {
    const panel = document.getElementById('floor-panel');
    panel.innerHTML = '';

    if (this._model.type === 'datacenter') {
      const rows      = this._model.rows ?? 3;
      const rowColors = [[0,180,220],[19,211,142],[200,120,50],[200,120,180],[180,160,40]];
      const L         = (this._model.length ?? 10) * 2;

      ['A','B','C','D','E'].slice(0, rows).forEach((name, i) => {
        const [r,g,b] = rowColors[i % rowColors.length];
        const rz      = -L/2 + (i + 1) * L / (rows + 1);

        // Racks dieser Reihe aus Node-Daten (room = "Rack X*")
        const reiheNodes = this.data.nodes.filter(n => n.room?.startsWith(`Rack ${name}`));
        const rackMap    = new Map();
        reiheNodes.forEach(n => {
          if (!rackMap.has(n.room)) rackMap.set(n.room, []);
          rackMap.get(n.room).push(n);
        });

        // Schlechtester Status der Reihe
        const worstSev = reiheNodes.reduce((m, n) => Math.max(m, S(n.status).sev), 0);
        const worstCfg = Object.values(SC).find(c => c.sev === worstSev) ?? SC.unknown;
        const badgeHex = '#' + worstCfg.hex.toString(16).padStart(6, '0');

        const section = document.createElement('div');
        section.className = 'floor-section';

        const row = document.createElement('div');
        row.className = 'floor-row';

        const btn = document.createElement('button');
        btn.className = 'floor-btn';
        btn.innerHTML =
          `<span class="fb-label">Reihe ${name}</span>` +
          `<span class="fb-dim">${rackMap.size} Racks</span>` +
          `<span class="fb-dot" style="background:rgba(${r},${g},${b},.7);box-shadow:0 0 5px rgba(${r},${g},${b},.5)"></span>`;
        btn.onclick = () => {
          this._setAutoOrbit(false);
          this.camera.position.set(0, 12, rz + 28);
          this.controls.target.set(0, 4, rz);
          this.controls.update();
        };
        row.appendChild(btn);

        if (rackMap.size > 0) {
          const rackList = document.createElement('div');
          rackList.className = 'floor-node-list';

          rackMap.forEach((nodes, rackName) => {
            const rWorstSev = nodes.reduce((m, n) => Math.max(m, S(n.status).sev), 0);
            const rCfg      = Object.values(SC).find(c => c.sev === rWorstSev) ?? SC.unknown;
            const rHex      = '#' + rCfg.hex.toString(16).padStart(6, '0');

            // Rack-Mittelpunkt
            const poses = nodes.map(n => this.nodePositions[n.id]).filter(Boolean);
            const cx = poses.reduce((s, p) => s + p.x, 0) / (poses.length || 1);
            const cz = poses.reduce((s, p) => s + p.z, 0) / (poses.length || 1);

            const pill = document.createElement('button');
            pill.className = 'floor-node-pill';
            pill.title = nodes.map(n => n.label).join(', ');
            pill.innerHTML =
              `<span class="fnp-dot" style="background:${rHex};box-shadow:0 0 4px ${rHex}88"></span>` +
              `<span class="fnp-name">${rackName}</span>` +
              `<span class="fnp-type">${nodes.length}</span>`;
            pill.onclick = () => {
              this._setAutoOrbit(false);
              this.camera.position.set(cx + 8, 14, cz + 16);
              this.controls.target.set(cx, 4, cz);
              this.controls.update();
            };
            rackList.appendChild(pill);
          });

          const expandBtn = document.createElement('button');
          expandBtn.className = 'floor-expand-btn';
          expandBtn.title = `${rackMap.size} Racks in Reihe ${name}`;
          expandBtn.innerHTML =
            `<span class="feb-count" style="color:${badgeHex}">${rackMap.size}</span>` +
            `<span class="feb-arrow">▸</span>`;
          expandBtn.onclick = () => {
            const open = rackList.classList.toggle('open');
            expandBtn.classList.toggle('open', open);
          };

          row.appendChild(expandBtn);
          section.appendChild(row);
          section.appendChild(rackList);
        } else {
          section.appendChild(row);
        }

        panel.appendChild(section);
      });
      return;
    }

    [...this._activeFloors].sort((a,b) => b.y - a.y).forEach(fc => {
      const [r,g,b_] = fc.accent;

      // Räume auf dieser Etage (nur Nodes mit room-Feld)
      const floorNodes = this.data.nodes.filter(n => n.floor === fc.label && n.room);

      // Räume gruppieren: roomName → { nodes[], worstSev, center }
      const roomMap = new Map();
      floorNodes.forEach(node => {
        if (!roomMap.has(node.room)) roomMap.set(node.room, []);
        roomMap.get(node.room).push(node);
      });

      // Schlechtester Status über alle Räume → Badge-Farbe
      const worstSev = floorNodes.reduce((m, n) => Math.max(m, S(n.status).sev), 0);
      const worstCfg = Object.values(SC).find(c => c.sev === worstSev) ?? SC.unknown;
      const badgeHex = '#' + worstCfg.hex.toString(16).padStart(6, '0');

      // ── Sektion: Row + ausklappbare Raum-Liste ─────────────
      const section = document.createElement('div');
      section.className = 'floor-section';

      const row = document.createElement('div');
      row.className = 'floor-row'; row.id = `floor-row-${fc.y}`;

      const btn = document.createElement('button');
      btn.className = 'floor-btn';
      btn.title = fc.sub + (fc.widthM ? ` · ${fmtM(fc.widthM)} × ${fmtM(fc.lengthM)}` : '');
      btn.innerHTML =
        `<span class="fb-label">${fc.label}</span>` +
        (fc.widthM ? `<span class="fb-dim">${fmtM(fc.widthM)} × ${fmtM(fc.lengthM)}</span>` : '') +
        `<span class="fb-dot" style="background:rgba(${r},${g},${b_},.7);box-shadow:0 0 5px rgba(${r},${g},${b_},.5)"></span>`;
      btn.onclick = () => this.flyToFloor(fc.y);

      const btn2d = document.createElement('button');
      btn2d.className = 'floor-2d-btn'; btn2d.id = `btn2d-${fc.y}`;
      btn2d.textContent = '2D';
      btn2d.onclick = () => {
        if (this._mode2D && this._floor2DY === fc.y) this.exit2D();
        else this.enter2D(fc.y);
      };

      row.appendChild(btn); row.appendChild(btn2d);

      // Raum-Badge + Expand — nur wenn Räume vorhanden
      if (roomMap.size > 0) {
        const roomList = document.createElement('div');
        roomList.className = 'floor-node-list';

        roomMap.forEach((nodes, roomName) => {
          const roomWorstSev = nodes.reduce((m, n) => Math.max(m, S(n.status).sev), 0);
          const roomCfg      = Object.values(SC).find(c => c.sev === roomWorstSev) ?? SC.unknown;
          const roomHex      = '#' + roomCfg.hex.toString(16).padStart(6, '0');

          // Raum-Mittelpunkt aus Node-Positionen
          const center = nodes.reduce((acc, n) => {
            const p = this.nodePositions[n.id];
            return p ? { x: acc.x + p.x, y: acc.y + p.y, z: acc.z + p.z } : acc;
          }, { x: 0, y: 0, z: 0 });
          const cnt = nodes.filter(n => this.nodePositions[n.id]).length || 1;
          const cx = center.x / cnt, cy = center.y / cnt, cz = center.z / cnt;

          const pill = document.createElement('button');
          pill.className = 'floor-node-pill';
          pill.title = nodes.map(n => n.label).join(', ');
          pill.innerHTML =
            `<span class="fnp-dot" style="background:${roomHex};box-shadow:0 0 4px ${roomHex}88"></span>` +
            `<span class="fnp-name">${roomName}</span>` +
            `<span class="fnp-type">${nodes.length}</span>`;
          pill.onclick = () => {
            this._setAutoOrbit(false);
            this.camera.position.set(cx + 40, cy + 30, cz + 40);
            this.controls.target.set(cx, cy, cz);
            this.controls.update();
          };
          roomList.appendChild(pill);
        });

        const expandBtn = document.createElement('button');
        expandBtn.className = 'floor-expand-btn';
        expandBtn.title = `${roomMap.size} Räume auf ${fc.label}`;
        expandBtn.innerHTML =
          `<span class="feb-count" style="color:${badgeHex}">${roomMap.size}</span>` +
          `<span class="feb-arrow">▸</span>`;
        expandBtn.onclick = () => {
          const open = roomList.classList.toggle('open');
          expandBtn.classList.toggle('open', open);
        };

        row.appendChild(expandBtn);
        section.appendChild(row);
        section.appendChild(roomList);
      } else {
        section.appendChild(row);
      }

      panel.appendChild(section);
    });
  }

  // ── 2D Mode ────────────────────────────────────────────────

  enter2D(floorY) {
    this._mode2D = true; this._floor2DY = floorY;
    this._setAutoOrbit(false);

    const fc = this._activeFloors.find(f => f.y === floorY);
    const { W = 110 } = this._floorSceneWL[floorY] ?? {};

    this.controls.target.set(0, floorY, 0);
    this.camera.position.set(0, floorY + W * 0.85, 0.01);
    this.controls.minPolarAngle = 0;
    this.controls.maxPolarAngle = 0.001;
    this.controls.enableRotate  = false;
    this.controls.update();

    this._applyFloorVisibility(floorY);
    if (this._floorPlates[floorY])
      this._floorPlates[floorY].opacity = parseFloat(document.getElementById('floor-opacity').value) / 100;
    // Heatmaps in 2D stark abdunkeln, damit Nodes erkennbar bleiben
    Object.values(this._wifiMeshes).forEach(m => { m.material.opacity = 0.22; });

    document.getElementById('view-badge').classList.add('active');
    document.getElementById('vb-floor-name').textContent = fc?.label ?? floorY;
    document.getElementById('panel-2d').classList.add('visible');
    document.getElementById('ctrl-hint').textContent = '🖱 Schieben: Rechte Taste / Mitteltaste · Rad: Zoom';
    document.getElementById('ctrl-hint').classList.remove('hidden');

    document.querySelectorAll('.floor-2d-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(`btn2d-${floorY}`)?.classList.add('active');
    document.querySelectorAll('.floor-btn').forEach(b => b.classList.remove('is-2d'));
    document.getElementById(`floor-row-${floorY}`)?.querySelector('.floor-btn')?.classList.add('is-2d');

    this._log(`2D · ${fc?.label}` + (fc?.widthM ? ` · ${fmtM(fc.widthM)} × ${fmtM(fc.lengthM)}` : ''));
  }

  exit2D() {
    this._mode2D = false; this._floor2DY = null;
    this.controls.minPolarAngle = 0;
    this.controls.maxPolarAngle = Math.PI;
    this.controls.enableRotate  = true;
    this._showAll();
    Object.values(this._floorPlates).forEach(m => m.opacity = 0.72);
    Object.values(this._wifiMeshes).forEach(m => { m.material.opacity = 1.0; });
    document.getElementById('view-badge').classList.remove('active');
    document.getElementById('panel-2d').classList.remove('visible');
    document.getElementById('ctrl-hint').textContent = '🖱 Drehen · Rechte Taste: Schieben · Rad: Zoom';
    document.getElementById('ctrl-hint').classList.remove('hidden');
    setTimeout(() => document.getElementById('ctrl-hint').classList.add('hidden'), 3000);
    document.querySelectorAll('.floor-2d-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.floor-btn').forEach(b => b.classList.remove('is-2d'));
    this._log('← 3D');
  }

  _applyFloorVisibility(activeY) {
    this._floorObjs.forEach(o => { o.visible = o.userData.floorY === activeY; });
    Object.values(this.nodeObjects).forEach(g => { g.visible = Math.abs(g.position.y - activeY) < 8; });
    this.linkObjects.forEach(({ line, spark, srcY, tgtY }) => {
      const show = Math.abs(srcY - activeY) < 8 && Math.abs(tgtY - activeY) < 8;
      line.visible = show; spark.visible = show;
    });
    // Tunnel: sichtbar wenn mindestens ein Endpunkt auf dieser Etage liegt
    this.tunnelObjects.forEach(({ tube, glow, spark, srcY, tgtY }) => {
      const show = Math.abs(srcY - activeY) < 8 || Math.abs(tgtY - activeY) < 8;
      tube.visible = show; glow.visible = show; spark.visible = show;
    });
    Object.entries(this._bgMeshes).forEach(([y, mesh]) => {
      mesh.visible = parseFloat(y) === activeY;
    });
  }

  _showAll() {
    this._floorObjs.forEach(o => o.visible = true);
    Object.values(this.nodeObjects).forEach(g => g.visible = true);
    this.linkObjects.forEach(({ line, spark }) => { line.visible = true; spark.visible = true; });
    this.tunnelObjects.forEach(({ tube, glow, spark }) => { tube.visible = true; glow.visible = true; spark.visible = true; });
    Object.values(this._bgMeshes).forEach(m => m.visible = false);
  }

  // ── Background image ───────────────────────────────────────

  _onBgFileSelected(file) {
    if (!file || !this._mode2D) return;
    const y = this._floor2DY;
    const { W = 110, L = 110 } = this._floorSceneWL[y] ?? {};
    if (this._bgMeshes[y]) this.scene.remove(this._bgMeshes[y]);
    new THREE.TextureLoader().load(URL.createObjectURL(file), tex => {
      const mat = new THREE.MeshBasicMaterial({
        map: tex, transparent: true,
        opacity: parseFloat(document.getElementById('bg-opacity').value) / 100,
        side: THREE.DoubleSide
      });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(W, L), mat);
      mesh.rotation.x = -Math.PI / 2; mesh.position.y = y - 0.08;
      this.scene.add(mesh);
      this._bgMeshes[y] = mesh; this._bgMats[y] = mat;
      document.getElementById('bg-img-name').textContent = file.name;
      this._log(`Grundriss geladen: ${file.name}`);
    });
  }

  setBgOpacity(val)    { if (this._floor2DY !== null && this._bgMats[this._floor2DY])    this._bgMats[this._floor2DY].opacity = val; }
  setFloorOpacity(val) { if (this._floor2DY !== null && this._floorPlates[this._floor2DY]) this._floorPlates[this._floor2DY].opacity = val; }

  // ── Nodes ──────────────────────────────────────────────────

  _buildNodes() {
    this.data.nodes.forEach(node => {
      const pos   = this.nodePositions[node.id] ?? new THREE.Vector3(0, 0, 0);
      const group = this._createNodeMesh(node);
      group.position.copy(pos);
      this.scene.add(group);
      this.nodeObjects[node.id] = group;
      this._prevStatus[node.id] = node.status;
      if (node.type === 'accesspoint') this._buildWifiHeatmap(node, pos);
    });
  }

  _createNodeMesh(node) {
    const cfg = S(node.status), group = new THREE.Group();
    group.userData = { ...node };
    const mat = new THREE.MeshStandardMaterial({
      color: cfg.hex, emissive: cfg.emissive,
      emissiveIntensity: al(node.status) ? 0.55 : 0.2,
      roughness: 0.45, metalness: 0.55,
    });

    if (node.type === 'server') {
      // 1U-Server-Slab: breite flache Box (passend in Rack-Rahmen)
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.16, 0.55), mat);
      // Status-LED als kleiner Leuchtpunkt
      const led = new THREE.Mesh(
        new THREE.SphereGeometry(0.06, 6, 4),
        new THREE.MeshBasicMaterial({ color: cfg.hex })
      );
      led.position.set(0.38, 0.10, -0.22);
      group.add(mesh); group.add(led);
      if (al(node.status)) this.alertObjs.push(mesh);
    } else if (node.type === 'accesspoint') {
      // Disc body + antenna
      const body    = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.6, 0.55, 16), mat);
      const antenna = new THREE.Mesh(
        new THREE.CylinderGeometry(0.12, 0.12, 3.0, 6),
        new THREE.MeshStandardMaterial({ color:0x888899, metalness:0.85, roughness:0.15 })
      );
      antenna.position.y = 1.8;
      const tip = new THREE.Mesh(
        new THREE.SphereGeometry(0.22, 8, 6),
        new THREE.MeshBasicMaterial({ color: cfg.hex })
      );
      tip.position.y = 3.3;
      group.add(body); group.add(antenna); group.add(tip);
      if (al(node.status)) this.alertObjs.push(body);
    } else {
      const geo = node.type === 'switch'
        ? new THREE.BoxGeometry(5, 0.9, 3)
        : new THREE.SphereGeometry(2.3, 18, 14);
      const mesh = new THREE.Mesh(geo, mat);
      group.add(mesh);
      if (al(node.status)) this.alertObjs.push(mesh);
    }

    if (al(node.status) || node.status === 'warning')
      group.add(Object.assign(new THREE.PointLight(cfg.hex, 0.9, 22), {}));

    const div = document.createElement('div');
    div.className = node.linkedModel ? 'node-label node-label--portal' : 'node-label';
    div.textContent = node.linkedModel ? `⇒ ${node.label}` : node.label;
    const lbl = new CSS2DObject(div);
    lbl.position.set(0, node.type === 'server' ? 0.4 : node.type === 'switch' ? 2.2 : 3.8, 0);
    group.add(lbl);
    return group;
  }

  // ── Links ──────────────────────────────────────────────────

  _buildLinks() {
    if (this._model.type === 'datacenter') return;   // DC: Verbindungen werden nicht visualisiert
    const nodeMap = new Map(this.data.nodes.map(n => [n.id, n]));
    this.data.links.forEach(link => {
      const start = this.nodePositions[link.source];
      const end   = this.nodePositions[link.target];
      if (!start || !end) return;
      // Auto-Tunnel: beide Nodes unterirdisch (SOHLE) + Distanz > Schwellenwert
      const srcFloor = nodeMap.get(link.source)?.floor ?? '';
      const tgtFloor = nodeMap.get(link.target)?.floor ?? '';
      const bothUnderground = srcFloor.includes('SOHLE') && tgtFloor.includes('SOHLE');
      const isTunnel = link.tunnel || (bothUnderground && start.distanceTo(end) > TUNNEL_MIN_DIST);
      if (isTunnel) { this._buildTunnelLink(link, start, end); return; }
      const cfg = S(link.status), isAl = al(link.status);
      const op  = isAl ? 0.75 : link.status === 'warning' ? 0.38 : 0.18;

      const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([start.clone(), end.clone()]),
        new THREE.LineBasicMaterial({ color: cfg.hex, transparent: true, opacity: op })
      );
      this.scene.add(line);
      if (isAl) this.alertObjs.push(line);

      const spark = new THREE.Mesh(
        new THREE.SphereGeometry(0.38, 8, 6),
        new THREE.MeshBasicMaterial({ color: cfg.hex })
      );
      this.scene.add(spark);

      const srcNode = this.data.nodes.find(n => n.id === link.source);
      const tgtNode = this.data.nodes.find(n => n.id === link.target);
      this.linkObjects.push({
        line, spark,
        start: start.clone(), end: end.clone(),
        prog: Math.random(),
        srcY: srcNode ? (this.nodePositions[srcNode.id]?.y ?? 0) : 0,
        tgtY: tgtNode ? (this.nodePositions[tgtNode.id]?.y ?? 0) : 0,
      });
    });
  }

  // ── Tunnel link (Untertage Switch-Backbone) ────────────────
  //  TubeGeometry entlang einer leicht gebogenen Kurve +
  //  größere Glow-Shell (BackSide + AdditiveBlending) wie ein Stollen.

  _buildTunnelLink(link, start, end) {
    const cfg      = S(link.status);
    const isBuilding = this._model.type === 'building';
    const isDC       = this._model.type === 'datacenter';

    // Mine: Bogen nach unten,  Gebäude/DC: Bogen nach oben (Kabelkanal/Patchkabel)
    const mid = start.clone().lerp(end, 0.5);
    mid.y += isDC ? 1.5 : isBuilding ? +3 : -4;
    const curve = new THREE.CatmullRomCurve3([start.clone(), mid, end.clone()]);

    // Rohrmaße: Mine → dicker/heller,  Gebäude → dünn,  DC → sehr dünn (Patchkabel)
    const rInner  = isDC ? 0.10 : isBuilding ? 0.25 : 0.65;
    const rOuter  = isDC ? 0.55 : isBuilding ? 1.4  : 3.2;
    const opInner = isDC ? 0.75 : isBuilding ? 0.65 : 0.55;
    const opOuter = isDC ? 0.18 : isBuilding ? 0.13 : 0.10;

    // Inneres Rohr
    const tubeMat = new THREE.MeshBasicMaterial({
      color: cfg.hex, transparent: true, opacity: opInner, depthWrite: false,
    });
    const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 28, rInner, 8, false), tubeMat);
    this.scene.add(tube);

    // Äußere Glow-Shell
    const glowMat = new THREE.MeshBasicMaterial({
      color: cfg.hex, transparent: true, opacity: opOuter,
      blending: THREE.AdditiveBlending, side: THREE.BackSide, depthWrite: false,
    });
    const glow = new THREE.Mesh(new THREE.TubeGeometry(curve, 28, rOuter, 8, false), glowMat);
    this.scene.add(glow);

    // Spark – folgt der Kurve via getPoint(t)
    const spark = new THREE.Mesh(
      new THREE.SphereGeometry(0.6, 8, 6),
      new THREE.MeshBasicMaterial({ color: cfg.hex, blending: THREE.AdditiveBlending }),
    );
    this.scene.add(spark);

    const srcNode = this.data.nodes.find(n => n.id === link.source);
    const tgtNode = this.data.nodes.find(n => n.id === link.target);
    this.tunnelObjects.push({
      tube, glow, spark, curve,
      prog: Math.random(),
      srcY: srcNode ? start.y : 0,
      tgtY: tgtNode ? end.y   : 0,
    });
  }

  // ── Camera helpers ─────────────────────────────────────────

  flyToFloor(y) {
    if (this._mode2D) this.exit2D();
    this._setAutoOrbit(false);
    const t = Date.now() * 0.001;
    this.camera.position.set(Math.sin(t)*130, y+65, Math.cos(t)*130);
    this.controls.target.set(0, y, 0);
    this.controls.update();
  }

  /** Fly to a specific node and open its inspector.
   *
   *  Orbit-Target wird auf den Ebenenmittelpunkt (0, floorY, 0) gesetzt,
   *  nicht auf den Node selbst. Beim Herauszoomen bleibt die Szene
   *  damit korrekt zentriert und alle anderen Hosts bleiben am richtigen Platz.
   */
  focusNode(id) {
    if (this._mode2D) this.exit2D();
    this._setAutoOrbit(false);
    const pos = this.nodePositions[id];
    if (!pos) return;

    // Nächste Ebene zum Node finden → wird Orbit-Zentrum
    const floorY = this._activeFloors.length
      ? this._activeFloors.reduce((best, f) =>
          Math.abs(f.y - pos.y) < Math.abs(best - pos.y) ? f.y : best,
          this._activeFloors[0].y)
      : pos.y;

    this.controls.target.set(0, floorY, 0);

    // Kamera: über dem Node, auf der Linie Ebenenmitte → Node
    const horiz = new THREE.Vector3(pos.x, 0, pos.z);
    const hDist = horiz.length();
    const dir   = hDist > 0.5
      ? horiz.clone().normalize()
      : new THREE.Vector3(1, 0, 0);
    const camR  = Math.max(hDist + 30, 45);

    this.camera.position.set(dir.x * camR, floorY + 30, dir.z * camR);
    this.controls.update();

    const node = this.data.nodes.find(n => n.id === id);
    if (node) this.openInspector({ ...node });
  }

  focusActive() {
    if (!this._activeNode) return;
    this.focusNode(this._activeNode.id);
  }

  resetCam() {
    if (this._mode2D) this.exit2D();
    this._setAutoOrbit(true);
    this.camera.position.set(90, 50, 90);
    this.controls.target.set(0, 0, 0);
  }

  zoom(dir) {
    this._setAutoOrbit(false);
    const v = this.camera.position.clone().sub(this.controls.target).normalize();
    this.camera.position.addScaledVector(v, dir * -18);
    this.controls.update();
  }

  toggleOrbit() { this._setAutoOrbit(!this.autoOrbit); }
  _setAutoOrbit(on) {
    this.autoOrbit = on;
    document.getElementById('btn-orbit').classList.toggle('active', on);
  }

  // ── WS ─────────────────────────────────────────────────────

  updateNodeStatus(hosts) {
    hosts.forEach(h => {
      const group = this.nodeObjects[h.id];
      if (!group) return;
      const mesh = group.children.find(c => c.isMesh);
      if (!mesh) return;
      const cfg  = S(h.status);
      const prev = this._prevStatus[h.id];

      mesh.material.color.set(cfg.hex);
      mesh.material.emissive.set(cfg.emissive);
      mesh.material.emissiveIntensity = al(h.status) ? 0.55 : 0.2;
      group.userData.status = h.status;
      this._prevStatus[h.id] = h.status;

      // Pulse ring when transitioning TO critical / down
      if (al(h.status) && !al(prev ?? '')) {
        this._spawnPulseRing(group.position, cfg.hex);
      }

      // Update wifi heatmap texture
      if (this._wifiMeshes[h.id]) {
        this._wifiMeshes[h.id].material.map.dispose();
        this._wifiMeshes[h.id].material.map = this._genWifiTexture(h.status);
        this._wifiMeshes[h.id].material.needsUpdate = true;
      }

      if (this._activeNode?.id === h.id) {
        this._activeNode.status = h.status;
        this.openInspector(this._activeNode);
      }
    });
    // Keep cockpit visibility in sync
    if (this._cockpitMode) {
      hosts.forEach(h => {
        const g = this.nodeObjects[h.id];
        if (g) g.visible = al(h.status) || h.status === 'warning';
      });
    }
    window.problemList?.update(this.data.nodes.map(n => ({ ...n, status: this.nodeObjects[n.id]?.userData?.status ?? n.status })));
    this._log(`Status update · ${hosts.length} host(s)`);
  }

  connectWS(url) {
    this._log(`Connecting → ${url}`);
    const ws = new WebSocket(url);
    ws.onopen    = () => this._log('WS connected');
    ws.onclose   = () => this._log('WS disconnected');
    ws.onmessage = (e) => {
      try { const m = JSON.parse(e.data); if (m.type === 'status_update' && m.hosts) this.updateNodeStatus(m.hosts); } catch {}
    };
    this.ws = ws;
  }

  // ── Pulse rings ────────────────────────────────────────────

  _spawnPulseRing(pos, color) {
    for (let i = 0; i < 3; i++) {
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(2.8, 4.0, 40),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.75, side: THREE.DoubleSide, depthWrite: false })
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(pos.x, pos.y + 0.4, pos.z);
      this.scene.add(ring);
      this._pulseRings.push({ mesh: ring, t: i * 0.35, maxT: 1.4, maxScale: 5.5, baseOpacity: 0.75 });
    }
  }

  // ── Search & Highlight ─────────────────────────────────────

  search(q) {
    if (!q || !q.trim()) { this._clearSearch(true); return; }
    this._highlightSearch(q.trim().toLowerCase());
  }

  _highlightSearch(q) {
    this._clearSearch(false);
    let matches = 0;
    let firstMatchId = null;

    Object.entries(this.nodeObjects).forEach(([id, group]) => {
      const node    = this.data.nodes.find(n => n.id === id);
      const isMatch = node && (
        node.label.toLowerCase().includes(q) ||
        id.toLowerCase().includes(q) ||
        (node.floor ?? '').toLowerCase().includes(q) ||
        (node.type  ?? '').toLowerCase().includes(q)
      );
      const mesh    = group.children.find(c => c.isMesh);
      const labelEl = group.children.find(c => c.isCSS2DObject)?.element;

      if (isMatch) {
        matches++;
        if (!firstMatchId) firstMatchId = id;
        if (mesh) {
          mesh.material.emissiveIntensity = 0.9;
        }
        if (labelEl) { labelEl.style.opacity = '1'; labelEl.style.fontWeight = '700'; }

        // Blue highlight ring
        const ring = new THREE.Mesh(
          new THREE.RingGeometry(3.8, 5.0, 40),
          new THREE.MeshBasicMaterial({ color: 0x3b82f6, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false })
        );
        ring.rotation.x = -Math.PI / 2;
        ring.position.set(group.position.x, group.position.y + 0.5, group.position.z);
        this.scene.add(ring);
        this._searchRings.push(ring);
      } else {
        if (mesh) {
          const cfg = S(group.userData.status ?? node?.status ?? 'unknown');
          mesh.material.color.setHex(0x1a1e28);
          mesh.material.emissive.setHex(cfg.emissive);
          mesh.material.emissiveIntensity = 0.04;
        }
        if (labelEl) { labelEl.style.opacity = '0.12'; labelEl.style.fontWeight = ''; }
      }
    });

    const el = document.getElementById('search-count');
    if (el) el.textContent = matches ? `${matches}` : '–';

    if (matches === 1 && firstMatchId) this.focusNode(firstMatchId);
  }

  _clearSearch(restore = true) {
    this._searchRings.forEach(r => { this.scene.remove(r); r.geometry.dispose(); r.material.dispose(); });
    this._searchRings = [];
    const el = document.getElementById('search-count');
    if (el) el.textContent = '';
    if (!restore) return;
    Object.entries(this.nodeObjects).forEach(([id, group]) => {
      const node = this.data.nodes.find(n => n.id === id);
      if (!node) return;
      const cfg     = S(group.userData.status ?? node.status);
      const mesh    = group.children.find(c => c.isMesh);
      const labelEl = group.children.find(c => c.isCSS2DObject)?.element;
      if (mesh) {
        mesh.material.color.setHex(cfg.hex);
        mesh.material.emissive.setHex(cfg.emissive);
        mesh.material.emissiveIntensity = al(node.status) ? 0.55 : 0.2;
      }
      if (labelEl) { labelEl.style.opacity = ''; labelEl.style.fontWeight = ''; }
    });
  }

  clearSearch() { this._clearSearch(true); }

  // ── Cockpit mode ───────────────────────────────────────────

  toggleCockpit() {
    this._cockpitMode = !this._cockpitMode;
    document.getElementById('btn-cockpit')?.classList.toggle('active', this._cockpitMode);
    document.getElementById('cockpit-badge')?.classList.toggle('visible', this._cockpitMode);

    if (this._cockpitMode) {
      this.scene.background = new THREE.Color(0x0d0005);
      this.scene.fog        = new THREE.FogExp2(0x0d0005, 0.0018);
      this._accentLight.color.set(0x660000);
      this._setAutoOrbit(false);
    } else {
      this.scene.background = null;
      this.scene.fog        = new THREE.FogExp2(0x080a0e, 0.003);
      this._accentLight.color.set(0x3060aa);
    }

    Object.entries(this.nodeObjects).forEach(([id, group]) => {
      const status  = group.userData.status ?? this.data.nodes.find(n => n.id === id)?.status ?? 'unknown';
      const labelEl = group.children.find(c => c.isCSS2DObject)?.element;
      if (this._cockpitMode) {
        const show = al(status) || status === 'warning';
        group.visible = show;
        if (labelEl) labelEl.style.opacity = show ? (status === 'warning' ? '0.6' : '1') : '0';
      } else {
        group.visible = true;
        if (labelEl) { labelEl.style.opacity = ''; }
      }
    });

    // wifi meshes: hide in cockpit for cleaner look
    Object.values(this._wifiMeshes).forEach(m => { m.visible = !this._cockpitMode; });

    this._log(this._cockpitMode ? '⚡ Cockpit-Modus aktiv — nur Probleme' : '← Cockpit beendet');
  }

  // ── Inspector ──────────────────────────────────────────────

  openInspector(data) {
    this._activeNode = data;
    const cfg = S(data.status);
    const badge = document.getElementById('ins-badge');
    badge.className = `s-badge ${cfg.badge}`; badge.textContent = cfg.label;
    document.getElementById('ins-name').textContent = data.label;
    document.getElementById('ins-id').textContent   = `id: ${data.id}`;
    const pos = this.nodePositions[data.id];
    const geoLine = data.lat
      ? `<div class="m-row"><span>Koordinaten</span><b>${data.lat?.toFixed(4)}°N, ${data.lon?.toFixed(4)}°E</b></div>`
      : '';
    const dbmLine = data.wifiDbm != null
      ? `<div class="m-row"><span>WLAN-Signal</span><b>${data.wifiDbm} dBm · r≈${this._dbmToRadius(data.wifiDbm).toFixed(0)} u</b></div>`
      : '';
    document.getElementById('ins-body').innerHTML = `
      <div class="m-row"><span>Status</span><b class="${cfg.cls}">${cfg.label}</b></div>
      <div class="m-row"><span>Typ</span><b>${data.type}</b></div>
      <div class="m-row"><span>Ebene</span><b>${data.floor ?? '–'}</b></div>
      ${geoLine}
      ${dbmLine}
      ${pos ? `<div class="m-row"><span>Scene X/Y/Z</span><b>${pos.x.toFixed(1)} / ${pos.y.toFixed(1)} / ${pos.z.toFixed(1)}</b></div>` : ''}
    `;
    // Modell-Wechsel-Button für Portal-Nodes
    const foot = document.getElementById('ins-foot');
    const existingPortalBtn = foot.querySelector('.btn-portal');
    if (existingPortalBtn) existingPortalBtn.remove();
    if (data.linkedModel) {
      const target = ModelManager.getById(data.linkedModel);
      if (target) {
        const btn = document.createElement('button');
        btn.className = 'btn btn-portal';
        btn.style.cssText = 'flex:1;background:#0d2a3a;border-color:#13b0f5;color:#13b0f5';
        btn.textContent = `⇒ ${target.name}`;
        btn.onclick = () => { this.closeInspector(); this.loadModel(target); };
        foot.appendChild(btn);
      }
    }

    document.getElementById('inspector').classList.add('open');
    this._log(`Selected: ${data.label} [${cfg.label}]`);
  }

  closeInspector() {
    document.getElementById('inspector').classList.remove('open');
    this._activeNode = null;
  }

  // ── UI ─────────────────────────────────────────────────────

  _setupUI() {
    window.addEventListener('click', (e) => {
      if (e.target.closest('#inspector') || e.target.closest('.hud') ||
          e.target.closest('#floor-panel') || e.target.closest('#zoom-ctrl') ||
          e.target.closest('#panel-2d') || e.target.closest('#model-dialog') ||
          e.target.closest('#problem-panel')) return;
      const mouse = new THREE.Vector2((e.clientX/innerWidth)*2-1, -(e.clientY/innerHeight)*2+1);
      const ray   = new THREE.Raycaster();
      ray.setFromCamera(mouse, this.camera);
      const hits = ray.intersectObjects(this.scene.children, true);
      if (hits.length) {
        let obj = hits[0].object;
        while (obj.parent && !obj.userData.id) obj = obj.parent;
        if (obj.userData.id) this.openInspector(obj.userData);
      }
    });

    window.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        this.closeInspector();
        if (this._mode2D) this.exit2D();
        if (this._cockpitMode) this.toggleCockpit();
        const si = document.getElementById('search-input');
        if (si && si.value) { si.value = ''; this._clearSearch(true); }
      }
      // Ctrl+F / Cmd+F → focus search
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        document.getElementById('search-input')?.focus();
      }
      // M → OSM-Übersichtskarte togglen
      if (e.key === 'm' || e.key === 'M') {
        if (!e.ctrlKey && !e.metaKey && document.activeElement?.tagName !== 'INPUT') {
          window.mapOverlay?.toggle();
        }
      }
    });

    document.getElementById('flow-speed').oninput = (e) => { this.flowSpeed = e.target.value / 100; };

    document.getElementById('orbit-radius').oninput = (e) => {
      this.orbitRadius = parseInt(e.target.value);
      document.getElementById('orbit-radius-val').textContent = e.target.value;
    };

    const hint = document.getElementById('ctrl-hint');
    const hide = () => setTimeout(() => hint.classList.add('hidden'), 2500);
    this.renderer.domElement.addEventListener('pointerdown', hide, { once: true });
    this.renderer.domElement.addEventListener('wheel',       hide, { once: true });
  }

  _log(msg) {
    const c = document.getElementById('log-entries');
    const d = document.createElement('div');
    const t = new Date().toLocaleTimeString('de-DE', { hour12:false });
    d.innerHTML = `<span class="ts">[${t}]</span> ${msg}`;
    c.prepend(d);
    while (c.children.length > 10) c.removeChild(c.lastChild);
  }

  // ── Render loop ────────────────────────────────────────────

  _animate() {
    requestAnimationFrame(() => this._animate());
    const t = Date.now() * 0.001;

    if (this.autoOrbit) {
      const r = this.orbitRadius;
      this.camera.position.x = Math.sin(t * 0.10) * r;
      this.camera.position.z = Math.cos(t * 0.10) * r;
      this.camera.position.y = r * 0.55 + Math.sin(t * 0.05) * (r * 0.20);
      this.camera.lookAt(0, 0, 0);
    } else {
      this.controls.update();
    }

    const pulse = 0.3 + Math.abs(Math.sin(t * 3.2)) * 0.7;
    this.alertObjs.forEach(obj => {
      if (obj.isMesh) obj.material.emissiveIntensity = pulse;
      else if (obj.isLine) obj.material.opacity = 0.2 + Math.abs(Math.sin(t*4)) * 0.65;
    });

    const step = 0.006 * (this.flowSpeed * 6 + 0.15);
    this.linkObjects.forEach(s => {
      if (!s.spark.visible) return;
      s.prog += step; if (s.prog > 1) s.prog = 0;
      s.spark.position.lerpVectors(s.start, s.end, s.prog);
    });
    // Tunnel sparks: folgen der Kurve (langsamerer Flow für realistischen Tunnel-Feel)
    const tstep = step * 0.65;
    this.tunnelObjects.forEach(s => {
      if (!s.spark.visible) return;
      s.prog += tstep; if (s.prog > 1) s.prog = 0;
      s.spark.position.copy(s.curve.getPoint(s.prog));
    });

    // ── Pulse rings (expand + fade on alert transition) ──────
    const dt = 0.016;
    for (let i = this._pulseRings.length - 1; i >= 0; i--) {
      const r    = this._pulseRings[i];
      r.t       += dt;
      const prog = r.t / r.maxT;
      if (prog >= 1) {
        this.scene.remove(r.mesh);
        r.mesh.geometry.dispose();
        r.mesh.material.dispose();
        this._pulseRings.splice(i, 1);
        continue;
      }
      const sc = 1 + prog * r.maxScale;
      r.mesh.scale.set(sc, sc, sc);
      r.mesh.material.opacity = r.baseOpacity * (1 - prog * prog);
    }

    // ── Search rings (pulse glow) ─────────────────────────────
    if (this._searchRings.length) {
      const sp = 0.38 + Math.abs(Math.sin(t * 2.8)) * 0.55;
      this._searchRings.forEach(r => { r.material.opacity = sp; });
    }

    this.renderer.render(this.scene, this.camera);
    this.labelRenderer.render(this.scene, this.camera);
  }
}

// ─────────────────────────────────────────────────────────────
//  PROBLEM LIST
// ─────────────────────────────────────────────────────────────
class ProblemList {
  constructor(app) {
    this.app   = app;
    this._el   = document.getElementById('problem-panel');
    this._list = document.getElementById('prob-list');
    this._btn  = document.getElementById('btn-problems');
    document.getElementById('prob-close').onclick = () => this.close();
    this._el.addEventListener('click', e => { if (e.target === this._el) this.close(); });
  }

  toggle() { this._el.classList.toggle('open'); }
  close()  { this._el.classList.remove('open'); }

  update(nodes) {
    const problems = nodes
      .filter(n => n.status !== 'ok')
      .sort((a, b) => (SC[b.status]?.sev ?? 0) - (SC[a.status]?.sev ?? 0));

    const critCount = problems.filter(n => al(n.status)).length;

    // Update header button
    this._btn.textContent = critCount > 0 ? `⚠ ${critCount}` : `⚑ ${problems.length}`;
    this._btn.classList.toggle('has-crit', critCount > 0);
    this._btn.classList.toggle('has-warn', critCount === 0 && problems.length > 0);

    this._list.innerHTML = '';

    if (problems.length === 0) {
      this._list.innerHTML = '<div class="prob-empty">Alle Hosts OK ✓</div>';
      return;
    }

    problems.forEach(n => {
      const cfg = S(n.status);
      const row = document.createElement('div');
      row.className = 'prob-row';
      row.innerHTML = `
        <span class="s-badge ${cfg.badge}" style="flex-shrink:0">${cfg.label}</span>
        <div class="prob-info">
          <span class="prob-name">${n.label}</span>
          <span class="prob-floor">${n.floor ?? n.type}</span>
        </div>
        <span class="prob-arrow">›</span>
      `;
      row.onclick = () => { this.app.focusNode(n.id); this.close(); };
      this._list.appendChild(row);
    });
  }
}

// ─────────────────────────────────────────────────────────────
//  MODEL DIALOG
// ─────────────────────────────────────────────────────────────
class ModelDialog {
  constructor(app) {
    this.app     = app;
    this._el     = document.getElementById('model-dialog');
    this._list   = document.getElementById('model-list');
    this._form   = document.getElementById('model-form');
    this._newSec = document.getElementById('model-new-section');
    this._setupEvents();
  }

  open()  { this._renderList(); this._newSec.style.display = 'none'; this._el.classList.add('open'); }
  close() { this._el.classList.remove('open'); }

  _metaLine(m) {
    if (m.floors) {
      const hasWL  = m.floors.some(f => f.widthM);
      if (hasWL) {
        const maxW = Math.max(...m.floors.filter(f=>f.widthM).map(f => f.widthM));
        const maxL = Math.max(...m.floors.filter(f=>f.lengthM).map(f => f.lengthM));
        return `${m.floors.length} Ebenen · max. ${fmtM(maxW)} × ${fmtM(maxL)}`;
      }
      return `${m.floors.length} Ebenen · Ausmaße aus Hosts`;
    }
    return `${m.floorCount} Etagen · ${m.width} × ${m.length} m · ${m.floorHeight} m/Etage`;
  }

  _renderList() {
    const models   = ModelManager.getAll();
    const activeId = this.app._model?.id;
    this._list.innerHTML = '';
    models.forEach(m => {
      const isActive  = m.id === activeId;
      const typeLabel = m.type === 'mine' ? '⛏ Grube' : '🏢 Hochhaus';
      const isGeo     = !!(m.floors && !m.floors[0]?.widthM);
      const row = document.createElement('div');
      row.className = 'model-row' + (isActive ? ' active' : '');
      row.innerHTML = `
        <div class="model-info">
          <div class="model-row-top">
            <span class="model-name">${m.name}</span>
            <span class="model-type-tag ${m.type}">${typeLabel}</span>
            ${isGeo ? `<span class="model-var-tag">⊕ Geo</span>` : ''}
          </div>
          <div class="model-meta">${this._metaLine(m)}</div>
        </div>
        <div class="model-actions">
          ${isActive
            ? `<span class="model-active-badge">✓ Aktiv</span>`
            : `<button class="btn btn-sm" data-select="${m.id}">Laden</button>`}
          ${!ModelManager.isPreset(m.id)
            ? `<button class="btn btn-sm btn-del" data-delete="${m.id}" title="Löschen">✕</button>`
            : ''}
        </div>`;
      this._list.appendChild(row);
    });
  }

  _setupEvents() {
    this._list.addEventListener('click', e => {
      const selId = e.target.closest('[data-select]')?.dataset.select;
      const delId = e.target.closest('[data-delete]')?.dataset.delete;
      if (selId) { const cfg = ModelManager.getById(selId); if (cfg) { this.app.loadModel(cfg); this.close(); } }
      if (delId && confirm('Modell löschen?')) { ModelManager.remove(delId); this._renderList(); }
    });

    document.getElementById('btn-new-model').onclick = () => {
      this._newSec.style.display = this._newSec.style.display === 'none' ? 'block' : 'none';
    };
    document.getElementById('btn-cancel-new').onclick = () => { this._newSec.style.display = 'none'; };

    this._form.onsubmit = (e) => {
      e.preventDefault();
      const d = Object.fromEntries(new FormData(this._form));
      ModelManager.add({
        id: 'model_' + Date.now(), name: d.name.trim(), type: d.type,
        floorCount: parseInt(d.floorCount)||4, width: parseFloat(d.width)||110,
        length: parseFloat(d.length)||110, floorHeight: parseFloat(d.floorHeight)||3,
        lat: parseFloat(d.lat)||0, lon: parseFloat(d.lon)||0,
      });
      this._form.reset(); this._newSec.style.display = 'none'; this._renderList();
    };

    this._el.addEventListener('click', e => { if (e.target === this._el) this.close(); });
    window.addEventListener('keydown', e => {
      if (e.key === 'Escape' && this._el.classList.contains('open')) {
        e.stopImmediatePropagation(); this.close();
      }
    }, true);
  }
}

// ─────────────────────────────────────────────────────────────
//  MAP OVERLAY  (Leaflet / OSM)
//  Zeigt alle Modelle mit lat/lon als farbige Marker auf einer
//  CARTO-Dark-Karte. Klick auf Marker → loadModel(). Kein API-Key.
// ─────────────────────────────────────────────────────────────
class MapOverlay {
  constructor(app) {
    this.app        = app;
    this._el        = document.getElementById('map-overlay');
    this._select    = document.getElementById('map-site-select');
    this._loadBtn   = document.getElementById('map-load-btn');
    this._map       = null;      // Leaflet-Instanz (lazy init)
    this._markers   = new Map(); // modelId → L.circleMarker
    this._selectedId = null;

    this._select.addEventListener('change', () => this._onSelect());
    this._loadBtn.addEventListener('click',  () => this._loadSelected());
  }

  toggle() { this._el.classList.contains('open') ? this.close() : this.open(); }

  open() {
    this._el.classList.add('open');
    this._populateSelect();
    if (!this._map) {
      this._initMap();
    } else {
      this._refreshMarkers();
      setTimeout(() => this._map.invalidateSize(), 50);
    }
  }

  close() { this._el.classList.remove('open'); }

  // Nach jedem loadModel() aktiven Marker-Ring aktualisieren
  update() { if (this._map) this._refreshMarkers(); }

  // ── Private ──────────────────────────────────────────────────

  _geoModels() {
    return ModelManager.getAll().filter(m => m.lat != null && m.lon != null);
  }

  _populateSelect() {
    const models   = this._geoModels();
    const activeId = this.app._model?.id;
    this._select.innerHTML = '<option value="">– Standort wählen –</option>';
    models.forEach(cfg => {
      const opt = document.createElement('option');
      opt.value    = cfg.id;
      opt.textContent = cfg.name;
      if (cfg.id === activeId) opt.selected = true;
      this._select.appendChild(opt);
    });
    this._selectedId = activeId ?? null;
    this._loadBtn.disabled = !this._selectedId;
  }

  _onSelect() {
    const id  = this._select.value;
    this._selectedId = id || null;
    this._loadBtn.disabled = !this._selectedId;
    if (!id || !this._map) return;
    const cfg = ModelManager.getById(id);
    if (!cfg) return;
    const marker = this._markers.get(id);
    if (marker && this._cluster) {
      // Cluster aufspringen lassen und dann zum Marker fliegen
      this._cluster.zoomToShowLayer(marker, () => {
        this._map.flyTo([cfg.lat, cfg.lon], 12, { duration: 0.6 });
      });
    } else {
      this._map.flyTo([cfg.lat, cfg.lon], 12, { duration: 0.8 });
    }
  }

  _loadSelected() {
    if (!this._selectedId) return;
    const cfg = ModelManager.getById(this._selectedId);
    if (!cfg) return;
    this.close();
    this.app.loadModel(cfg);
  }

  _initMap() {
    /* global L */
    this._map = L.map('leaflet-container', { zoomControl: true });

    // CARTO Voyager — neutrales Grau-Beige, kein API-Key nötig
    L.tileLayer(
      'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
      {
        attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a> contributors &amp; © <a href="https://carto.com/" target="_blank">CARTO</a>',
        subdomains: 'abcd',
        maxZoom: 19,
      }
    ).addTo(this._map);

    // Cluster-Gruppe: Marker werden beim Rauszoomen gebündelt
    this._cluster = L.markerClusterGroup({
      maxClusterRadius: 50,
      showCoverageOnHover: false,
    });
    this._map.addLayer(this._cluster);

    this._refreshMarkers();
  }

  _refreshMarkers() {
    const TYPE_COLOR = {
      mine:       '#1a9e5c',
      building:   '#2c6fbe',
      datacenter: '#0d7ab5',
    };
    const TYPE_LABEL = { mine: 'Grube / Schacht', building: 'Gebäude', datacenter: 'Datacenter' };
    const activeId   = this.app._model?.id;

    if (this._cluster) this._cluster.clearLayers();
    this._markers.clear();

    const models = this._geoModels();
    const bounds = [];

    models.forEach(cfg => {
      const isActive = cfg.id === activeId;
      const color    = TYPE_COLOR[cfg.type] ?? '#666';

      const marker = L.circleMarker([cfg.lat, cfg.lon], {
        radius:      isActive ? 13 : 9,
        fillColor:   color,
        color:       isActive ? '#222' : '#fff',
        weight:      isActive ? 2.5 : 1.5,
        opacity:     1,
        fillOpacity: isActive ? 1.0 : 0.82,
      });

      marker.bindTooltip(
        `<strong>${cfg.name}</strong><br><span>${TYPE_LABEL[cfg.type] ?? cfg.type}</span>`,
        { className: 'map-tooltip', direction: 'top', offset: [0, -12], sticky: false }
      );

      marker.on('click', () => {
        this._select.value     = cfg.id;
        this._selectedId       = cfg.id;
        this._loadBtn.disabled = false;
        this.close();
        this.app.loadModel(cfg);
      });

      this._cluster.addLayer(marker);
      this._markers.set(cfg.id, marker);
      bounds.push([cfg.lat, cfg.lon]);
    });

    if (bounds.length) {
      this._map.fitBounds(bounds, { padding: [50, 50], maxZoom: 12 });
    }
    setTimeout(() => this._map.invalidateSize(), 60);
  }
}

// ─────────────────────────────────────────────────────────────
//  BOOT
// ─────────────────────────────────────────────────────────────
(async () => {
  const initialModel = ModelManager.getInitial();

  // Construct with empty data; loadModel() will fetch + populate
  window.app         = new NV2Map3D({ nodes: [], links: [] }, initialModel);
  window.modelDialog = new ModelDialog(window.app);
  window.problemList = new ProblemList(window.app);
  window.mapOverlay  = new MapOverlay(window.app);

  document.getElementById('btn-model-name').textContent = initialModel.name;
  await window.app.loadModel(initialModel);
  window.mapOverlay.open(); // beim Start direkt anzeigen

  // Optional: load additional models from an external registry
  // await ModelManager.loadRegistry('models.json');

  // WS:  app.connectWS('ws://localhost:8008/ws/map/my-map');
})();
