// Status-Konfiguration und Konstanten
// ─────────────────────────────────────────────────────────────
//  STATUS CONFIG
// ─────────────────────────────────────────────────────────────
export const SC = {
  ok:       { hex:0x13d389, emissive:0x0a8050, badge:'s-ok',   cls:'ok',   label:'OK',       sev:0 },
  warning:  { hex:0xffd703, emissive:0xa08800, badge:'s-warn',  cls:'warn', label:'WARNING',  sev:1 },
  unknown:  { hex:0x9e9e9e, emissive:0x505050, badge:'s-unkn',  cls:'unkn', label:'UNKNOWN',  sev:2 },
  critical: { hex:0xc83232, emissive:0x801010, badge:'s-crit',  cls:'crit', label:'CRITICAL', sev:3 },
  down:     { hex:0xc83232, emissive:0x801010, badge:'s-down',  cls:'down', label:'DOWN',     sev:4 },
};
export const S  = (s) => SC[s] ?? SC.unknown;
export const al = (s) => s === 'critical' || s === 'down';

// Maps NagVis2 / Livestatus state_label → nagvis3d internal status key
export const STATE_LABEL_MAP = {
  UP: 'ok',   OK: 'ok',
  DOWN: 'down', UNREACHABLE: 'down',
  WARNING: 'warning',
  CRITICAL: 'critical',
  UNKNOWN: 'unknown', PENDING: 'unknown',
};
// Accepts nagvis2 state_label ('UP', 'DOWN', …) or direct status ('ok', 'critical', …)
export const mapState = label => {
  if (!label) return 'unknown';
  const up = label.toUpperCase();
  if (STATE_LABEL_MAP[up]) return STATE_LABEL_MAP[up];
  const lo = label.toLowerCase();
  return SC[lo] ? lo : 'unknown';
};

// ─────────────────────────────────────────────────────────────
//  CONSTANTS
// ─────────────────────────────────────────────────────────────
export const MINE_ACCENTS = [
  [19,211,142], [0,180,220],  [60,110,210],  [110,55,190],
  [150,30,150], [180,20,100], [200,50,50],   [220,100,20],
];
export const BUILD_ACCENTS = [
  [130,140,160], [80,175,100],  [70,140,220],  [20,165,175],
  [180,120,60],  [160,90,180],  [200,160,40],  [90,190,140],
];

export const SCENE_MAX      = 180;   // largest floor → this many scene units wide
export const FLOOR_STEP     = 35;    // vertical gap between floors (scene units)
export const BBOX_PAD       = 300;   // metres of padding around node cluster per floor
export const TUNNEL_MIN_DIST = 30;   // scene-unit threshold: underground links longer than this → tunnel glow
