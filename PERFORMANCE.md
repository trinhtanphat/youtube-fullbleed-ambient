# Performance notes

Performance is a design constraint. The extension reuses YouTube's already-decoded player and does not fetch a second media URL.

## v1.5.2 relay architecture

The preferred live path uses `HTMLVideoElement.captureStream()` on YouTube's existing player. One captured MediaStream is assigned with `srcObject` to a muted full-page relay video and a muted masthead relay video.

This means:

- no second YouTube media URL;
- no duplicate network transfer;
- no second decode pipeline;
- two additional compositor/video surfaces can still add CPU/GPU work;
- when relay capture is unavailable or stalls, the bounded canvas renderer remains the compatibility fallback.

A 500 ms heartbeat watches relay progress. If the relay clock stops while the source video is still playing, the relay is rebuilt; if capture cannot recover, the canvas path continues.

## Canvas fallback budget

The fallback ambient layer downsamples the playing video into a bounded canvas. Softness lowers the effective canvas resolution rather than applying a full-resolution per-frame Gaussian blur.

At Softness 42, a 4K source is reduced to:

| Preset | Effective canvas | 2 FPS | 4 FPS | 6 FPS | 10 FPS |
|---|---:|---:|---:|---:|---:|
| Low | 342x192 | 0.131 MP/s | 0.263 MP/s | 0.394 MP/s | 0.657 MP/s |
| Medium | 484x272 | 0.263 MP/s | 0.527 MP/s | 0.790 MP/s | 1.316 MP/s |
| High | 728x408 | 0.594 MP/s | 1.188 MP/s | 1.782 MP/s | 2.970 MP/s |

The default fallback budget is **Medium / 4 FPS**, about **0.527 MP/s** of ambient-canvas copies.

## Live-video topbar

When the captureStream relay is healthy, the topbar is fed by the same captured MediaStream as the full-page background. There is no additional media download or decode, but the second relay element is another compositor surface.

If relay capture is unavailable, the topbar falls back to a **640x64 @ ~4 FPS** canvas:

**640 x 64 x 4 = 0.164 MP/s**

That is about 31% of the default ambient-canvas copy budget. The surface has pointer events disabled so YouTube's native logo, search, and account controls remain interactive.

Normal mode and Theater mode use the same relay/canvas pipeline. The extension changes transparency and anchoring around YouTube's native player rather than replacing it.

## v1.5.2 installed-runtime visual audit

On Windows 181, the unpacked extension was verified as:

- version **1.5.2**;
- state **ENABLED**;
- location **UNPACKED**;
- path **C:\Work\youtube-fullbleed-ambient**.

Using Chrome **153.0.8010.53**, a moving YouTube video, and the installed extension without `cdp-inject.js`:

- full-page relay clock advanced with the source video;
- masthead relay clock advanced with the same captured stream;
- isolated full-page background screenshots changed over time;
- isolated masthead screenshots changed over time;
- the checks passed in both **Normal** and **Theater** modes.

The reusable command is:

```powershell
npm run audit:live -- 9295 --strict-motion --require-installed
```

Use a video with visible motion when `--strict-motion` is enabled; a genuinely static source image can correctly produce identical screenshot hashes.

## Ad Shield runtime cost and coverage

Network blocking uses scoped Manifest V3 declarative rules and has no per-frame rendering cost. A packaged MAIN-world guard removes a bounded set of known ad-related fields from YouTube player responses. Cosmetic hiding is ordinary CSS.

The installed-runtime audit also verified:

- `#player-ads` is hidden;
- a synthetic visible Skip Ad control is clicked automatically;
- a positively detected unskippable-ad state is temporarily accelerated to **16x** and muted;
- playback rate is restored after the ad state clears.

The extension deliberately does not broadly block shared YouTube media delivery hosts such as `googlevideo.com`.

## Current Windows 181 performance sample

Environment:

- Windows build 10.0.26200;
- Chrome 153.0.8010.53;
- 32 logical CPUs;
- VMware SVGA 3D driver 9.17.11.4;
- one YouTube watch page playing a moving 1280x720 source;
- extension settings: Medium, 4 FPS fallback, brightness 68, softness 65, live topbar on.

A 10-second whole-Chrome-process-tree sample measured:

| Phase | Whole-machine CPU | One-core equivalent | Working set | Private bytes |
|---|---:|---:|---:|---:|
| Extension master disabled | 1.646% | 52.66% | 756.5 MB | 608.9 MB |
| v1.5.2 ambient + live topbar enabled | 5.146% | 164.69% | 744.1 MB | 581.7 MB |

The active sample was about **3.50 percentage points** higher at whole-machine scale on this 32-thread VM. That is a material compositor cost, but it was not accompanied by higher private memory in this run. These values are not portable extension-only benchmarks: YouTube decoding, scene complexity, browser scheduling, caching, VM graphics, and concurrent Chrome processes all add noise.

### Short memory stability sample

With v1.5.2 active, five samples over 20 seconds were:

| Time | Chrome processes | Working set | Private bytes |
|---:|---:|---:|---:|
| 0 s | 11 | 730.7 MB | 575.7 MB |
| 5 s | 11 | 728.0 MB | 579.6 MB |
| 10 s | 11 | 727.8 MB | 578.5 MB |
| 15 s | 11 | 724.2 MB | 575.3 MB |
| 20 s | 11 | 717.6 MB | 575.2 MB |

Private memory was not monotonically increasing, so there is no sign of an obvious short-run leak in this sample. This does not prove leak-free behavior over hours or days.

## GPU observation

The 181 VM exposes VMware SVGA 3D rather than a physical GPU with trustworthy extension-only VRAM telemetry, so a precise VRAM delta is not available.

The implementation limits pressure structurally:

- one YouTube network stream and decoder;
- one captured MediaStream;
- two local muted relay surfaces on the preferred path;
- bounded low-resolution canvas surfaces only as fallback;
- no second media URL;
- no full-resolution canvas copy surface;
- no per-frame full-resolution Gaussian blur;
- relay/canvas cleanup on navigation, disable, and source replacement.

## Practical settings

- **Live topbar on**: best visual effect; adds a second relay/compositor surface when captureStream is active.
- **Live topbar off**: reduces one visual/compositor surface while keeping the full-page ambient relay.
- **Low / 2-4 FPS**: lowers cost when the extension is using the canvas fallback path.
- **Medium / 4 FPS**: balanced fallback default.
- **High / 10 FPS**: intentionally more expensive when canvas fallback is active.

The FPS selector controls the canvas fallback rate. A healthy captureStream relay follows decoded video timing instead of the fallback FPS limit.

Run `npm run perf` after changing fallback dimensions or FPS defaults.
