# YouTube Fullbleed Ambient

## v1.8.0 response-path hardening

Ad Shield now sanitizes YouTube playback ad payloads across more response paths before they can become visible UI. The MAIN-world guard covers both `ytInitialPlayerResponse` and `playerResponse`, handles `fetch`, `Response.json()`, `Response.text()`, and `Response.arrayBuffer()`, and recognizes player/watch/playlist playback endpoints. Existing DOM skip/seek/16x fallbacks remain in place for server-side or experimental variants that cannot be removed safely at the response layer.

## v1.7.1 YouTube ad-detection hotfix

The previous localized Skip fallback contained mojibake after a Windows encoding round-trip, so Vietnamese **Bỏ qua** could fail to match. v1.7.1 moves label matching into tested, accent-folding helpers and adds a visible generic `ytp-ad-*` plus sponsored-label fallback. Mutation-driven cleanup is also queued faster so a newly mounted ad card is shielded with less visual leakage.

## v1.7.0 AdGuard-style counters

The popup now shows **Blocked on this tab**, **Total blocked**, and a breakdown for **Network / Page / Player** handling. For unpacked development installs, the network count uses Chromium's `declarativeNetRequestFeedback` event so the counter reflects actual matches of this extension's DNR rules. Page counts track removed sponsored/ad containers and Player counts track one positively detected in-player ad episode.

A compact badge on the extension icon mirrors the current tab count (up to `999+`). Counters live in local extension storage and can be reset from the popup.

This remains a YouTube-focused blocker rather than a full general-purpose filter engine like AdGuard. It deliberately avoids broad media-host rules that could break normal YouTube playback.

## Edge error-page note

The package contains no `BRIDGE_URL`, browser-bridge command handler, or WebSocket bridge. If Edge's extension error page shows an anonymous script containing those names, that source came from an injected browser-control bridge rather than this extension package. Reloading the unpacked extension clears the stale runtime context; v1.7.0 also includes a regression test so bridge code cannot accidentally enter the package.

## v1.6.1 interactive-ad overlay fix

This patch targets the newer full-player interactive/sponsored card layout seen in 2026 YouTube experiments. Ad Shield now hides `.ytp-ad-player-overlay` and the newer `.ytp-ad-player-overlay-layout__ad-info-container` visual card without hiding the whole `.ytp-ad-module` (which would also hide the Skip control).

The skip path also recognizes newer skip-slot containers and has a localized text/ARIA fallback. In particular, a classless Vietnamese **Bỏ qua** control inside the player is clicked when YouTube positively reports an ad. Existing player-API skip, bounded seek, poster shield, and muted 16x fallback remain in place.

A lightweight Chrome/Edge Manifest V3 extension that reuses YouTube's existing player to create a full-page ambient background, a seamless transparent YouTube header, scroll docking, focus fill, and a multi-layer best-effort Ad Shield. It does not fetch a second YouTube media URL or create a second decoder.

Version 1.6.0 removes the separately rendered masthead strip and lets the real YouTube header reveal the exact same full-page ambient surface. This removes the visible topbar/content seam and also removes one extra compositor/canvas surface. Ad Shield is strengthened to hide positively detected in-player ad media immediately, remove more current ad containers, try both DOM and player-API skip paths, seek short detected ad segments to their tail, and keep the existing 16x muted fallback.

## V1.6.0 unified ambient + stronger Ad Shield

The masthead, its background layer, border, and shadow are transparent only while ambient mode is active. YouTube's native logo, search field, buttons, menus, and account controls remain in their normal DOM positions above the full-page ambient layer. There is no dedicated topbar video, no 640x64 topbar canvas, and no separate masthead relay.

The full-page live path still prefers HTMLVideoElement.captureStream() from YouTube's existing player. One captured MediaStream feeds one muted local relay surface by srcObject; the bounded low-resolution canvas + poster path remains the compatibility fallback. A heartbeat detects a stalled relay and falls back/recreates it.

AdShield remains intentionally scoped: it does not broadly block googlevideo.com, because normal YouTube content uses the same delivery infrastructure. When YouTube itself reports an in-player ad, v1.6.0 hides the ad video immediately and shows the content poster while skip/seek/fast-forward logic clears the segment. This is still best-effort because YouTube can change delivery experiments or use server-side insertion.

