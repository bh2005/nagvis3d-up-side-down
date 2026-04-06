import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fmtM, computeGeoLayout, buildFloors, ModelManager } from '../src/data.js';
import { FLOOR_STEP, SCENE_MAX } from '../src/config.js';

// ─────────────────────────────────────────────────────────────
//  fmtM
// ─────────────────────────────────────────────────────────────
describe('fmtM()', () => {
  it('gibt "?" für null/undefined zurück', () => {
    expect(fmtM(null)).toBe('?');
    expect(fmtM(undefined)).toBe('?');
  });

  it('formatiert Meter (< 1 000)', () => {
    expect(fmtM(0)).toBe('0 m');
    expect(fmtM(42)).toBe('42 m');
    expect(fmtM(999)).toBe('999 m');
  });

  it('formatiert Kilometer (>= 1 000)', () => {
    expect(fmtM(1000)).toBe('1.0 km');
    expect(fmtM(1500)).toBe('1.5 km');
    expect(fmtM(999_999)).toBe('1000.0 km');
  });

  it('formatiert Megameter (>= 1 000 000)', () => {
    expect(fmtM(1_000_000)).toBe('1.0 Mm');
    expect(fmtM(6_371_000)).toBe('6.4 Mm');
  });
});

// ─────────────────────────────────────────────────────────────
//  buildFloors
// ─────────────────────────────────────────────────────────────
describe('buildFloors()', () => {
  describe('Datacenter', () => {
    it('erzeugt genau einen Floor', () => {
      const floors = buildFloors({ type: 'datacenter', rows: 3, racksPerRow: 5, rackUnits: 42, width: 20, length: 10 });
      expect(floors).toHaveLength(1);
      expect(floors[0].label).toBe('Datacenter');
    });

    it('widthM/lengthM werden aus cfg übernommen', () => {
      const floors = buildFloors({ type: 'datacenter', width: 30, length: 15 });
      expect(floors[0].widthM).toBe(30);
      expect(floors[0].lengthM).toBe(15);
    });
  });

  describe('Gebäude (floorCount)', () => {
    it('erzeugt n Etagen', () => {
      const floors = buildFloors({ type: 'building', floorCount: 4, width: 50, length: 50, floorHeight: 3 });
      expect(floors).toHaveLength(4);
    });

    it('erste Etage ist EG', () => {
      const floors = buildFloors({ type: 'building', floorCount: 3, width: 50, length: 50, floorHeight: 3 });
      expect(floors[0].label).toBe('EG');
      expect(floors[1].label).toBe('1. OG');
      expect(floors[2].label).toBe('2. OG');
    });

    it('y-Werte sind um FLOOR_STEP gestaffelt', () => {
      const floors = buildFloors({ type: 'building', floorCount: 3, width: 50, length: 50, floorHeight: 3 });
      expect(floors[1].y - floors[0].y).toBeCloseTo(FLOOR_STEP);
      expect(floors[2].y - floors[1].y).toBeCloseTo(FLOOR_STEP);
    });
  });

  describe('Grube (explizite floors-Liste)', () => {
    const cfg = {
      type: 'mine',
      floorHeight: 300,
      lat: 50.89, lon: 9.89,
      floors: [
        { label: 'ÜBERTAGE', sub: 'Schachtanlage' },
        { label: 'SOHLE 1',  sub: '−300 m' },
        { label: 'SOHLE 2',  sub: '−600 m' },
      ],
    };

    it('erzeugt exakt so viele Floors wie in floors-Liste', () => {
      expect(buildFloors(cfg)).toHaveLength(3);
    });

    it('labels bleiben erhalten', () => {
      const floors = buildFloors(cfg);
      expect(floors[0].label).toBe('ÜBERTAGE');
      expect(floors[1].label).toBe('SOHLE 1');
      expect(floors[2].label).toBe('SOHLE 2');
    });

    it('ÜBERTAGE liegt höher als SOHLE 1 (y descending für Grube)', () => {
      const floors = buildFloors(cfg);
      expect(floors[0].y).toBeGreaterThan(floors[1].y);
      expect(floors[1].y).toBeGreaterThan(floors[2].y);
    });

    it('y-Abstände entsprechen FLOOR_STEP', () => {
      const floors = buildFloors(cfg);
      expect(floors[0].y - floors[1].y).toBeCloseTo(FLOOR_STEP);
    });

    it('accent wird zugewiesen wenn nicht gesetzt', () => {
      const floors = buildFloors(cfg);
      floors.forEach((f, i) => {
        expect(Array.isArray(f.accent), `floor[${i}].accent soll Array sein`).toBe(true);
        expect(f.accent).toHaveLength(3);
      });
    });
  });

  describe('Grube (floorCount ohne floors-Liste)', () => {
    it('erzeugt n Floors mit generischen Labels', () => {
      const floors = buildFloors({ type: 'mine', floorCount: 3, width: 200, length: 200, floorHeight: 300 });
      expect(floors).toHaveLength(3);
      expect(floors[0].label).toBe('ÜBERTAGE');
      expect(floors[1].label).toBe('SOHLE 1');
      expect(floors[2].label).toBe('SOHLE 2');
    });
  });
});

