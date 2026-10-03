export type KeyInfo = {
  type: 'keydown' | 'keyup'; code: string; key: string; location: number; repeat: boolean;
  shift: boolean; ctrl: boolean; alt: boolean; meta: boolean; t: number; // t = ms since session start
};
export type Guided = { order: string[]; idx: number };
export type Session = {
  wall: number | null; // wall-clock ms at session start
  pressed: string[]; registered: string[]; skipped: string[]; recheck: string[];
  maxSimul: number; repeats: number; log: KeyInfo[]; last: KeyInfo | null;
  locks: { caps: boolean; num: boolean } | null; guided: Guided | null;
};
export const MAX_LOG = 100;

export const newSession = (): Session => ({
  wall: null, pressed: [], registered: [], skipped: [], recheck: [], maxSimul: 0, repeats: 0, log: [], last: null, locks: null, guided: null,
});

const add = (a: string[], c: string) => (a.includes(c) ? a : [...a, c]);
const drop = (a: string[], c: string) => a.filter((x) => x !== c);
const nextIdx = (order: string[], done: string[], skipped: string[], from: number) => {
  let i = from;
  while (i < order.length && (done.includes(order[i]) || skipped.includes(order[i]))) i++;
  return i;
};

export const toInfo = (e: KeyboardEvent, base: number): KeyInfo => ({
  type: e.type as 'keydown' | 'keyup',
  code: e.code || `Unidentified(${e.key})`,
  key: e.key, location: e.location, repeat: e.repeat,
  shift: e.shiftKey, ctrl: e.ctrlKey, alt: e.altKey, meta: e.metaKey,
  t: Math.max(0, Math.round(e.timeStamp - base)),
});

/** Pure reducer step for one received keyboard event. Repeats are counted, not logged. */
export function applyKey(s: Session, e: KeyInfo, logOn = true, locks: Session['locks'] = s.locks): Session {
  const n: Session = { ...s, last: e, locks };
  if (e.type === 'keyup') {
    // macOS sends no keyup for other keys while Meta is held, so releasing Meta clears everything.
    n.pressed = e.code.startsWith('Meta') ? [] : drop(s.pressed, e.code);
  } else {
    n.pressed = add(s.pressed, e.code);
    n.registered = add(s.registered, e.code);
    n.skipped = drop(s.skipped, e.code);
    n.maxSimul = Math.max(s.maxSimul, n.pressed.length);
    if (e.repeat) {
      n.repeats = s.repeats + 1;
      return n;
    }
    const g = s.guided;
    if (g && g.order[g.idx] === e.code) n.guided = { ...g, idx: nextIdx(g.order, n.registered, n.skipped, g.idx + 1) };
  }
  if (logOn) n.log = [...s.log, e].slice(-MAX_LOG);
  return n;
}

export const clearPressed = (s: Session): Session => (s.pressed.length ? { ...s, pressed: [] } : s);
export const clearLog = (s: Session): Session => ({ ...s, log: [] });
export const toggleRecheck = (s: Session, c: string): Session => ({ ...s, recheck: s.recheck.includes(c) ? drop(s.recheck, c) : [...s.recheck, c] });

export const startGuided = (s: Session, order: string[]): Session => ({ ...s, guided: { order, idx: nextIdx(order, s.registered, [], 0) } });
export const guidedCurrent = (s: Session): string | null => (s.guided ? s.guided.order[s.guided.idx] ?? null : null);
export const guidedDone = (s: Session): boolean => !!s.guided && s.guided.idx >= s.guided.order.length;

export function guidedSkip(s: Session): Session {
  const g = s.guided;
  const code = g ? g.order[g.idx] : undefined;
  if (!g || !code) return s;
  const skipped = add(s.skipped, code);
  return { ...s, skipped, guided: { ...g, idx: nextIdx(g.order, s.registered, skipped, g.idx + 1) } };
}

/** Re-target the most recently skipped key. */
export function guidedRetry(s: Session): Session {
  const g = s.guided;
  if (!g) return s;
  const code = [...s.skipped].reverse().find((c) => g.order.includes(c));
  if (!code) return s;
  return { ...s, skipped: drop(s.skipped, code), guided: { ...g, idx: g.order.indexOf(code) } };
}
