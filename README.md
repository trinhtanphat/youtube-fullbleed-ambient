# YouTube Fullbleed Ambient

A lightweight Chrome/Edge Manifest V3 extension that reuses YouTube's existing player to create a full-page ambient background, a live-video masthead, scroll docking, focus fill, and a best-effort Ad Shield. It does not create a second video stream or decoder.

Version 1.5 adds explicit support for YouTube normal and Theater layouts, a stronger live-video topbar, and a multi-layer Ad Shield with a packaged MAIN-world player-response guard.

## v1.5 live-frame fix

The ambient page and masthead now sample decoded YouTube video frames directly with `requestVideoFrameCallback` when the browser supports it, with a timer fallback otherwise. A poster/thumbnail remains visible until the first real frame arrives, so paused/autoplay-blocked pages no longer look blank. Normal and Theater mode share the same frame pipeline.

## Experience

### Ambient page

The current video is sampled into a bounded low-resolution canvas and stretched behind the YouTube page. YouTube controls, recommendations, comments, navigation, and video switching remain native.

### Live-video topbar

The masthead receives a separate **640x64** canvas sampled from the currently playing video at roughly **2 FPS**. CSS enlarges, blurs, darkens, and saturates that tiny surface behind YouTube's real topbar controls.

The topbar canvas has pointer events disabled. The real YouTube logo, search box, account controls, and other masthead controls stay above it and remain clickable. This is a visual sample of the existing video, not another media element or decoder.

### Normal and Theater modes

Version 1.5 observes YouTube's native watch-layout attributes. Switching between normal mode and Theater mode updates the ambient layout without replacing YouTube's player. Full-bleed/theater containers become transparent only while ambient mode is active, and the live-video topbar stays attached through the transition.

### YouTube logo

The native YouTube logo remains the primary Home control and receives a subtle accent. If a YouTube experiment temporarily removes that logo node, the extension can provide an accessible fallback home mark and remove it when the native logo returns.

### Ad Shield

Ad Shield is enabled by default and combines four best-effort layers:

1. Manifest V3 declarativeNetRequest rules block a scoped set of common advertising hosts and YouTube ad endpoints.
2. A packaged MAIN-world guard sanitizes known advertising fields from YouTube player responses before the player consumes them.
3. Cosmetic rules hide known YouTube ad slots, promoted containers, and overlays.
4. In-player handling clicks a visible Skip Ad control when available; otherwise it can temporarily mute/accelerate a positively detected ad and restore playback state when the ad ends.

Ad Shield deliberately does **not** broadly block googlevideo.com because ordinary YouTube video delivery also uses that infrastructure. YouTube changes ad delivery frequently and may use server-side insertion or experiments that do not match these rules, so Ad Shield is best-effort rather than a guarantee that every ad will always be removed.

### Scroll Dock

With **Keep video docked** enabled, the existing YouTube player moves into a floating corner dock after you scroll past it. The same player remains interactive; no duplicate video is created.

### Calm reading mode and Glass comments

When you scroll into the reading area, ambient intensity softens automatically. Comments use one translucent panel rather than many independently blurred cards.

### Focus fill

Focus Fill expands the real YouTube player to the browser viewport. Press **Esc** to return to normal browsing.

## Performance design

- Reuses YouTube's existing video element: no duplicate stream or decoder.
- Default ambient canvas is approximately **484x272** at Softness 42 and 4 FPS.
- Live-video topbar is **640x64 at about 2 FPS**, roughly **0.035 MP/s** of extra canvas copying.
- Softness is implemented mainly through downsampling instead of a full-resolution per-frame Gaussian blur.
- Topbar sampling piggybacks on the ambient render loop instead of adding another continuous animation loop.
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

The popup contains the master enable toggle, startup mode, Scroll Dock controls, Live-video topbar toggle, Ad Shield toggle, Calm reading, Glass comments, brightness/softness, render FPS, canvas quality, Dock/undock, Focus Fill, and Reset defaults.

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
```

For a debug-enabled local browser:

```powershell
node scripts/cdp-inject.js 9244
node scripts/cdp-ux-smoke.js 9244
node scripts/cdp-dom-audit.js 9244
```

The automated suite covers settings normalization, pixel budgets, normal/theater transitions, manifest permissions, packaged files, local-code-only checks, player-response sanitization, Ad Shield rule construction, static MAIN-world guard declaration, and icon validity.

The browser smoke checks the live masthead surface, normal/Theater transitions, native-logo controls, Scroll Dock, Focus Fill lifecycle, cosmetic ad hiding, synthetic Skip Ad handling, ad acceleration, and playback restoration.

## Privacy

No analytics, tracking, accounts, remote scripts, or external extension services are used. Settings are stored with Chrome/Edge sync storage. Ad Shield uses only rules and packaged code contained in this repository.

## Known limitations

- YouTube frequently changes DOM, CSS, player responses, and ad delivery.
- Server-side-inserted ads can be indistinguishable from ordinary media delivery; aggressive shared-media blocking can break video playback, so this extension avoids it.
- Browser/DRM policy can prevent canvas frame capture for some protected media; the ambient layer can fall back to a static thumbnail.
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
