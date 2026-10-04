# Performance notes

Performance is a design constraint. The extension reuses YouTube's existing video element and never starts a second network stream or video decoder.

## v1.5 frame scheduling

When available, `requestVideoFrameCallback` drives the ambient and masthead sampling from actual decoded video frames. Rendering remains throttled by the configured ambient FPS. A timer fallback is used on browsers without that API. This avoids stale canvases while keeping the same low-resolution sampling model.

## Pixel budget

The main ambient layer downsamples the playing video into a bounded canvas. Softness lowers the dynamic canvas resolution instead of applying a full-resolution per-frame Gaussian blur.

At the default Softness value (42), a 4K source is reduced to:

| Preset | Effective canvas | 2 FPS | 4 FPS | 6 FPS | 10 FPS |
|---|---:|---:|---:|---:|---:|
| Low | 342x192 | 0.131 MP/s | 0.263 MP/s | 0.394 MP/s | 0.657 MP/s |
| Medium | 484x272 | 0.263 MP/s | 0.527 MP/s | 0.790 MP/s | 1.316 MP/s |
| High | 728x408 | 0.594 MP/s | 1.188 MP/s | 1.782 MP/s | 2.970 MP/s |

The default is **Medium / 4 FPS / Softness 42**, about **0.527 MP/s** of ambient-canvas copies.

## v1.5 live-video topbar

The masthead effect adds a second canvas surface, but not a second media element or decoder. Its internal surface is **640x64** and is sampled at about **2 FPS** by piggybacking on the ambient render loop:

**480 x 36 x 2 = 0.035 MP/s**

That modeled copy workload is about 6.6% of the default ambient canvas copy workload. CSS enlarges and blurs the small surface behind YouTube's real masthead. The canvas has pointer events disabled so the native controls remain interactive.

Normal mode and Theater mode use the same surfaces. The extension observes YouTube's watch-layout attributes and changes transparency/anchoring rather than creating another player.

## v1.5 Ad Shield runtime behavior

Network blocking is handled by scoped Manifest V3 declarative rules and adds no per-frame rendering work. A packaged MAIN-world guard removes a bounded set of known ad-related fields from YouTube player responses. Cosmetic hiding is ordinary CSS.

In-player handling uses a dedicated player observer. A visible Skip Ad control is clicked when available. For a positively detected unskippable ad, a short-lived watchdog can maintain mute + accelerated playback and then restore the prior playback rate/mute state after the ad condition clears.

The extension deliberately does not broadly block shared YouTube media delivery hosts such as googlevideo.com.

## Browser smoke coverage

The runtime smoke/audit checks:

- ambient activation in normal mode;
- native Theater mode transition and return to normal;
- transparent full-bleed/theater backgrounds while ambient is active;
- live topbar canvas remains connected at 640x64;
- topbar pointer events are disabled;
- native masthead controls remain interactive;
- cosmetic ad containers are hidden;
- synthetic skip/accelerate paths restore playback state;
- Focus Fill and SPA lifecycle cleanup.

Synthetic ad tests verify the handling code path; they do not claim a specific live advertising campaign will always be present or always use the same delivery method.

## Windows 181 observations

Earlier measurements were collected on the Windows 181 VM with Chrome 153, 32 logical CPUs, VMware SVGA 3D, and an isolated YouTube profile. Those numbers are useful as rough observations, not extension-only benchmarks.

| Phase | Whole 32-thread VM CPU | One-core equivalent | Working set | Private bytes |
|---|---:|---:|---:|---:|
| Baseline, earlier warm-up | 1.060% | 33.91% | 866.1 MB | 494.3 MB |
| Ambient | 2.314% | 74.06% | 1031.0 MB | 509.7 MB |
| Baseline, post-reload/warm | 0.195% | 6.25% | 1156.7 MB | 570.3 MB |
| Ambient, warmed 15 s | 1.992% | 63.75% | 1248.5 MB | 522.7 MB |

A later masthead pass measured:

| Phase | Whole 32-thread VM CPU | One-core equivalent | Working set | Private bytes |
|---|---:|---:|---:|---:|
| YouTube baseline after reload | 0.259% | 8.28% | 1037.7 MB | 551.3 MB |
| Ambient + static/hover logo treatment | 2.285% | 73.12% | 1347.3 MB | 555.3 MB |

These runs predate the final v1.5 topbar dimensions and are retained only as historical VM observations. YouTube playback, decoding, caching, source resolution, browser version, and the virtual graphics stack produce large variance.

### Earlier memory stability check

One 30-second follow-up showed no monotonic private-memory growth:

| Time | Chrome processes | Working set | Private bytes |
|---:|---:|---:|---:|
| 0 s | 11 | 1342.1 MB | 534.7 MB |
| 10 s | 10 | 1322.0 MB | 520.0 MB |
| 20 s | 10 | 1324.4 MB | 517.0 MB |
| 30 s | 10 | 1322.5 MB | 518.9 MB |

This is evidence against an obvious short-run leak, not proof that no leak could appear over hours or days.

## GPU observation

A trustworthy extension-only VRAM delta is not available from the 181 VMware graphics stack. The implementation limits pressure structurally:

- one existing YouTube decoder;
- one bounded ambient canvas;
- one small 640x64 topbar canvas;
- no second video stream;
- no full-resolution copy surface;
- no per-frame full-resolution Gaussian blur;
- rendering stops when hidden, paused, ended, disabled, or off a valid watch page.

## Practical presets

- **Medium / 4 FPS**: default balance.
- **Low / 2-4 FPS**: best for laptops, battery use, VMs, or remote desktops.
- **6 FPS**: smoother ambient motion with moderate extra work.
- **High / 10 FPS**: intentionally more expensive.

Run `npm run perf` after changing rendering defaults.
