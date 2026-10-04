const H = require("../helpers.js");

const source = { width: 3840, height: 2160 };
const softness = H.DEFAULT_SETTINGS.blur;
const topbar = { width: 640, height: 64, fps: 4 };
const topbarMpps = H.megapixelsPerSecond(topbar.width, topbar.height, topbar.fps);

console.log(`softness=${softness} (dynamic downsample, no per-frame Gaussian blur)`);
console.log(`topbar live strip: ${topbar.width}x${topbar.height} @ ~${topbar.fps} FPS = ${topbarMpps.toFixed(3)} MP/s`);
for (const quality of ["low", "medium", "high"]) {
  const size = H.computeCanvasSize(source.width, source.height, quality, softness);
  for (const fps of [2, 4, 6, 10]) {
    const mpps = H.megapixelsPerSecond(size.width, size.height, fps);
    console.log(`${quality.padEnd(6)} ${String(fps).padStart(2)} FPS  ${size.width}x${size.height}  ${mpps.toFixed(3)} MP/s`);
  }
}
