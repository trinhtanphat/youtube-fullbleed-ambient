# Performance notes

Performance is a design constraint, not an afterthought. The extension never creates a second network/video decoder. It samples the existing YouTube `<video>` into one bounded canvas and updates that canvas at a configurable low rate.

## Pixel budget

The **Softness** control is intentionally cheap: it lowers the dynamic canvas resolution before the browser scales the image up. It does **not** run a Gaussian blur on every video frame. The static thumbnail fallback can still use CSS blur because it is not redrawn continuously.

At the default Softness value (42), a 4K source is reduced to:

| Preset | Effective canvas | 2 FPS | 4 FPS | 6 FPS | 10 FPS |
|---|---:|---:|---:|---:|---:|
| Low | 342x192 | 0.131 MP/s | 0.263 MP/s | 0.394 MP/s | 0.657 MP/s |
| Medium | 484x272 | 0.263 MP/s | 0.527 MP/s | 0.790 MP/s | 1.316 MP/s |
| High | 728x408 | 0.594 MP/s | 1.188 MP/s | 1.782 MP/s | 2.970 MP/s |

The default is **Medium / 4 FPS / Softness 42**, or about **0.527 megapixels per second** of canvas copies.

## 181 runtime measurement

Measured on the Windows 181 development VM:

- Windows build 10.0.26200
- 32 logical CPUs
- Chrome 153.0.8010.53
- VMware SVGA 3D + Microsoft Remote Display Adapter
- one isolated Chrome profile playing the same YouTube watch page
- default Medium / 4 FPS / Softness 42 settings

Stable branded Chrome in this environment did not activate the unpacked extension from the command-line flags used by the automated harness. For runtime checks, the harness therefore injected the exact packaged `helpers.js`, `content.js`, and `content.css` through Chrome DevTools Protocol with a tiny storage/runtime shim. This exercises the same content-runtime and rendering path, but the final packaging step should still be checked with **Load unpacked** in Chrome/Edge.

### CPU/RAM A/B samples

Short samples varied with YouTube loading, ads, caching, and renderer lifecycle. Two same-profile passes produced:

| Phase | Whole 32-thread VM CPU | One-core equivalent | Working set | Private bytes |
|---|---:|---:|---:|---:|
| Baseline, earlier warm-up | 1.060% | 33.91% | 866.1 MB | 494.3 MB |
| Ambient | 2.314% | 74.06% | 1031.0 MB | 509.7 MB |
| Baseline, post-reload/warm | 0.195% | 6.25% | 1156.7 MB | 570.3 MB |
| Ambient, warmed 15 s | 1.992% | 63.75% | 1248.5 MB | 522.7 MB |

In these short local runs, the ambient effect kept the isolated Chrome process group around **2.0–2.3% of total CPU capacity** on this 32-thread VM. The apparent incremental cost varied by page state, roughly **+0.9 to +1.8 percentage points of whole-VM CPU**.

That is not a universal number. A physical Intel/AMD/NVIDIA GPU, another codec, display scaling, source resolution, or browser version can move it substantially.

The RAM figures are for the **entire Chrome profile**, not the extension alone. Renderer processes and shared browser caches can appear/disappear between samples, so the table must not be read as a precise extension-memory delta.

### 30-second memory stability check

With the final optimized ambient path running, the profile was sampled every 10 seconds:

| Time | Chrome processes | Working set | Private bytes |
|---:|---:|---:|---:|
| 0 s | 11 | 1342.1 MB | 534.7 MB |
| 10 s | 10 | 1322.0 MB | 520.0 MB |
| 20 s | 10 | 1324.4 MB | 517.0 MB |
| 30 s | 10 | 1322.5 MB | 518.9 MB |

After one Chrome process exited, both working set and private bytes stayed essentially flat. There was **no monotonic short-run RAM growth**, which is consistent with reusing one canvas/context and one throttled timer instead of allocating a new frame object or decoder continuously.

This is evidence against an obvious leak, not proof that no leak can ever appear over hours or days.

## GPU observation

`nvidia-smi` is unavailable on this VM. Windows reports VMware SVGA 3D plus the Microsoft Remote Display Adapter, and the per-process dedicated/shared GPU counters returned zero in this virtual graphics stack. A trustworthy extension-only VRAM delta therefore cannot be reported from 181.

The implementation limits GPU pressure structurally:

- one ambient canvas;
- no second video decoder;
- no full-resolution video-copy surface;
- no live Gaussian blur on every frame;
- default effective canvas only 484x272 at 4 FPS;
- rendering stops when hidden, paused, ended, disabled, or off a valid watch page.

## Practical presets

- **Medium / 4 FPS**: default balance used for the runtime checks.
- **Low / 2–4 FPS**: best for laptops, battery use, VMs, remote desktops, or already-heavy YouTube pages.
- **6 FPS**: smoother ambient motion with moderate extra work.
- **High / 10 FPS**: intentionally expensive; use only when the machine has headroom.

Run `npm run perf` to print the current pixel-copy model after changing defaults.
