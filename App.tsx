import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode, RefObject } from 'react';
import { Download, Monitor, Moon, Pause, Play, Printer, RotateCcw, SkipForward, Square, Sun, Trash2, Undo2 } from 'lucide-react';
import { LAYOUTS, getLayout, guidedOrder } from './layouts';
import type { Layout, LayoutId } from './layouts';
import { applyKey, clearLog, clearPressed, guidedCurrent, guidedDone, guidedRetry, guidedSkip, newSession, startGuided, toInfo, toggleRecheck } from './keyState';
import type { Session } from './keyState';
import { LIMITATIONS, buildReport, download, reportCSV, reportFilename, reportJSON } from './report';

const SITE = import.meta.env.VITE_SITE_URL as string | undefined;
const CONTACT = import.meta.env.VITE_CONTACT_EMAIL as string | undefined;
const AD_CLIENT = import.meta.env.VITE_ADSENSE_CLIENT as string | undefined;
const AD_SLOT = import.meta.env.VITE_ADSENSE_SLOT as string | undefined;

type Theme = 'light' | 'dark' | 'system';
const PREF_KEY = 'keycheck.prefs'; // only theme + arrangement are ever stored
const U = 44; // pixels per key unit
const ISO_ENTER = 'polygon(0 0,100% 0,100% 100%,16.67% 100%,16.67% 50%,0 50%)';
const LOC = ['Standard', 'Left', 'Right', 'Numpad'];
// Keys whose default browser action would interfere with an active test. Ctrl/Meta/Alt combos, F5, F11, F12 are never blocked.
const PREVENT = new Set(['Tab', 'Space', 'Enter', 'Backspace', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'PageUp', 'PageDown', 'Home', 'End', 'ContextMenu', 'F1', 'F3', 'F6', 'F7', 'F10', 'Slash', 'Quote']);
const HELP: [string, string][] = [
  ['Physical code', 'KeyboardEvent.code: the key’s physical position, independent of language layout.'],
  ['Interpreted key', 'KeyboardEvent.key: the character or action after layout, modifiers and input method.'],
  ['Event type', 'keydown when a key goes down, keyup when it is released.'],
  ['Location', 'Standard, left, right or numpad copy of a key.'],
  ['Repeat', 'Holding a key normally sends repeated keydown events. This is not a sign of a fault.'],
  ['Modifiers', 'Whether Shift, Ctrl, Alt or Meta (Windows or Command) was down for this event.'],
  ['Session time', 'Seconds since this session started.'],
];
const LEGEND: [string, string][] = [
  ['Not tested', 'border-line bg-card'],
  ['Currently pressed', 'border-accent bg-accent'],
  ['Released / registered', 'border-accent bg-accent/20'],
  ['Needs another check (only when you mark it)', 'border-dashed border-warn bg-card'],
];
const btn = 'inline-flex items-center gap-2 rounded-lg border border-line bg-card px-3 py-2 text-sm font-medium hover:border-accent disabled:opacity-50';
const primary = 'inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-onaccent';

const SIDES = /^(Shift|Control|Alt|Meta)(Left|Right)$/;
const pretty = (code: string, names: Map<string, string>) => {
  const n = names.get(code) ?? code;
  const m = SIDES.exec(code);
  return m ? `${m[2]} ${n}` : n;
};
const showKey = (k: string) => (k === ' ' ? '(space)' : k);

function loadPrefs(): { theme: Theme; layout: LayoutId } {
  try {
    const p = JSON.parse(localStorage.getItem(PREF_KEY) || '{}');
    return {
      theme: ['light', 'dark', 'system'].includes(p.theme) ? p.theme : 'system',
      layout: LAYOUTS.some((l) => l.id === p.layout) ? p.layout : 'ansi-full',
    };
  } catch {
    return { theme: 'system', layout: 'ansi-full' };
  }
}

