# Performance notes

Performance is a design constraint. The extension reuses YouTube's existing video element and never starts a second network stream or video decoder.

## Pixel budget

The main ambient layer downsamples the playing video into a bounded canvas. Softness lowers the dynamic canvas resolution instead of applying a full-resolution per-frame Gaussian blur.

At the default Softness value (42), a 4K source is reduced to:

| Preset | Effective canvas | 2 FPS | 4 FPS | 6 FPS | 10 FPS |
|---|---:|---:|---:|---:|---:|
| Low | 342x192 | 0.131 MP/s | 0.263 MP/s | 0.394 MP/s | 0.657 MP/s |
| Medium | 484x272 | 0.263 MP/s | 0.527 MP/s | 0.790 MP/s | 1.316 MP/s |
| High | 728x408 | 0.594 MP/s | 1.188 MP/s | 1.782 MP/s | 2.970 MP/s |

The default is **Medium / 4 FPS / Softness 42**, or about **0.527 megapixels per second** of ambient-canvas copies.

## v1.3 live-video topbar

The live masthead effect adds a second **canvas surface**, but not a second media element or decoder. Its internal surface is only **384x24** and is refreshed at about **2 FPS** by piggybacking on the existing ambient render loop.

That is approximately:

**384 x 24 x 2 = 0.018 MP/s**

So the modeled topbar copy workload is only about 3.5% of the default ambient canvas copy workload. CSS then enlarges and blurs this tiny surface behind the real YouTube masthead.

The topbar canvas uses pointer-events none, while the real masthead controls remain in a higher stacking layer.

## v1.3 Ad Shield runtime behavior

Network blocking is handled by Manifest V3 declarative rules and adds no per-frame rendering work.

Cosmetic hiding is ordinary CSS. In-player handling uses a dedicated observer on the YouTube player. If a skippable ad control appears, it is clicked. If YouTube reports an unskippable ad, a short-lived watchdog maintains mute + accelerated playback while that ad state is present, then stops and restores the previous playback rate when the state clears.

The watchdog does not run during normal video playback.

The browser runtime audit verifies:

- live topbar canvas exists at 384x24;
- topbar pointer events are disabled;
- native masthead controls remain clickable;
- simulated Skip Ad handling clears the ad state;
- simulated unskippable-ad handling reaches 16x playback while active;
- the ad watchdog reports inactive after the ad state is removed;
- playback rate returns to its previous value.

This test is synthetic because ad inventory is not deterministic. It tests the extension's handling path rather than claiming that a specific live ad campaign will always be present.

## Windows 181 runtime measurement

Earlier v1.2 measurements were taken on the Windows 181 development VM:

- Windows build 10.0.26200;
- 32 logical CPUs;
- Chrome 153.0.8010.53;
- VMware SVGA 3D + Microsoft Remote Display Adapter;
- one isolated Chrome profile playing the same YouTube watch page;
- default Medium / 4 FPS / Softness 42 settings.

Stable branded Chrome in this environment did not reliably activate an unpacked extension from the command-line flags used by the harness. Runtime content checks therefore inject the exact packaged helpers.js, content.js, and content.css through Chrome DevTools Protocol with a tiny storage/runtime shim. The final packaging step should still be checked with **Load unpacked** or **Reload** in Chrome/Edge.

### Earlier CPU/RAM samples

Short samples varied with YouTube loading, ads, caching, and renderer lifecycle:

| Phase | Whole 32-thread VM CPU | One-core equivalent | Working set | Private bytes |
|---|---:|---:|---:|---:|
| Baseline, earlier warm-up | 1.060% | 33.91% | 866.1 MB | 494.3 MB |
| Ambient | 2.314% | 74.06% | 1031.0 MB | 509.7 MB |
| Baseline, post-reload/warm | 0.195% | 6.25% | 1156.7 MB | 570.3 MB |
| Ambient, warmed 15 s | 1.992% | 63.75% | 1248.5 MB | 522.7 MB |

A later v1.2 masthead pass measured:

| Phase | Whole 32-thread VM CPU | One-core equivalent | Working set | Private bytes |
|---|---:|---:|---:|---:|
| YouTube baseline after reload | 0.259% | 8.28% | 1037.7 MB | 551.3 MB |
| Ambient + static/hover logo treatment | 2.285% | 73.12% | 1347.3 MB | 555.3 MB |

These are VM/profile-level observations, not portable extension-only benchmarks. YouTube playback, decoding, caching, source resolution, browser version, and the virtual graphics stack produce large variance.

### Earlier memory stability check

One 30-second v1.2 follow-up showed no monotonic private-memory growth:

| Time | Chrome processes | Working set | Private bytes |
|---:|---:|---:|---:|
| 0 s | 11 | 1342.1 MB | 534.7 MB |
| 10 s | 10 | 1322.0 MB | 520.0 MB |
| 20 s | 10 | 1324.4 MB | 517.0 MB |
| 30 s | 10 | 1322.5 MB | 518.9 MB |

This is evidence against an obvious short-run leak, not proof that no leak could appear over hours or days.

## GPU observation

nvidia-smi is unavailable on this VM. Windows reports VMware SVGA 3D plus the Microsoft Remote Display Adapter, so a trustworthy extension-only VRAM delta cannot be reported from 181.

The implementation limits GPU pressure structurally:

- one existing YouTube decoder;
- one small ambient canvas;
- one tiny 384x24 topbar canvas;
- no second video stream;
- no full-resolution video-copy surface;
- no per-frame full-resolution Gaussian blur;
- rendering stops when hidden, paused, ended, disabled, or off a valid watch page.

## Practical presets

- **Medium / 4 FPS**: default balance.
- **Low / 2-4 FPS**: best for laptops, battery use, VMs, or remote desktops.
- **6 FPS**: smoother ambient motion with moderate extra work.
- **High / 10 FPS**: intentionally more expensive.

Run npm run perf after changing the rendering defaults.