## V1.5.2 captureStream relay

v1.5.2 introduced the captured-MediaStream live path to avoid frozen canvas sampling on some Chromium GPU/renderer paths. v1.6.0 keeps that live full-page relay but removes the old second masthead relay/canvas.

## V1.5.1 refresh watchdog

The live-frame pipeline keeps a low-frequency timer watchdog alongside requestVideoFrameCallback, plus a 500 ms heartbeat that restarts rendering if YouTube strands scheduled draw paths during a player transition.

## V1.5 live-frame fix

The compatibility ambient path samples decoded YouTube video frames with requestVideoFrameCallback when available, with a timer fallback otherwise. A poster/thumbnail remains visible until the first real frame arrives.

## Experience

### Ambient page

The current video is sampled into a bounded low-resolution canvas and stretched behind the YouTube page. YouTube controls, recommendations, comments, navigation, and video switching remain native.

### Unified ambient header

The YouTube masthead is transparent while ambient mode is active, so it shares the exact same full-page ambient pixels as the content below. There is no independent crop, blur strip, relay, or canvas in the header; this is what removes the visible division between topbar and content.

The real YouTube logo, search box, account controls, and other masthead controls remain clickable and stay above the ambient layer.

### Normal and Theater modes

Switching between normal mode and Theater mode updates the ambient layout without replacing YouTube's player. Full-bleed/theater containers and the masthead remain transparent only while ambient mode is active, so both layouts use the same continuous background surface.

### YouTube logo

The native YouTube logo remains the primary Home control and receives a subtle accent. If a YouTube experiment temporarily removes that logo node, the extension can provide an accessible fallback home mark and remove it when the native logo returns.

### Ad Shield

Ad Shield is enabled by default and combines four best-effort layers:

1. Manifest V3 declarativeNetRequest rules block a scoped set of common advertising hosts and YouTube ad endpoints.
2. A packaged MAIN-world guard sanitizes known advertising fields from YouTube player responses before the player consumes them.
3. Cosmetic rules hide known YouTube ad slots, promoted containers, and overlays.
4. In-player handling immediately hides positively detected ad media, tries a visible Skip Ad button and the player skip API, seeks short detected ad segments to their tail when safe, and falls back to temporary muted 16x playback before restoring the user's state.

Ad Shield deliberately does **not** broadly block googlevideo.com because ordinary YouTube video delivery also uses that infrastructure. YouTube changes ad delivery frequently and may use server-side insertion or experiments that do not match these rules, so Ad Shield is best-effort rather than a guarantee that every ad will always be removed.

### Scroll Dock

With **Keep video docked** enabled, the existing YouTube player moves into a floating corner dock after you scroll past it. The same player remains interactive; no duplicate video is created.

### Calm reading mode and Glass comments

When you scroll into the reading area, ambient intensity softens automatically. Comments use one translucent panel rather than many independently blurred cards.

### Focus fill

Focus Fill expands the real YouTube player to the browser viewport. Press **Esc** to return to normal browsing.

## Performance design

- Reuses YouTube's already-decoded player. The preferred path creates one local muted full-page relay fed by the existing captured MediaStream via srcObject; there is no duplicate YouTube download or second decoder.
- Default ambient canvas fallback is approximately **484x272** at Softness 42 and 4 FPS.
- The unified header adds **0 extra canvas MP/s** and no second masthead relay/compositor surface; it simply reveals the existing full-page ambient surface.
- Softness is implemented mainly through downsampling instead of a full-resolution per-frame Gaussian blur.
- The relay path adds one local compositor/video surface; the fallback canvas path remains throttled and bounded.
- Rendering stops when hidden, paused, ended, disabled, or off a valid watch page.
- Ad acceleration uses a short-lived watchdog only while YouTube positively reports an in-player ad.
- YouTube SPA navigation and normal/theater transitions reuse observers and clean them up when inactive.

Run `npm run perf` for the current pixel-copy model. See [PERFORMANCE.md](PERFORMANCE.md) for measured VM observations and limitations.