/** Capture is suspended while ordinary inputs or dialogs need the keyboard. */
function suspended(t: EventTarget | null) {
  const el = t as HTMLElement | null;
  const typing = !!el && (['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName) || el.isContentEditable);
  return typing || !!document.querySelector('dialog[open], [role="dialog"]');
}

const Card = ({ title, children }: { title: string; children: ReactNode }) => (
  <section className="rounded-xl border border-line bg-card p-4">
    <h3 className="mb-2 text-sm font-semibold">{title}</h3>
    {children}
  </section>
);

function AdSlot() {
  useEffect(() => {
    if (!AD_CLIENT || !AD_SLOT) return;
    if (!document.querySelector('script[data-keycheck-ads]')) {
      const sc = document.createElement('script');
      sc.async = true;
      sc.crossOrigin = 'anonymous';
      sc.dataset.keycheckAds = '1';
      sc.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(AD_CLIENT)}`;
      document.head.append(sc);
    }
    try {
      const w = window as any;
      (w.adsbygoogle = w.adsbygoogle || []).push({});
    } catch { /* ads are optional */ }
  }, []);
  if (!AD_CLIENT || !AD_SLOT) {
    return import.meta.env.DEV ? (
      <div className="my-8 rounded-lg border border-dashed border-line p-4 text-center text-xs text-muted">Development placeholder: ad slot (no publisher ID configured, nothing loaded)</div>
    ) : null;
  }
  return (
    <aside aria-label="Advertisement" className="my-8">
      <p className="text-xs text-muted">Advertisement</p>
      <ins className="adsbygoogle" style={{ display: 'block' }} data-ad-client={AD_CLIENT} data-ad-slot={AD_SLOT} data-ad-format="auto" data-full-width-responsive="true" />
    </aside>
  );
}

function Keyboard({ layout, s, target, onTouch, areaRef }: { layout: Layout; s: Session; target: string | null; onTouch: (c: string) => void; areaRef: RefObject<HTMLDivElement> }) {
  const regCount = layout.keys.filter((q) => s.registered.includes(q.code)).length;
  return (
    <div ref={areaRef} tabIndex={0} role="group" aria-label={`Keyboard diagram, ${layout.name}. ${regCount} of ${layout.keys.length} keys registered.`} className="max-w-full overflow-x-auto rounded-xl border border-line bg-bg p-3">
      <div className="relative" style={{ width: layout.width * U, height: layout.height * U }}>
        {layout.keys.map((q) => {
          const down = s.pressed.includes(q.code);
          const reg = s.registered.includes(q.code);
          const re = s.recheck.includes(q.code);
          const border = re ? 'border-dashed border-warn' : down || reg ? 'border-accent' : 'border-line';
          const fill = down ? 'bg-accent text-onaccent translate-y-[2px]' : reg ? 'bg-accent/20' : 'bg-card';
          return (
            <div
              key={q.code}
              data-code={q.code}
              title={q.code}
              onClick={() => onTouch(q.code)}
              style={{ left: q.x * U + 2, top: q.y * U + 2, width: q.w * U - 4, height: q.h * U - 4, clipPath: q.shape === 'iso-enter' ? ISO_ENTER : undefined }}
              className={`absolute flex select-none items-center justify-center rounded-md border text-[11px] leading-tight shadow-[0_2px_0_var(--line)] motion-safe:transition-transform ${border} ${fill} ${target === q.code ? 'outline outline-2 outline-offset-2 outline-fg motion-safe:animate-pulse' : ''}`}
            >
              {q.label}
              {re && <span className="absolute right-1 top-0 text-warn" aria-hidden>!</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Tester() {
  const init = useMemo(loadPrefs, []);
  const [theme, setTheme] = useState<Theme>(init.theme);
  const [layoutId, setLayoutId] = useState<LayoutId>(init.layout);
  const [s, setS] = useState<Session>(newSession);
  const [active, setActive] = useState(false);
  const [paused, setPaused] = useState(false);
  const [touched, setTouched] = useState<string | null>(null);
  const [msg, setMsg] = useState('');
  const base = useRef(0);
  const pausedRef = useRef(false);
  const area = useRef<HTMLDivElement>(null);
  pausedRef.current = paused;

  const layout = getLayout(layoutId);
  const names = useMemo(() => new Map<string, string>(layout.keys.map((q) => [q.code, q.label] as [string, string])), [layout]);
  const name = (c: string) => pretty(c, names);

  useEffect(() => {
    const mq = matchMedia('(prefers-color-scheme: dark)');
    const apply = () => document.documentElement.classList.toggle('dark', theme === 'dark' || (theme === 'system' && mq.matches));
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [theme]);
  useEffect(() => {
    try { localStorage.setItem(PREF_KEY, JSON.stringify({ theme, layout: layoutId })); } catch { /* preferences are optional */ }
  }, [theme, layoutId]);

  const endTest = useCallback(() => {
    setActive(false);
    setS(clearPressed);
    setMsg('Testing ended. Normal keyboard navigation is restored and your results are kept.');
  }, []);
  const startTest = () => {
    if (!s.wall) {
      base.current = performance.now();
      setS((p) => ({ ...p, wall: Date.now() }));
    }
    setActive(true);
    setMsg('Testing started. Keyboard events on this page are now captured. Press Escape or choose End test to exit.');
    setTimeout(() => area.current?.focus(), 0);
  };

  useEffect(() => {
    if (!active) return;
    const handle = (e: KeyboardEvent) => {
      if (suspended(e.target)) return;
      if (e.type === 'keydown' && !(e.ctrlKey || e.metaKey || e.altKey) && PREVENT.has(e.code)) e.preventDefault();
      const info = toInfo(e, base.current);
      const logOn = !pausedRef.current;
      const locks = { caps: e.getModifierState('CapsLock'), num: e.getModifierState('NumLock') };
      setS((p) => applyKey(p, info, logOn, locks));
      if (info.type === 'keydown' && e.code === 'Escape') endTest(); // Escape is registered, then exits
    };
    const clear = () => setS(clearPressed);
    const vis = () => { if (document.hidden) clear(); };
    window.addEventListener('keydown', handle);
    window.addEventListener('keyup', handle);
    window.addEventListener('blur', clear);
    document.addEventListener('visibilitychange', vis);
    return () => {
      window.removeEventListener('keydown', handle);
      window.removeEventListener('keyup', handle);
      window.removeEventListener('blur', clear);
      document.removeEventListener('visibilitychange', vis);
    };
  }, [active, endTest]);

  const pickLayout = (id: LayoutId) => {
    setLayoutId(id);
    setS((p) => (p.guided ? { ...p, guided: null } : p));
  };
  const reset = () => {
    base.current = performance.now();
    setS(active ? { ...newSession(), wall: Date.now() } : newSession());
    setTouched(null);
    setMsg('Session reset. Registered keys, log and guided progress were cleared.');
  };
  const dl = (ext: 'json' | 'csv') => {
    const r = buildReport(s, layout);
    download(reportFilename(ext), ext === 'json' ? reportJSON(r) : reportCSV(r), ext === 'json' ? 'application/json' : 'text/csv');
    setMsg(`Report saved as ${ext.toUpperCase()}. It was created in your browser and not uploaded.`);
  };
  const beginGuided = () => {
    setS((p) => startGuided(p, guidedOrder(layout)));
    if (!active) startTest();
  };

  const last = s.last;
  const vals = last
    ? [last.code, showKey(last.key), last.type, LOC[last.location] ?? String(last.location), last.repeat ? 'yes' : 'no',
       [last.shift && 'Shift', last.ctrl && 'Ctrl', last.alt && 'Alt', last.meta && 'Meta'].filter(Boolean).join(' + ') || 'none', `${(last.t / 1000).toFixed(2)} s`]
    : [];
  const g = s.guided;
  const cur = guidedCurrent(s);
  const gDone = guidedDone(s);
  const gReg = g ? g.order.filter((c) => s.registered.includes(c)).length : 0;
  const gSkip = g ? g.order.filter((c) => s.skipped.includes(c)).length : 0;
  const rep = buildReport(s, layout);

  return (
    <>
      <div className="no-print min-h-screen">
        <header className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-4">
          <a href="/" className="flex items-center gap-2 text-lg font-semibold">
            <img src="/favicon.svg" alt="" width={28} height={28} />
            KeyCheck
            <span className="hidden text-xs font-normal text-muted sm:inline">A Time Fusions mini app</span>
          </a>
          <div role="group" aria-label="Theme" className="flex gap-1">
            {(['light', 'dark', 'system'] as Theme[]).map((t) => (
              <button key={t} aria-pressed={theme === t} aria-label={`${t} theme`} onClick={() => setTheme(t)} className={`${btn} px-2 ${theme === t ? 'border-accent bg-accent/10' : ''}`}>
                {t === 'light' ? <Sun size={16} /> : t === 'dark' ? <Moon size={16} /> : <Monitor size={16} />}
              </button>
            ))}
          </div>
        </header>

        <main className="mx-auto max-w-6xl px-4 pb-16">
          <section className="py-6">
            <h1 className="font-display text-4xl tracking-tight sm:text-5xl">Every key. Clearly checked.</h1>
            <p className="mt-3 max-w-2xl text-lg text-muted">Press your keyboard keys and see which inputs reach your browser. Free, private, and ready to use.</p>
            <p className="mt-3 max-w-3xl text-sm text-muted">{LIMITATIONS}</p>
            <p className="mt-1 max-w-3xl text-sm text-muted">Your keyboard test stays in this browser. Key events are not uploaded or saved after you reset or close the page. Do not type passwords or sensitive information into the tester.</p>
          </section>

          <section aria-label="Keyboard tester" className="rounded-2xl border border-line bg-card/60 p-4 sm:p-6">
            <div className="flex flex-wrap items-center gap-2">
              <div role="group" aria-label="Keyboard arrangement" className="flex flex-wrap gap-1">
                {LAYOUTS.map((l) => (
                  <button key={l.id} aria-pressed={l.id === layoutId} onClick={() => pickLayout(l.id)} className={`${btn} ${l.id === layoutId ? 'border-accent bg-accent/10' : ''}`}>{l.name}</button>
                ))}
              </div>
              <div className="ml-auto">
                {active ? (
                  <button className={primary} onClick={endTest}><Square size={16} />End test</button>
                ) : (
                  <button className={primary} onClick={startTest}><Play size={16} />Start keyboard test</button>
                )}
              </div>
            </div>
            <p className="mt-2 text-xs text-muted">Labels: English (US). The arrangement sets key shapes only; the details panel always shows the actual key value your browser receives. KeyCheck cannot detect your keyboard model or layout.</p>
            <p className="mt-2 text-sm text-muted md:hidden">A physical keyboard is needed for a meaningful test. Scroll the diagram sideways to see every key.</p>
            <p role="status" aria-live="polite" className="sr-only">{msg}</p>
            {active && (
              <p className="mt-3 rounded-lg border border-accent bg-accent/10 p-3 text-sm">
                <strong>Testing is active.</strong> Key events on this page are being captured. Press Esc (registered, then ends the test) or choose End test to leave. Browser shortcuts such as refresh still work.
              </p>
            )}
            <div className="mt-4">
              <Keyboard layout={layout} s={s} target={active ? cur : null} onTouch={setTouched} areaRef={area} />
            </div>
            <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs">
              {LEGEND.map(([t, cls]) => (
                <li key={t} className="flex items-center gap-2"><span className={`inline-block h-4 w-6 rounded border ${cls}`} />{t}</li>
              ))}
            </ul>
            <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
              <label>
                Review a key{' '}
                <select value={touched ?? ''} onChange={(e) => setTouched(e.target.value || null)} className="rounded-md border border-line bg-card px-2 py-1">
                  <option value="">Choose…</option>
                  {layout.keys.map((q) => <option key={q.code} value={q.code}>{name(q.code)} ({q.code})</option>)}
                </select>
              </label>
              {touched && (
                <span role="status">
                  On-screen key <b>{name(touched)}</b>. Touching or clicking a drawn key never counts as a test; press the physical key.{' '}
                  <button className="underline" onClick={() => setS((p) => toggleRecheck(p, touched))}>
                    {s.recheck.includes(touched) ? 'Clear the “needs another check” mark' : 'Mark as needs another check'}
                  </button>
                </span>
              )}
            </div>

            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <Card title="Latest event">
                {last ? (
                  <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
                    {HELP.map(([k, tip], i) => (
                      <div key={k} className="contents">
                        <dt className="text-muted" title={tip}>{k}</dt>
                        <dd className="font-mono" title={tip}>{vals[i]}</dd>
                      </div>
                    ))}
                  </dl>
                ) : (
                  <p className="text-sm text-muted">No events received yet. Start the test and press a key.</p>
                )}
                {s.locks && <p className="mt-2 text-xs text-muted">As reported by your browser: Caps Lock {s.locks.caps ? 'on' : 'off'}, Num Lock {s.locks.num ? 'on' : 'off'}.</p>}
                <details className="mt-2 text-sm">
                  <summary className="cursor-pointer">What do these fields mean?</summary>
                  <ul className="mt-1 list-disc pl-5 text-muted">{HELP.map(([k, tip]) => <li key={k}><b>{k}:</b> {tip}</li>)}</ul>
                </details>
              </Card>

              <Card title="Observed combination test">
                <p className="min-h-6 font-mono text-sm">{s.pressed.length ? s.pressed.map(name).join(' + ') : 'No keys held'}</p>
                <p className="mt-1 text-sm">Held now: <b>{s.pressed.length}</b>. Most at once this session: <b>{s.maxSimul}</b>. Repeat events: <b>{s.repeats}</b> (normal when you hold a key).</p>
                <p className="mt-2 text-xs text-muted">Try Shift + A or Ctrl + Shift. Browser or OS interception can change what arrives. This does not measure rollover, ghosting or hardware scanning.</p>
              </Card>

              <Card title="Guided test">
                {!g ? (
                  <>
                    <p className="text-sm text-muted">Highlights one key at a time. Escape is left out because it exits the test. Some keys (Fn, media, Print Screen, system shortcuts) may never reach a web page, so Skip is expected.</p>
                    <button className={`${btn} mt-2`} onClick={beginGuided}><Play size={16} />Start guided test</button>
                  </>
                ) : (
                  <>
                    <p className="text-sm">{gDone ? 'Guided pass finished.' : <>Press <b>{name(cur ?? '')}</b> ({cur})</>}</p>
                    <progress className="mt-2 w-full" value={gReg} max={g.order.length} aria-label="Guided progress" />
                    <p className="text-sm text-muted">{gReg} of {g.order.length} registered. {gSkip} skipped (not registered in this test). {g.order.length - gReg - gSkip} remaining.</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button className={btn} onClick={() => setS(guidedSkip)} disabled={gDone}><SkipForward size={16} />Skip</button>
                      <button className={btn} onClick={() => setS(guidedRetry)} disabled={gSkip === 0}><Undo2 size={16} />Retry last skipped</button>
                      <button className={btn} onClick={() => setS((p) => ({ ...p, guided: null }))}>Exit guided</button>
                    </div>
                  </>
                )}
              </Card>

              <Card title="Event log">
                <div className="mb-2 flex flex-wrap gap-2">
                  <button className={btn} onClick={() => setPaused((v) => !v)} aria-pressed={paused}><Pause size={16} />{paused ? 'Resume log' : 'Pause log'}</button>
                  <button className={btn} onClick={() => setS(clearLog)}><Trash2 size={16} />Clear log</button>
                </div>
                <ol className="max-h-44 overflow-y-auto text-xs">
                  {s.log.length === 0 && <li className="text-muted">No logged events. Showing the latest {100} at most; repeats are counted, not listed.</li>}
                  {[...s.log].reverse().map((e, i) => (
                    <li key={i} className="font-mono">{(e.t / 1000).toFixed(2)}s {e.type} {e.code} “{showKey(e.key)}”</li>
                  ))}
                </ol>
              </Card>
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
              <button className={btn} onClick={reset}><RotateCcw size={16} />Reset session</button>
              <button className={btn} onClick={() => dl('json')}><Download size={16} />Download JSON</button>
              <button className={btn} onClick={() => dl('csv')}><Download size={16} />Download CSV</button>
              <button className={btn} onClick={() => window.print()}><Printer size={16} />Print summary</button>
            </div>
          </section>

          <div className="mx-auto mt-12 max-w-3xl space-y-8 [&_h2]:font-display [&_h2]:text-2xl [&_p]:mt-2 [&_p]:leading-relaxed [&_p]:text-muted [&_li]:mt-1 [&_li]:text-muted">
            <section>
              <h2>How to test your keyboard</h2>
              <ol className="mt-2 list-decimal pl-5">
                <li>Choose the arrangement that matches the shape of your keyboard.</li>
                <li>Select Start keyboard test, then press keys. A key is solid while held and tinted once released.</li>
                <li>Hold several keys together to see which events arrive together.</li>
                <li>Reset, or download a report saved on your own device.</li>
              </ol>
            </section>
            <section>
              <h2>Why a key might not register</h2>
              <ul className="mt-2 list-disc pl-5">
                <li>The browser or operating system handled it first, as with shortcuts and Print Screen.</li>
                <li>Fn, media and power keys are often handled by keyboard firmware and never reach a page.</li>
                <li>Remapping software, game mode or an input method can change what is sent.</li>
                <li>A loose cable, weak wireless battery or dirt can cause missed input. If a key is also missing in other apps, check the manufacturer’s support guidance.</li>
              </ul>
            </section>
            <AdSlot />
            <section>
              <h2>Physical positions and language layouts</h2>
              <p>KeyCheck highlights keys by <code>KeyboardEvent.code</code>, the physical position. It shows <code>KeyboardEvent.key</code> separately, the character or action your layout produces. On a French or German layout the printed character can differ from the English label shown here, and dead keys may report “Dead”.</p>
            </section>
            <section>
              <h2>Why Fn and system shortcuts behave differently</h2>
              <p>Fn usually changes keyboard firmware behaviour before the computer sees a key. Shortcuts like Alt + Tab or Cmd + Space belong to the operating system, and Ctrl/Cmd + W, T or R belong to the browser. KeyCheck does not block them.</p>
            </section>
            <section>
              <h2>What this test can and cannot tell you</h2>
              <p>It can show which keyboard events your browser received. It cannot diagnose hardware faults, measure n-key rollover, ghosting or scan rate, or see events the operating system keeps. A key with no event is “not registered in this test”, never “broken”.</p>
            </section>
            <section>
              <h2>FAQ</h2>
              <details className="mt-2"><summary className="cursor-pointer">Is my typing sent anywhere?</summary><p>No. Events stay in memory in this tab and are only captured while a test is active.</p></details>
              <details className="mt-2"><summary className="cursor-pointer">Why does holding a key repeat?</summary><p>Auto-repeat is normal operating-system behaviour and is not a sign of a faulty switch.</p></details>
              <details className="mt-2"><summary className="cursor-pointer">Why didn’t a key light up?</summary><p>See the limitations above. Try it in another app, and try again here.</p></details>
              <details className="mt-2"><summary className="cursor-pointer">Can I use a phone?</summary><p>Touching the drawn keys never registers anything. Attach a physical keyboard to test it.</p></details>
            </section>
          </div>
        </main>

        <footer className="mx-auto max-w-6xl border-t border-line px-4 py-6 text-sm text-muted">
          <nav aria-label="Legal" className="flex flex-wrap gap-4">
            <a className="underline" href="/privacy">Privacy Policy</a>
            <a className="underline" href="/terms">Terms of Use</a>
            <a className="underline" href="/contact">Contact</a>
          </nav>
        </footer>
      </div>

      <section className="print-only p-6">
        <h1 style={{ fontSize: 24 }}>KeyCheck summary</h1>
        <p>{rep.notice}</p>
        <p>Arrangement: {rep.arrangement}. Started: {rep.sessionStart ?? 'n/a'}. Duration: {rep.durationSeconds}s. Max simultaneous keys: {rep.maxSimultaneousKeys}.</p>
        <p><b>Registered ({rep.registeredCodes.length}):</b> {rep.registeredCodes.join(', ') || 'none'}</p>
        <p><b>Skipped:</b> {rep.skipped.join(', ') || 'none'}</p>
        <p><b>Not registered in this test:</b> {rep.notRegisteredInThisTest.join(', ') || 'none'}</p>
        <p><b>Marked as needs another check:</b> {rep.needsAnotherCheck.join(', ') || 'none'}</p>
      </section>
    </>
  );
}

const LEGAL: Record<string, { title: string; body: string[] }> = {
  '/privacy': {
    title: 'Privacy Policy',
    body: [
      'Your keyboard test stays in this browser. Key events are not uploaded or saved after you reset or close the page.',
      'KeyCheck keeps events in memory only while a test is active. It stores two harmless preferences in your browser, your theme and your selected keyboard arrangement, and nothing else.',
      'This site includes no analytics. If the site owner has configured display ads, the ad provider may set its own cookies. Ads appear only in the information section and never receive key data.',
      'Do not type passwords or other sensitive information into the tester.',
    ],
  },
  '/terms': {
    title: 'Terms of Use',
    body: [
      'KeyCheck is provided free and as is, without warranty of any kind.',
      'Results show only the keyboard events your browser received. They are not a hardware diagnosis or certification, and you use them at your own discretion.',
    ],
  },
  '/contact': {
    title: 'Contact',
    body: [CONTACT ? `Email: ${CONTACT}` : 'Contact details have not been configured for this deployment. The site owner can set VITE_CONTACT_EMAIL to show an address here.'],
  },
};

function Legal({ path }: { path: string }) {
  const p = LEGAL[path];
  useEffect(() => {
    document.title = `${p.title} | KeyCheck`;
    const l = document.querySelector('link[rel=canonical]');
    if (l && SITE) l.setAttribute('href', SITE.replace(/\/+$/, '') + path);
  }, [p, path]);
  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <a href="/" className="text-sm underline">Back to KeyCheck</a>
      <h1 className="mt-6 font-display text-4xl">{p.title}</h1>
      {p.body.map((t) => <p key={t} className="mt-4 text-muted">{t}</p>)}
    </main>
  );
}

export default function App() {
  const path = window.location.pathname.replace(/\/+$/, '');
  return LEGAL[path] ? <Legal path={path} /> : <Tester />;
}
