# YouTube Fullbleed Ambient

A lightweight Chrome/Edge Manifest V3 extension that turns the currently playing YouTube video into an ambient full-page experience while reusing YouTube's existing video element. It does not create a second video decoder.

Version 1.3 adds a live-video masthead effect and Ad Shield on top of the existing Ambient Page, Scroll Dock, Calm Reading, Glass Comments, Focus Fill, and native YouTube logo treatment.

## Experience

### Ambient page

The current video is sampled into one low-resolution canvas and stretched behind the YouTube page. YouTube controls, recommendations, comments, navigation, and video switching stay native.

### Live-video topbar

The top bar now receives its own tiny **384x24** canvas sampled from the currently playing video at roughly **2 FPS**. It is enlarged, blurred, darkened, and saturated behind YouTube's real masthead controls.

The topbar canvas has pointer-events disabled, while the real YouTube masthead, search, profile controls, and logo stay above it and remain clickable. This is a visual sample of the existing video, not another stream or decoder.

### YouTube masthead + logo

The native YouTube logo remains the primary home button and receives a subtle red accent. If a YouTube experiment temporarily removes that logo node, the extension provides a small accessible fallback home mark and removes it automatically when the native logo returns.

### Ad Shield

Ad Shield is enabled by default and combines three best-effort layers:

1. Manifest V3 declarativeNetRequest rules block a small set of common advertising hosts and YouTube ad endpoints.
2. Cosmetic rules hide known YouTube ad slots and overlay containers.
3. In-player handling clicks a visible Skip Ad control when available; otherwise it temporarily mutes and accelerates the detected ad, then restores the previous playback speed and mute state when the ad ends.

Ad Shield deliberately does **not** broadly block googlevideo.com, because normal YouTube video delivery also uses that infrastructure.

YouTube changes ad delivery frequently and may use server-side insertion or experiments that do not match these rules. Ad Shield should therefore be treated as best-effort rather than a guarantee that every ad will always be removed.

### Scroll Dock

With **Keep video docked** enabled, the existing YouTube player moves into a floating corner dock after you scroll past it. You can keep watching while reading comments, continue using YouTube's normal controls, choose Small / Medium / Large dock sizes, and use Alt+Shift+D to dock or undock immediately.

No duplicate video element is created.

### Calm reading mode and Glass comments

When you scroll into the reading area, ambient intensity softens automatically. Comments sit on one translucent panel instead of many independently blurred cards, keeping text readable while avoiding expensive blur work on each comment row.

### Focus fill

Focus Fill expands the real YouTube player to the browser viewport. Press Esc to return to normal browsing.

## Performance design

- Reuses the existing YouTube video element; no duplicate network stream or decoder.
- Default ambient canvas is approximately **484x272** at Softness 42 and 4 FPS.
- Live-video topbar uses only **384x24 at about 2 FPS**, roughly **0.018 MP/s** of extra canvas copying.
- Softness is implemented mainly through downsampling instead of running a full-resolution Gaussian blur on every video frame.
- Rendering stops when the tab is hidden, the video is paused/ended, the extension is disabled, or the page leaves a valid YouTube watch URL.
- Topbar sampling piggybacks on the existing ambient render loop rather than adding another continuous animation loop.
- Ad acceleration uses a temporary watchdog only while YouTube reports an in-player ad and is stopped/restored immediately when that state ends.
- YouTube SPA navigation reuses observers and tears them down when the feature is inactive.

Run npm run perf for the current pixel-copy model. See PERFORMANCE.md for measured VM observations and limitations.

## Install unpacked

### Chrome

1. Open chrome://extensions.
2. Enable **Developer mode**.
3. Choose **Load unpacked**.
4. Select this repository directory.
5. Open or refresh a YouTube watch page.

### Edge

1. Open edge://extensions.
2. Enable **Developer mode**.
3. Choose **Load unpacked**.
4. Select this repository directory.
5. Open or refresh a YouTube watch page.

After upgrading from v1.2, use **Reload** on the extension card because v1.3 adds a Manifest V3 background service worker and new scoped host permissions for Ad Shield.

## Controls

The popup contains:

- master enable toggle;
- Ambient or Focus-fill startup mode;
- Scroll Dock on/off and dock size;
- Live-video topbar on/off;
- Ad Shield on/off;
- Calm reading mode;
- Glass comments;
- brightness and softness;
- 2 / 4 / 6 / 10 FPS;
- Low / Medium / High ambient canvas budget;
- Dock / undock button;
- Focus Fill button;
- Reset defaults.

Keyboard shortcuts inside YouTube pages:

- Alt+Shift+D - dock / undock;
- Alt+Shift+A - enable / disable ambient;
- Esc - leave Focus Fill.

## Permissions

The extension uses:

- storage for synchronized settings;
- declarativeNetRequest for the small dynamic Ad Shield rule set;
- host access to YouTube and the explicitly listed common ad hosts in manifest.json.

It does not request tabs, activeTab, cookies, webRequest, browsing history, or remote-code permissions.

## Tests

Run:

- npm test
- npm run check
- npm run perf

For a local browser already exposing a CDP debugging port:

- node scripts/cdp-inject.js 9244
- node scripts/cdp-ux-smoke.js 9244
- node scripts/cdp-dom-audit.js 9244

The automated suite covers settings normalization, pixel budgets, scroll behavior, manifest permissions, packaged files, local-code-only checks, Ad Shield rule construction, service-worker enable/disable behavior, and icon validity.

The browser smoke/audit checks the live masthead canvas, native-logo click target, fallback-logo recovery, Scroll Dock, Focus Fill lifecycle, cosmetic ad hiding, simulated Skip Ad handling, ad acceleration, and playback-rate restoration.

No GitHub Actions are required for the local validation workflow.

## Privacy

No analytics, tracking, accounts, remote scripts, or external extension services are used. Settings are stored with Chrome/Edge sync storage. Ad Shield only installs local browser rules contained in this repository.

## Known limitations

- YouTube frequently changes DOM, CSS, and ad delivery; selectors and ad rules may need future updates.
- Server-side-inserted ads can be indistinguishable from ordinary media delivery, so blocking them aggressively can also break videos. This extension intentionally avoids broad media-host blocking.
- Browser/DRM policies can prevent canvas frame capture for some protected media. The ambient layer can fall back to a static YouTube thumbnail.
- YouTube experiments or its native miniplayer can occasionally interact with Scroll Dock layout.
- Focus Fill is an in-page viewport override, not the browser Fullscreen API.
- CPU/GPU results vary by browser, driver, VM, display scaling, and source codec.

## Files worth reading

- content.js - lifecycle, ambient/topbar rendering, SPA handling, Scroll Dock, and in-player Ad Shield logic.
- content.css - ambient, live masthead, cosmetic ad hiding, reading, comments, focus, and dock presentation.
- ad-rules.js - scoped declarative network rules.
- background.js - Manifest V3 Ad Shield service-worker lifecycle.
- helpers.js - settings, throttling, and geometry helpers.
- PERFORMANCE.md - benchmark notes and limits.
- SECURITY.md - permission and security posture.

## License

MIT
