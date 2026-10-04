const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const js = fs.readFileSync(path.join(root, "content.js"), "utf8");
const css = fs.readFileSync(path.join(root, "content.css"), "utf8");

test("live-frame pipeline uses decoded video frames with a timer fallback", () => {
  assert.match(js, /requestVideoFrameCallback/);
  assert.match(js, /cancelVideoFrameCallback/);
  assert.match(js, /setTimeout\(tick, interval\)/);
});

test("ambient poster remains visible until the first real frame arrives", () => {
  assert.match(js, /ytfb-awaiting-frame/);
  assert.match(css, /#ytfb-root\.ytfb-awaiting-frame \.ytfb-fallback/);
  assert.match(js, /state\.hasAmbientFrame = true/);
  assert.match(js, /classList\.remove\("ytfb-static", "ytfb-awaiting-frame"\)/);
});

test("live masthead uses a visible but still cheap sampled surface", () => {
  assert.match(js, /canvas\.width = 640/);
  assert.match(js, /canvas\.height = 64/);
  assert.match(css, /#ytfb-topbar-video/);
  assert.match(css, /pointer-events: none/);
});

test("ambient rendering reuses YouTube media instead of creating another video", () => {
  assert.doesNotMatch(js, /document\.createElement\(["']video["']\)/);
  assert.match(js, /video\.html5-main-video/);
});
