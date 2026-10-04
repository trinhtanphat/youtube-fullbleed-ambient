# Performance notes

## v1.7.0 counter overhead

Block counters add no video decoder, canvas, or graphics work. Network counting is event-driven from DNR rule matches on unpacked builds. Cosmetic/player events are reported only when an ad container is removed or an in-player ad episode begins. Stats writes are batched with a short local-storage delay.

## v1.6.1 ad-overlay patch cost

The v1.6.1 fix is CSS selector matching plus bounded DOM control lookup only while Ad Shield is active. It adds no media decoder, no network stream, no canvas surface, and no per-frame graphics work. The player-localized Skip fallback is only used after a positive ad signal.

Performance is a design constraint. The extension reuses YouTube's already-decoded player and does not fetch a second media URL.

## v1.6.0 single-surface architecture

The preferred live path uses HTMLVideoElement.captureStream() on YouTube's existing player. One captured MediaStream is assigned with srcObject to one muted full-page relay video.

The YouTube masthead no longer has its own relay or fallback canvas. Instead, the masthead is transparent and reveals the exact same full-page ambient surface. Compared with v1.5.2 this removes one local relay/compositor surface and removes the old 640x64 topbar canvas fallback entirely.

This means:

- no second YouTube media URL;
- no duplicate network transfer;
- no second decode pipeline;
- one captured MediaStream and one local full-page relay surface on the preferred path;
- **0 additional header canvas MP/s**;
- when relay capture is unavailable or stalls, the bounded full-page canvas renderer remains the compatibility fallback.

A 500 ms heartbeat watches relay progress. If the relay clock stops while the source video is still playing, the relay is rebuilt; if capture cannot recover, the canvas path continues.

## Canvas fallback budget

The fallback ambient layer downsamples the playing video into a bounded canvas. Softness lowers the effective canvas resolution rather than applying a full-resolution per-frame Gaussian blur.

At Softness 42, a 4K source is reduced to:

| Preset | Effective canvas | 2 FPS | 4 FPS | 6 FPS | 10 FPS |
|---|---:|---:|---:|---:|---:|
| Low | 342x192 | 0.131 MP/s | 0.263 MP/s | 0.394 MP/s | 0.657 MP/s |
| Medium | 484x272 | 0.263 MP/s | 0.527 MP/s | 0.790 MP/s | 1.316 MP/s |
| High | 728x408 | 0.594 MP/s | 1.188 MP/s | 1.782 MP/s | 2.970 MP/s |

The default fallback budget is **Medium / 4 FPS**, about **0.527 MP/s** of ambient-canvas copies. The unified header adds no independent copy budget.

## v1.6.0 installed-runtime visual audit

On Windows 181, Chrome 153.0.8010.53 was tested with the unpacked extension loaded from C:\Work\youtube-fullbleed-ambient.

The installed-runtime audit passed in both **Normal** and **Theater** modes on a moving YouTube video:

- the full-page relay clock advanced with the source video;
- full-page screenshots changed over time;
- the header crop changed over the same interval because it reveals the same moving full-page surface;
- masthead background was rgba(0, 0, 0, 0) with a 0px bottom border;
- legacy #ytfb-topbar-video and #ytfb-topbar-relay surfaces were absent.

Reusable command:

    npm run audit:live -- 9295 --strict-motion --require-installed

Use a video with visible motion when --strict-motion is enabled; a genuinely static source image can correctly produce identical screenshot hashes.

## Ad Shield runtime cost and coverage

Network blocking uses scoped Manifest V3 declarative rules and has no per-frame rendering cost. A packaged MAIN-world guard removes a bounded set of known ad-related fields from YouTube player responses. Cosmetic hiding is ordinary CSS.

v1.6.0 adds an immediate visual shield for positive player ad states and expands the fallback sequence. Runtime tests verified:

- known ad containers are hidden/removed;
- a synthetic visible Skip Ad control is clicked automatically;
- the player skip API is attempted when available;
- a detected short ad segment can be moved to its tail;
- while an ad state remains active, the main ad video is visually hidden, the content poster is shown, and the media is temporarily muted at **16x** as the fallback;
- the playback rate, mute state, and normal video visibility are restored when the ad state clears.

The extension deliberately does not broadly block shared YouTube media delivery hosts such as googlevideo.com. Server-side ad insertion and new YouTube experiments can still evade a client-side best-effort blocker.

## Current Windows 181 performance sample

Environment:

- Windows build 10.0.26200;
- Chrome 153.0.8010.53;
- 32 logical CPUs;
- VMware SVGA 3D;
- same Chrome profile/process tree and YouTube watch page;
- extension settings at the time: Medium fallback, 4 FPS, brightness 68, softness 65, unified header on.

A 10-second whole-Chrome-process-tree comparison measured:

| Phase | Whole-machine CPU | One-core equivalent | Working set | Private bytes |
|---|---:|---:|---:|---:|
| Extension master disabled | 1.538% | 49.22% | 797.0 MB | 636.3 MB |
| v1.6.0 enabled, unified header | 4.229% | 135.31% | 816.4 MB | 629.4 MB |

The enabled sample was about **+2.69 percentage points** at whole-machine scale on this 32-thread VM. Working set was about **+19.4 MB** in that sample, while private bytes were lower, which illustrates how noisy whole-browser memory measurements are. These are not extension-only or portable benchmarks: YouTube decoding, scene complexity, browser scheduling, caching, VM graphics, and other Chrome processes all contribute.

The important structural change for v1.6.0 is that the header now costs no additional relay/canvas surface beyond the full-page ambient surface. This reduces work relative to the v1.5.2 two-surface design, even though a single short CPU sample can still move substantially with YouTube content.

## GPU observation

The 181 VM exposes VMware SVGA 3D rather than a physical GPU with trustworthy extension-only VRAM telemetry, so a precise VRAM delta is not available.

The implementation limits pressure structurally:

- one YouTube network stream and decoder;
- one captured MediaStream;
- one local muted full-page relay surface on the preferred path;
- bounded low-resolution canvas surfaces only as fallback;
- no second media URL;
- no full-resolution canvas copy surface;
- no per-frame full-resolution Gaussian blur;
- relay/canvas cleanup on navigation, disable, and source replacement.

## Practical settings

- **Unified ambient header on**: masthead is transparent and shares the same full-page surface; no extra relay/canvas surface.
- **Unified ambient header off**: restores YouTube's ordinary masthead treatment while keeping the full-page ambient relay.
- **Low / 2-4 FPS**: lowers cost when the extension is using the canvas fallback path.
- **Medium / 4 FPS**: balanced fallback default.
- **High / 10 FPS**: intentionally more expensive when canvas fallback is active.

The FPS selector controls the canvas fallback rate. A healthy captureStream relay follows decoded video timing instead of the fallback FPS limit.

Run `npm run perf` after changing fallback dimensions or FPS defaults.
