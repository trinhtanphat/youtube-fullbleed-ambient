# Performance notes

Performance is a design constraint, not an afterthought. The extension never creates a second network/video decoder. It samples the existing YouTube `<video>` into one bounded canvas and updates that canvas at a configurable low rate.

## Pixel budget

For a 4K source, the internal canvas is capped to:

| Preset | Canvas | 2 FPS | 4 FPS | 6 FPS | 10 FPS |
|---|---:|---:|---:|---:|---:|
| Low | 452x254 | 0.230 MP/s | 0.459 MP/s | 0.689 MP/s | 1.148 MP/s |
| Medium | 640x360 | 0.461 MP/s | 0.922 MP/s | 1.382 MP/s | 2.304 MP/s |
| High | 960x540 | 1.037 MP/s | 2.074 MP/s | 3.110 MP/s | 5.184 MP/s |

The default is **Medium / 4 FPS**. Blur is applied on the small internal canvas; the full-page layer only applies brightness plus scaling.

## 181 runtime measurement

Measured on the user's Windows 181 VM:

- Windows build reported by Commander: 10.0.26200
- 32 logical CPUs
- Chrome 153.0.8010.53
- VMware SVGA 3D + Microsoft Remote Display Adapter
- Isolated Chrome profile playing a YouTube watch page
- Same browser/profile used for baseline and ambient runtime samples

Stable branded Chrome 153 did not honor command-line unpacked-extension loading in this environment, so the runtime benchmark injected the **same packaged `helpers.js`, `content.js`, and `content.css`** through Chrome DevTools Protocol with a minimal `chrome.storage/runtime` shim. This validates the content-runtime path and rendering cost, but it is not a substitute for the final manual "Load unpacked" packaging check.

### 10-second CPU/RAM samples

| Phase | CPU, one-core equivalent | CPU, whole 32-thread VM | Working set | Private bytes |
|---|---:|---:|---:|---:|
| YouTube baseline | 87.66% | 2.739% | 1275.9 MB | 691.8 MB |
| Ambient, Medium / 4 FPS | 162.97% | 5.093% | 1110.0 MB | 585.1 MB |

CPU therefore increased by about **75 percentage points of one logical core**, or about **2.35 percentage points of total CPU capacity on this 32-thread VM**, in this particular window. Browser/video workload is noisy, so these numbers should be treated as an indicative local measurement, not a universal benchmark.

The RAM values are for the entire isolated Chrome profile, not the extension alone. The ambient sample being lower than baseline is normal process/cache noise and must **not** be interpreted as the extension saving memory.

### 30-second memory stability sample with ambient active

Working set (MB):

`1125.9 → 1132.5 → 1130.1 → 1122.9 → 1120.1 → 1127.0 → 1105.1`

Private bytes (MB):

`586.8 → 596.6 → 591.4 → 586.5 → 582.5 → 593.7 → 582.8`

There was **no monotonic RAM growth** in this 30-second run, which is consistent with the extension reusing one canvas/context rather than allocating a new frame object each update. This is evidence against an obvious short-run leak, not proof that a leak can never occur over hours/days.

### GPU observation

The Chrome GPU process for the isolated profile reported about **2.55 MB Total Committed** through Windows' `GPU Process Memory` counter at one sample. Dedicated/shared usage counters reported zero on this VMware virtual graphics stack, so a precise extension-only VRAM delta could not be derived.

Because the machine uses VMware SVGA 3D, this number should not be generalized to a physical NVIDIA/AMD/Intel GPU. The implementation still bounds GPU pressure structurally: one composited background canvas, no duplicated video decoder, and no full-resolution video-copy canvas.

## Practical recommendation

- **Default (Medium / 4 FPS):** good balance on the 181 VM.
- **Low / 2–4 FPS:** recommended for laptops, battery use, VMs, or when YouTube itself is already CPU-heavy.
- **High / 10 FPS:** smoother but intentionally more expensive.
- Rendering stops when the tab is hidden, the video is paused/ended, the extension is disabled, or the page leaves an eligible YouTube watch URL.

Always benchmark on the actual target device if power use or fan noise matters.