// ─────────────────────────────────────────────────────────────
//  computeGeoLayout
// ─────────────────────────────────────────────────────────────
describe('computeGeoLayout()', () => {
  const cfg   = { lat: 51.3127, lon: 9.4797 };
  const floor = { label: 'EG', y: 0 };

  it('gibt nodePos, floors, scale zurück', () => {
    const nodes = [{ id: 'n1', lat: 51.3127, lon: 9.4797, floor: 'EG' }];
    const result = computeGeoLayout(nodes, [floor], cfg);
    expect(result).toHaveProperty('nodePos');
    expect(result).toHaveProperty('floors');
    expect(result).toHaveProperty('scale');
  });

  it('scale ist positiv', () => {
    const nodes = [
      { id: 'n1', lat: 51.3100, lon: 9.4700, floor: 'EG' },
      { id: 'n2', lat: 51.3150, lon: 9.4850, floor: 'EG' },
    ];
    const { scale } = computeGeoLayout(nodes, [floor], cfg);
    expect(scale).toBeGreaterThan(0);
  });

  it('single-node wird auf (0,0) zentriert', () => {
    const nodes = [{ id: 'n1', lat: 51.31, lon: 9.48, floor: 'EG' }];
    const { nodePos } = computeGeoLayout(nodes, [floor], cfg);
    expect(nodePos['n1'].x).toBeCloseTo(0, 5);
    expect(nodePos['n1'].z).toBeCloseTo(0, 5);
  });

  it('y-Wert entspricht dem Floor-y', () => {
    const nodes = [{ id: 'n1', lat: 51.31, lon: 9.48, floor: 'EG' }];
    const { nodePos } = computeGeoLayout(nodes, [{ label: 'EG', y: 42 }], cfg);
    expect(nodePos['n1'].y).toBe(42);
  });

  it('grösste Dimension in SCENE_MAX skaliert', () => {
    // Nodes weit genug auseinander, dass widthM > BBOX_PAD*2
    const nodes = [
      { id: 'n1', lat: 51.00, lon: 9.00, floor: 'EG' },
      { id: 'n2', lat: 51.50, lon: 10.00, floor: 'EG' },
    ];
    const { floors, scale } = computeGeoLayout(nodes, [floor], cfg);
    const maxDim = Math.max(floors[0].widthM, floors[0].lengthM);
    expect(maxDim * scale).toBeCloseTo(SCENE_MAX, 3);
  });

  it('mehrere Floors – jeder Node erhält das richtige y', () => {
    const nodes = [
      { id: 'a', lat: 51.31, lon: 9.48, floor: 'EG'   },
      { id: 'b', lat: 51.32, lon: 9.49, floor: '1. OG' },
    ];
    const floors = [
      { label: 'EG',    y:  0 },
      { label: '1. OG', y: 35 },
    ];
    const { nodePos } = computeGeoLayout(nodes, floors, cfg);
    expect(nodePos['a'].y).toBe(0);
    expect(nodePos['b'].y).toBe(35);
  });

  it('leere nodes-Liste führt nicht zu Fehler', () => {
    expect(() => computeGeoLayout([], [floor], cfg)).not.toThrow();
  });
});

// ─────────────────────────────────────────────────────────────
//  ModelManager
// ─────────────────────────────────────────────────────────────
describe('ModelManager', () => {
  beforeEach(() => {
    localStorage.clear();
    ModelManager._cache.clear();
  });

  it('getAll() enthält die 5 Presets', () => {
    const all = ModelManager.getAll();
    expect(all.length).toBeGreaterThanOrEqual(5);
    const ids = all.map(m => m.id);
    expect(ids).toContain('dc1');
    expect(ids).toContain('grube1');
    expect(ids).toContain('grube2');
  });

  it('isPreset() erkennt Preset-IDs', () => {
    expect(ModelManager.isPreset('dc1')).toBe(true);
    expect(ModelManager.isPreset('grube1')).toBe(true);
    expect(ModelManager.isPreset('nicht_vorhanden')).toBe(false);
  });

  it('getById() findet Preset', () => {
    const m = ModelManager.getById('dc1');
    expect(m).toBeDefined();
    expect(m.id).toBe('dc1');
  });

  it('getById() gibt undefined für unbekannte ID zurück', () => {
    expect(ModelManager.getById('gibts_nicht')).toBeUndefined();
  });

  it('add() + getAll() – User-Modell wird gespeichert', () => {
    ModelManager.add({ id: 'custom1', name: 'Test', type: 'building' });
    const all = ModelManager.getAll();
    expect(all.find(m => m.id === 'custom1')).toBeDefined();
  });

  it('remove() – User-Modell wird entfernt', () => {
    ModelManager.add({ id: 'custom2', name: 'Test 2', type: 'mine' });
    ModelManager.remove('custom2');
    expect(ModelManager.getById('custom2')).toBeUndefined();
  });

  it('remove() – Presets können nicht entfernt werden', () => {
    ModelManager.remove('dc1');
    expect(ModelManager.getById('dc1')).toBeDefined();
  });

  it('fetchData() gibt inline-data zurück ohne fetch', async () => {
    const data = { nodes: [{ id: 'x' }], links: [] };
    const cfg  = { id: 'inline_test', data };
    const result = await ModelManager.fetchData(cfg);
    expect(result).toBe(data);
  });

  it('fetchData() gibt leere Struktur zurück wenn kein dataUrl', async () => {
    const result = await ModelManager.fetchData({ id: 'no_url' });
    expect(result).toEqual({ nodes: [], links: [] });
  });

  it('fetchData() nutzt Cache beim zweiten Aufruf', async () => {
    const fakeData = { nodes: [], links: [] };
    const fetchMock = vi.fn().mockResolvedValue({
      ok:   true,
      json: () => Promise.resolve(fakeData),
    });
    vi.stubGlobal('fetch', fetchMock);

    const cfg = { id: 'cached_model', dataUrl: 'data/fake.json' };
    await ModelManager.fetchData(cfg);
    await ModelManager.fetchData(cfg);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });

  it('fetchData() wirft Fehler bei HTTP-Fehler', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }));
    await expect(ModelManager.fetchData({ id: 'err', dataUrl: 'bad.json' }))
      .rejects.toThrow('HTTP 404');
    vi.unstubAllGlobals();
  });
});
