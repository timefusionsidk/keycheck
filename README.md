# KeyCheck

Free, in-browser keyboard tester (React + TypeScript + Vite + Tailwind CSS v4). Part of the Time Fusions mini web app family. No backend, database, analytics or account.

## Setup
```
npm install        # also creates package-lock.json; commit it
npm run dev
npm run typecheck && npm test
npm run build && npm run preview
```

## Deploy to Vercel
Import the repo; Vercel detects Vite (build `npm run build`, output `dist`). `vercel.json` rewrites unknown paths to `index.html` so `/privacy`, `/terms`, `/contact` work. Optional environment variables are listed in `.env.example`. If `VITE_SITE_URL` is set, the build adds a canonical URL, `og:url`, `sitemap.xml` and a Sitemap line in `robots.txt`; otherwise it ships none, so no placeholder domain is published.

## Privacy
Key events are captured only while a test is active, kept in React state, and never written to storage or sent anywhere. Only `theme` and the selected arrangement are saved in `localStorage` (`keycheck.prefs`). Capture is suspended for inputs, selects, textareas and open dialogs. Reports are created locally with a Blob and the object URL is revoked afterwards. No analytics are included.

## Layouts
`src/layouts.ts` defines ANSI full-size, ANSI tenkeyless, ANSI 60% and ISO full-size from structured row data (positions and widths in key units, with the ISO L-shaped Enter). Keys are matched by `KeyboardEvent.code`; `KeyboardEvent.key` is shown separately. Labels are English (US); KeyCheck does not detect your keyboard model or layout.

## Browser limitations
KeyCheck shows the keyboard events your browser receives. Fn, media and power keys, Print Screen and many OS or browser shortcuts may never arrive. While a test is active it calls `preventDefault()` only on Tab, Space, Enter, Backspace, arrows, Page/Home/End, Menu, F1/F3/F6/F7/F10 and `/` `'` (without Ctrl/Meta/Alt), and never blocks refresh, closing the tab or Ctrl/Cmd shortcuts. Escape is registered and then ends the test; the End test button always works. The Keyboard Lock API is not used. Results are not a hardware certification and do not measure rollover or ghosting.

## Optional ads
Set `VITE_ADSENSE_CLIENT` and `VITE_ADSENSE_SLOT` to load one display slot inside the information section. With them unset nothing loads (development builds show a labelled placeholder).

## Verification
Automated (`npm test`): event state, left/right modifiers, repeats, simultaneous keys, blur, log cap and pause, guided correct/skip/retry, layout integrity, report JSON/CSV contents.
Manual, on real hardware (synthetic events cannot cover OS interception): modifiers and numpad on your keyboard; blur and tab switching clear held keys; touching keycaps never registers; Tab/Space/arrows during a test and Escape exit; input fields and dialogs suspend capture; JSON/CSV downloads; print dialog; narrow-width layout; ads-disabled mode; DevTools Network tab shows no requests while typing.
