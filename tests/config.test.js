import { describe, it, expect } from 'vitest';
import { SC, S, al, SCENE_MAX, FLOOR_STEP, BBOX_PAD, TUNNEL_MIN_DIST } from '../src/config.js';

describe('SC – Status-Konfiguration', () => {
  it('enthält alle 5 Status-Einträge', () => {
    expect(Object.keys(SC)).toEqual(['ok', 'warning', 'unknown', 'critical', 'down']);
  });

  it('sev-Werte sind aufsteigend sortiert', () => {
    const sevs = Object.values(SC).map(s => s.sev);
    expect(sevs).toEqual([0, 1, 2, 3, 4]);
  });

  it('jeder Eintrag hat hex, emissive, badge, cls, label, sev', () => {
    for (const [key, val] of Object.entries(SC)) {
      expect(val, `SC.${key}`).toMatchObject({
        hex:      expect.any(Number),
        emissive: expect.any(Number),
        badge:    expect.any(String),
        cls:      expect.any(String),
        label:    expect.any(String),
        sev:      expect.any(Number),
      });
    }
  });

  it('hex-Werte sind gültige 24-bit Farbwerte', () => {
    for (const [key, val] of Object.entries(SC)) {
      expect(val.hex, `SC.${key}.hex`).toBeGreaterThanOrEqual(0);
      expect(val.hex, `SC.${key}.hex`).toBeLessThanOrEqual(0xffffff);
    }
  });
});

describe('S() – Status-Lookup', () => {
  it('gibt korrekten SC-Eintrag für bekannte Stati zurück', () => {
    expect(S('ok')).toBe(SC.ok);
    expect(S('warning')).toBe(SC.warning);
    expect(S('critical')).toBe(SC.critical);
    expect(S('down')).toBe(SC.down);
    expect(S('unknown')).toBe(SC.unknown);
  });

  it('fällt bei unbekanntem Status auf SC.unknown zurück', () => {
    expect(S('foobar')).toBe(SC.unknown);
    expect(S(undefined)).toBe(SC.unknown);
    expect(S(null)).toBe(SC.unknown);
    expect(S('')).toBe(SC.unknown);
  });
});

describe('al() – Alert-Check', () => {
  it('gibt true für critical und down zurück', () => {
    expect(al('critical')).toBe(true);
    expect(al('down')).toBe(true);
  });

  it('gibt false für ok, warning, unknown zurück', () => {
    expect(al('ok')).toBe(false);
    expect(al('warning')).toBe(false);
    expect(al('unknown')).toBe(false);
    expect(al('foobar')).toBe(false);
  });
});

describe('Konstanten', () => {
  it('SCENE_MAX ist eine positive Zahl', () => {
    expect(SCENE_MAX).toBeGreaterThan(0);
  });

  it('FLOOR_STEP ist eine positive Zahl', () => {
    expect(FLOOR_STEP).toBeGreaterThan(0);
  });

  it('BBOX_PAD ist eine positive Zahl', () => {
    expect(BBOX_PAD).toBeGreaterThan(0);
  });

  it('TUNNEL_MIN_DIST ist eine positive Zahl', () => {
    expect(TUNNEL_MIN_DIST).toBeGreaterThan(0);
  });
});
