import type { Layout } from './layouts';
import type { Session } from './keyState';

export const LIMITATIONS =
  'KeyCheck shows the keyboard events your browser receives. Some keys and shortcuts are handled by your browser or operating system.';
const NOT_CERT = 'A registered event means the browser received that input. This report is not a hardware certification.';

export function buildReport(s: Session, layout: Layout, endedAt = Date.now()) {
  const untested = layout.keys.map((q) => q.code).filter((c) => !s.registered.includes(c) && !s.skipped.includes(c));
  return {
    tool: 'KeyCheck',
    notice: `${LIMITATIONS} ${NOT_CERT}`,
    arrangement: layout.name,
    sessionStart: s.wall === null ? null : new Date(s.wall).toISOString(),
    durationSeconds: s.wall === null ? 0 : Math.max(0, Math.round((endedAt - s.wall) / 1000)),
    registeredCodes: [...s.registered],
    notRegisteredInThisTest: untested,
    skipped: [...s.skipped],
    needsAnotherCheck: [...s.recheck],
    maxSimultaneousKeys: s.maxSimul,
  };
}
export type Report = ReturnType<typeof buildReport>;

export const reportJSON = (r: Report) => JSON.stringify(r, null, 2);

const q = (v: string) => `"${v.replace(/"/g, '""')}"`;
export function reportCSV(r: Report): string {
  const rows: string[][] = [
    ...r.registeredCodes.map((c) => [c, 'registered']),
    ...r.skipped.map((c) => [c, 'skipped']),
    ...r.notRegisteredInThisTest.map((c) => [c, 'not registered in this test']),
  ];
  return [
    `# KeyCheck report. Arrangement: ${r.arrangement}. Start: ${r.sessionStart ?? 'n/a'}. Duration: ${r.durationSeconds}s. Max simultaneous keys: ${r.maxSimultaneousKeys}.`,
    `# ${r.notice}`,
    'code,status,needs_another_check',
    ...rows.map(([c, st]) => `${q(c)},${st},${r.needsAnotherCheck.includes(c)}`),
  ].join('\n');
}

export const reportFilename = (ext: 'json' | 'csv', d = new Date()) =>
  `keycheck-report-${d.toISOString().slice(0, 16).replace(/[-:T]/g, '')}.${ext}`;

/** Creates a local file from text; the temporary object URL is revoked afterwards. */
export function download(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
