export type LayoutId = 'ansi-full' | 'ansi-tkl' | 'ansi-60' | 'iso-full';
export interface KeyDef { code: string; label: string; x: number; y: number; w: number; h: number; shape?: 'iso-enter' }
export interface Layout { id: LayoutId; name: string; keys: KeyDef[]; width: number; height: number }
type Spec = [string, string, number?]; // code, label, width in key units

const k = (code: string, label: string, x: number, y: number, w = 1, h = 1): KeyDef => ({ code, label, x, y, w, h });
const run = (specs: Spec[], x: number, y: number): KeyDef[] =>
  specs.map(([code, label, w = 1]) => {
    const key = k(code, label, x, y, w);
    x += w;
    return key;
  });
const L = (s: string): Spec[] => [...s].map((c) => ['Key' + c, c] as Spec);

const DIGITS: Spec[] = [['Backquote', '`'], ...[...'1234567890'].map((c) => ['Digit' + c, c] as Spec), ['Minus', '-'], ['Equal', '='], ['Backspace', 'Backspace', 2]];
const TAB: Spec[] = [['Tab', 'Tab', 1.5], ...L('QWERTYUIOP'), ['BracketLeft', '['], ['BracketRight', ']']];
const CAPS: Spec[] = [['CapsLock', 'Caps Lock', 1.75], ...L('ASDFGHJKL'), ['Semicolon', ';'], ['Quote', "'"]];
const ZED: Spec[] = [...L('ZXCVBNM'), ['Comma', ','], ['Period', '.'], ['Slash', '/']];
const SPACE: Spec[] = [['ControlLeft', 'Ctrl', 1.25], ['MetaLeft', 'Meta', 1.25], ['AltLeft', 'Alt', 1.25], ['Space', 'Space', 6.25], ['AltRight', 'Alt', 1.25], ['MetaRight', 'Meta', 1.25], ['ContextMenu', 'Menu', 1.25], ['ControlRight', 'Ctrl', 1.25]];

/** 15u-wide alphanumeric block. ISO swaps in the 1.25u Shift, extra key, "#" key and the L-shaped Enter. */
function main(iso: boolean, y: number): KeyDef[] {
  const rowTab: Spec[] = iso ? TAB : [...TAB, ['Backslash', '\\', 1.5]];
  const rowCaps: Spec[] = [...CAPS, iso ? ['Backslash', '#'] : ['Enter', 'Enter', 2.25]];
  const rowShift: Spec[] = iso
    ? [['ShiftLeft', 'Shift', 1.25], ['IntlBackslash', '\\'], ...ZED, ['ShiftRight', 'Shift', 2.75]]
    : [['ShiftLeft', 'Shift', 2.25], ...ZED, ['ShiftRight', 'Shift', 2.75]];
  const out = [...run(DIGITS, 0, y), ...run(rowTab, 0, y + 1), ...run(rowCaps, 0, y + 2), ...run(rowShift, 0, y + 3), ...run(SPACE, 0, y + 4)];
  if (iso) out.push({ code: 'Enter', label: 'Enter', x: 13.5, y: y + 1, w: 1.5, h: 2, shape: 'iso-enter' });
  return out;
}

const FX = [2, 3, 4, 5, 6.5, 7.5, 8.5, 9.5, 11, 12, 13, 14];
const fnRow = (): KeyDef[] => [k('Escape', 'Esc', 0, 0), ...FX.map((x, i) => k(`F${i + 1}`, `F${i + 1}`, x, 0))];
const nav = (y: number): KeyDef[] => [
  k('PrintScreen', 'PrtSc', 15.25, 0), k('ScrollLock', 'ScrLk', 16.25, 0), k('Pause', 'Pause', 17.25, 0),
  k('Insert', 'Ins', 15.25, y), k('Home', 'Home', 16.25, y), k('PageUp', 'PgUp', 17.25, y),
  k('Delete', 'Del', 15.25, y + 1), k('End', 'End', 16.25, y + 1), k('PageDown', 'PgDn', 17.25, y + 1),
  k('ArrowUp', '↑', 16.25, y + 3), k('ArrowLeft', '←', 15.25, y + 4), k('ArrowDown', '↓', 16.25, y + 4), k('ArrowRight', '→', 17.25, y + 4),
];
const pad = (y: number): KeyDef[] => {
  const x = 18.5;
  return [
    k('NumLock', 'Num', x, y), k('NumpadDivide', '/', x + 1, y), k('NumpadMultiply', '*', x + 2, y), k('NumpadSubtract', '-', x + 3, y),
    k('Numpad7', '7', x, y + 1), k('Numpad8', '8', x + 1, y + 1), k('Numpad9', '9', x + 2, y + 1), k('NumpadAdd', '+', x + 3, y + 1, 1, 2),
    k('Numpad4', '4', x, y + 2), k('Numpad5', '5', x + 1, y + 2), k('Numpad6', '6', x + 2, y + 2),
    k('Numpad1', '1', x, y + 3), k('Numpad2', '2', x + 1, y + 3), k('Numpad3', '3', x + 2, y + 3), k('NumpadEnter', 'Enter', x + 3, y + 3, 1, 2),
    k('Numpad0', '0', x, y + 4, 2), k('NumpadDecimal', '.', x + 2, y + 4),
  ];
};

const make = (id: LayoutId, name: string, keys: KeyDef[]): Layout => ({
  id, name, keys,
  width: Math.max(...keys.map((q) => q.x + q.w)),
  height: Math.max(...keys.map((q) => q.y + q.h)),
});

export const LAYOUTS: Layout[] = [
  make('ansi-full', 'ANSI full-size', [...fnRow(), ...main(false, 1.5), ...nav(1.5), ...pad(1.5)]),
  make('ansi-tkl', 'ANSI tenkeyless', [...fnRow(), ...main(false, 1.5), ...nav(1.5)]),
  make('ansi-60', 'ANSI 60%', main(false, 0)),
  make('iso-full', 'ISO full-size', [...fnRow(), ...main(true, 1.5), ...nav(1.5), ...pad(1.5)]),
];
export const getLayout = (id: string): Layout => LAYOUTS.find((l) => l.id === id) ?? LAYOUTS[0];
/** Escape is excluded because it is the exit key for a test. */
export const guidedOrder = (l: Layout): string[] => l.keys.map((q) => q.code).filter((c) => c !== 'Escape');
