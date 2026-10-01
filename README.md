# YouTube Fullbleed Ambient

A lightweight Chrome/Edge Manifest V3 extension that extends the currently playing YouTube video into a blurred full-page moving background. It also includes an optional **Focus fill** mode that expands the existing YouTube player to the browser viewport without using the browser Fullscreen API.

## Why it stays light

- Reuses the existing YouTube `<video>`; it **does not duplicate or re-decode the stream**.
- Samples the current frame into one low-resolution canvas.
- Default canvas budget is about **0.23 MP** and default refresh is **4 FPS**.
- CSS performs the blur/scale on the compositor.
- Rendering stops when the tab is hidden, video is paused/ended, the extension is disabled, or you leave a YouTube watch page.
- One MutationObserver is reused for YouTube SPA navigation and video replacement.

## Install unpacked

### Chrome
1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Choose **Load unpacked**.
4. Select this repository directory.
5. Open a YouTube watch page.

### Edge
1. Open `edge://extensions`.
2. Enable **Developer mode**.
3. Choose **Load unpacked**.
4. Select this repository directory.

## Controls

Open the extension popup to change:
- Enable/disable.
- Ambient background or Ambient + Focus fill.
- Brightness and blur.
- 2 / 4 / 6 / 10 background render FPS.
- Low / Medium / High canvas budget.
- Toggle Focus fill manually.
- Reset defaults.

Press **Esc** to leave Focus fill.

## Performance presets

The background draw workload is intentionally bounded. Run:

```powershell
npm run perf
```

For a 4K source, Medium at 6 FPS draws only about **1.38 megapixels per second** into the background canvas. The foreground YouTube video decode remains YouTube's normal workload.

For lowest laptop/VM overhead use **Low + 2 or 4 FPS**. High + 10 FPS is intentionally available for smoother animation but costs more compositor/draw work.

See [PERFORMANCE.md](PERFORMANCE.md) for the measured Windows 181 CPU/RAM/GPU observations and benchmark limitations.

## Tests

```powershell
npm test
npm run check
npm run perf
```

No GitHub Actions are required.

## Privacy

No analytics, tracking, remote scripts, accounts, or external services are used by the extension. Settings are stored with Chrome/Edge sync storage. The extension is scoped to `https://www.youtube.com/*`.

## How it works

The content script finds YouTube's existing main video element, periodically calls `canvas.drawImage(video,...)` at a bounded internal resolution, and lets CSS stretch/blur that canvas across the viewport. If frame drawing is unavailable, it falls back to the video's YouTube thumbnail as a static blurred background.

## Known limitations

- YouTube frequently changes DOM/CSS; selectors may occasionally need adjustment.
- Browser/DRM policies can prevent canvas frame capture for some protected media. Static thumbnail fallback is used when drawing fails.
- Focus fill is an in-page layout override, not the browser Fullscreen API; unusual YouTube experiments may affect control positioning.
- GPU memory numbers vary by browser, driver and VM, so repository benchmarks focus on bounded draw pixel rate plus real process monitoring.

## License

MIT