## Install unpacked

### Chrome

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Choose **Load unpacked**.
4. Select this repository directory.
5. Open or refresh a YouTube watch page.

### Edge

1. Open `edge://extensions`.
2. Enable **Developer mode**.
3. Choose **Load unpacked**.
4. Select this repository directory.
5. Open or refresh a YouTube watch page.

After upgrading an unpacked build, reload it from the browser extensions page and refresh open YouTube tabs.

### Unpacked-install troubleshooting

The code cannot run unless the browser actually loads the unpacked extension. Current branded Chrome no longer supports relying on the old `--load-extension` development workflow; use the Extensions page with Developer mode for unpacked development. A supervised/child browser profile can disable unpacked-extension permissions. In that case the supervising account must allow extension/developer use before this project can be loaded.

## Controls

The popup contains the master enable toggle, startup mode, Scroll Dock controls, Unified ambient header toggle, Ad Shield toggle, Calm reading, Glass comments, brightness/softness, render FPS, canvas quality, Dock/undock, Focus Fill, and Reset defaults.

Keyboard shortcuts inside YouTube pages:

- `Alt+Shift+D` - dock / undock
- `Alt+Shift+A` - enable / disable ambient
- `Esc` - leave Focus Fill

## Permissions

The extension uses:

- `storage` for synchronized settings;
- `declarativeNetRequest` for scoped dynamic Ad Shield rules;
- host access to YouTube and the explicitly listed common ad hosts in `manifest.json`.

It does not request cookies, browsing history, or remote-code permissions.

## Tests

```powershell
npm test
npm run check
npm run perf
npm run audit:live -- 9295 --strict-motion --require-installed
```

For a debug-enabled local browser:

```powershell
node scripts/cdp-inject.js 9244
node scripts/cdp-ux-smoke.js 9244
node scripts/cdp-dom-audit.js 9244
```

The automated suite covers settings normalization, pixel budgets, normal/theater transitions, manifest permissions, packaged files, local-code-only checks, player-response sanitization, Ad Shield rule construction, static MAIN-world guard declaration, and icon validity.

The browser smoke checks the live masthead surface, normal/Theater transitions, native-logo controls, Scroll Dock, Focus Fill lifecycle, cosmetic ad hiding, synthetic Skip Ad handling, ad acceleration, and playback restoration. `audit:live` does not inject the extension: it audits the installed unpacked runtime through CDP, verifies source/relay clocks advance, and compares two real screenshots of the isolated background and masthead to prove visible motion on a moving video.

## Privacy

No analytics, tracking, accounts, remote scripts, or external extension services are used. Settings are stored with Chrome/Edge sync storage. Ad Shield uses only rules and packaged code contained in this repository.

## Known limitations

- YouTube frequently changes DOM, CSS, player responses, and ad delivery.
- Server-side-inserted ads can be indistinguishable from ordinary media delivery; aggressive shared-media blocking can break video playback, so this extension avoids it.
- Browser/DRM policy can prevent `captureStream()` or canvas sampling for some protected media. The extension falls back from relay to bounded canvas and finally to a static thumbnail when live capture is unavailable.
- YouTube experiments or its native miniplayer can occasionally interact with Scroll Dock layout.
- Focus Fill is an in-page viewport override, not the browser Fullscreen API.
- CPU/GPU results vary by browser, driver, VM, display scaling, source codec, and YouTube experiments.

## Files worth reading

- `content.js` - ambient/topbar rendering, normal/Theater lifecycle, SPA handling, Scroll Dock, and in-player Ad Shield logic.
- `content.css` - ambient, live masthead, normal/Theater transparency, cosmetic ad hiding, comments, focus, and dock presentation.
- `ad-rules.js` - scoped declarative network rules.
- `ad-sanitize.js` / `page-guard.js` - packaged player-response sanitization used by Ad Shield.
- `background.js` - Manifest V3 dynamic Ad Shield network-rule lifecycle and stale-tab refresh.
- `helpers.js` - settings, throttling, and geometry helpers.
- `PERFORMANCE.md` - benchmark notes and limits.
- `SECURITY.md` - permission and security posture.

## License

MIT
