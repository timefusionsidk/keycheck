import { describe, expect, it } from 'vitest';
import { MAX_LOG, applyKey, clearPressed, guidedDone, guidedRetry, guidedSkip, newSession, startGuided } from './keyState';
import type { KeyInfo, Session } from './keyState';
import { LAYOUTS, getLayout } from './layouts';
import { buildReport, reportCSV, reportJSON } from './report';

const ev = (code: string, type: KeyInfo['type'] = 'keydown', extra: Partial<KeyInfo> = {}): KeyInfo => ({
  type, code, key: code, location: 0, repeat: false, shift: false, ctrl: false, alt: false, meta: false, t: 0, ...extra,
});
const press = (s: Session, ...codes: string[]) => codes.reduce((a, c) => applyKey(a, ev(c)), s);

describe('event state', () => {
  it('keydown/keyup update the physical key', () => {
    let s = applyKey(newSession(), ev('KeyA'));
    expect(s.pressed).toEqual(['KeyA']);
    s = applyKey(s, ev('KeyA', 'keyup'));
    expect(s.pressed).toEqual([]);
    expect(s.registered).toEqual(['KeyA']);
  });
  it('keeps left and right modifiers separate', () => {
    const s = press(newSession(), 'ShiftLeft');
    expect(s.registered).toContain('ShiftLeft');
    expect(s.registered).not.toContain('ShiftRight');
  });
  it('counts repeats without logging or double-registering', () => {
    let s = press(newSession(), 'KeyA');
    s = applyKey(applyKey(s, ev('KeyA', 'keydown', { repeat: true })), ev('KeyA', 'keydown', { repeat: true }));
    expect(s.repeats).toBe(2);
    expect(s.log).toHaveLength(1);
    expect(s.pressed).toEqual(['KeyA']);
  });
  it('tracks simultaneous keys and the maximum', () => {
    let s = press(newSession(), 'KeyA', 'KeyB', 'KeyC');
    expect(s.pressed).toHaveLength(3);
    s = applyKey(s, ev('KeyB', 'keyup'));
    expect(s.pressed).toHaveLength(2);
    expect(s.maxSimul).toBe(3);
  });
  it('blur clears pressed keys but keeps registered history', () => {
    const s = clearPressed(press(newSession(), 'KeyA', 'KeyB'));
    expect(s.pressed).toEqual([]);
    expect(s.registered).toEqual(['KeyA', 'KeyB']);
  });
  it('caps the log and honours pause', () => {
    let s = newSession();
    for (let i = 0; i < MAX_LOG + 50; i++) s = applyKey(s, ev('KeyA', i % 2 ? 'keyup' : 'keydown'));
    expect(s.log).toHaveLength(MAX_LOG);
    const paused = applyKey(newSession(), ev('KeyZ'), false);
    expect(paused.log).toHaveLength(0);
    expect(paused.registered).toEqual(['KeyZ']);
  });
});

describe('guided mode', () => {
  it('handles correct, skipped and retried keys', () => {
    let s = startGuided(newSession(), ['KeyA', 'KeyB', 'KeyC']);
    s = press(s, 'KeyA');
    expect(s.guided?.idx).toBe(1);
    s = guidedSkip(s);
    expect(s.skipped).toEqual(['KeyB']);
    expect(s.registered).not.toContain('KeyB');
    s = press(s, 'KeyC');
    expect(guidedDone(s)).toBe(true);
    s = guidedRetry(s);
    expect(s.skipped).toEqual([]);
    expect(s.guided?.idx).toBe(1);
    s = press(s, 'KeyB');
    expect(s.registered).toEqual(['KeyA', 'KeyC', 'KeyB']);
    expect(guidedDone(s)).toBe(true);
  });
});

describe('layouts', () => {
  it('have unique codes and 15u main blocks', () => {
    for (const l of LAYOUTS) {
      const codes = l.keys.map((q) => q.code);
      expect(new Set(codes).size).toBe(codes.length);
      const bs = l.keys.find((q) => q.code === 'Backspace')!;
      expect(bs.x + bs.w).toBe(15);
    }
  });
  it('model ISO, TKL, 60% and full-size differences', () => {
    const has = (id: string, c: string) => getLayout(id).keys.some((q) => q.code === c);
    expect(getLayout('iso-full').keys.find((q) => q.code === 'Enter')?.shape).toBe('iso-enter');
    expect(has('iso-full', 'IntlBackslash')).toBe(true);
    expect(has('ansi-full', 'IntlBackslash')).toBe(false);
    expect(has('ansi-tkl', 'Numpad0')).toBe(false);
    expect(has('ansi-60', 'F1')).toBe(false);
    expect(getLayout('ansi-full').width).toBe(22.5);
  });
});

describe('report', () => {
  it('contains the real session data', () => {
    const start = Date.UTC(2026, 9, 2, 10, 0, 0);
    let s: Session = { ...newSession(), wall: start };
    s = press(s, 'KeyA', 'ShiftLeft');
    s = applyKey(s, ev('KeyQ', 'keydown'));
    s = { ...s, skipped: ['KeyW'], recheck: ['KeyA'] };
    const r = buildReport(s, getLayout('ansi-60'), start + 65_000);
    expect(r.durationSeconds).toBe(65);
    expect(r.registeredCodes).toEqual(['KeyA', 'ShiftLeft', 'KeyQ']);
    expect(r.notRegisteredInThisTest).not.toContain('KeyA');
    expect(r.notRegisteredInThisTest).not.toContain('KeyW');
    expect(r.notRegisteredInThisTest).toContain('KeyE');
    expect(r.maxSimultaneousKeys).toBe(3);
    expect(JSON.parse(reportJSON(r)).skipped).toEqual(['KeyW']);
    const csv = reportCSV(r);
    expect(csv).toContain('"KeyA",registered,true');
    expect(csv).toContain('"KeyW",skipped,false');
  });
});
