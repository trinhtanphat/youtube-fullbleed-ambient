const H = require("../helpers.js");

const source = {width:3840,height:2160};
for (const quality of ["low","medium","high"]) {
  const size = H.computeCanvasSize(source.width,source.height,quality);
  for (const fps of [2,4,6,10]) {
    const mpps = H.megapixelsPerSecond(size.width,size.height,fps);
    console.log(`${quality.padEnd(6)} ${String(fps).padStart(2)} FPS  ${size.width}x${size.height}  ${mpps.toFixed(3)} MP/s`);
  }
}
