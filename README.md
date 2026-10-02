# YouTube Fullbleed Ambient

A lightweight Chrome/Edge Manifest V3 extension that turns the currently playing YouTube video into a full-page ambient scene **without starting a second video decoder**.

Version 1.2 adds a polished YouTube masthead/logo treatment plus lifecycle fixes on top of the scroll-first experience: the native player stays interactive in a dock while you read comments, the ambient background calms down around text, and the top bar keeps a visible YouTube brand without adding a second video layer.

## Experience

### Ambient page

The current video is sampled into one low-resolution canvas and stretched behind the YouTube page. YouTube controls, recommendations, comments, navigation, and video switching stay native.

### YouTube masthead + logo

The native YouTube masthead stays clickable and gains a lightweight translucent treatment, red hairline, and subtle static/hover logo glow. The extension prefers YouTube's real logo; if a YouTube experiment temporarily hides or delays it, a small accessible fallback YouTube home mark appears and is automatically removed when the native logo returns. The effect uses gradients/opacity/transform only — no full-width animated blur or backdrop-filter.

### Scroll Dock

With **Keep video docked** enabled, the existing YouTube player moves into a floating corner dock after you scroll past it. You can:

- keep watching while reading comments;
- pause/seek/change volume using the normal YouTube controls;
- switch to another video normally;
- choose Small / Medium / Large dock sizes;
- use `Alt+Shift+D` to dock or undock immediately.

No duplicate `<video>` element is created.

### Calm reading mode

Once you scroll into the reading area, ambient intensity automatically softens. This reduces the â€œbusy wallpaperâ€ feeling that makes many ambient extensions fun for a few minutes but tiring long-term.

### Glass comments

Comments sit on one translucent panel instead of many blurred cards. The background is still visible, but text remains readable and the GPU does not need to blur every comment row.

### Focus fill

Focus fill expands the real YouTube player to the browser viewport. Press **Esc** to return to normal browsing.

## Performance design

- Reuses the existing YouTube `<video>`; no duplicate network stream or decoder.
- Default effective canvas is approximately **484Ã—272** at Softness 42 (Medium quality).
- Softness is implemented by dynamic downsampling instead of a costly live Gaussian blur.
- Default refresh is **4 FPS**.
- Available FPS presets: 2 / 4 / 6 / 10.
- Rendering stops when the tab is hidden, video is paused/ended, the extension is disabled, or the page leaves a valid YouTube watch URL.
- One MutationObserver is reused for YouTube SPA navigation.
- Scroll behavior is handled with a passive listener plus one queued animation-frame update.
- Settings writes from range sliders are debounced.

For a 4K source, the default Medium / 4 FPS / Softness 42 preset draws about **0.527 megapixels per second** into the ambient canvas.

See [PERFORMANCE.md](PERFORMANCE.md) for the measured Windows 181 CPU/RAM/GPU observations and limitations.

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

## Controls

The popup contains:

- master enable toggle;
- Ambient or Focus-fill startup mode;
- Scroll Dock on/off;
- dock size;
- Calm reading mode;
- Glass comments;
- brightness and softness;
- 2 / 4 / 6 / 10 FPS;
- Low / Medium / High canvas budget;
- Dock / undock button;
- Focus fill button;
- Reset defaults.

Keyboard shortcuts implemented inside YouTube pages:

- `Alt+Shift+D` â€” dock / undock.
- `Alt+Shift+A` â€” enable / disable ambient.
- `Esc` â€” leave Focus fill.

## Tests

```powershell
npm test
npm run check
npm run perf
```

For a local browser already exposing a CDP debugging port:

```powershell
node scripts/cdp-inject.js 9244
node scripts/cdp-ux-smoke.js 9244
node scripts/cdp-dom-audit.js 9244
```

The UX smoke verifies: ambient activation, the default 484x272 effective canvas, native-logo accent and click target, accessible logo fallback/recovery, Focus-fill state stability across settings changes, scroll-triggered docking, reading mode, fixed player positioning, leave/return lifecycle cleanup, and clean undocking when returning to the top.

No GitHub Actions are required.

## Privacy

No analytics, tracking, remote scripts, accounts, or external services are used by the extension. Settings are stored with Chrome/Edge sync storage. The extension is scoped to `https://www.youtube.com/*`.

## Known limitations

- YouTube frequently changes DOM/CSS; selectors may occasionally need adjustment.
- Browser/DRM policies can prevent canvas frame capture for some protected media. Static YouTube thumbnail fallback is used when drawing fails.
- YouTube experiments or its native miniplayer may occasionally interact with Scroll Dock layout.
- Focus fill is an in-page viewport override, not the browser Fullscreen API.
- GPU/CPU results vary substantially by browser, driver, VM, display scaling, and source-video codec.

## Files worth reading

- `content.js` â€” lifecycle, rendering, SPA handling, scroll dock.
- `content.css` â€” ambient, reading, comments, focus and dock presentation.
- `helpers.js` â€” pure settings, throttling and geometry helpers.
- `PERFORMANCE.md` â€” benchmark notes.
- `SECURITY.md` â€” security posture.

## License

MIT
