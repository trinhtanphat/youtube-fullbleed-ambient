const test = require("node:test");
const assert = require("node:assert/strict");
const H = require("../helpers.js");

test("normalizeSettings clamps and validates", () => {
  const s = H.normalizeSettings({
    enabled: 0,
    mode: "weird",
    brightness: 999,
    blur: 1,
    fps: 7,
    quality: "ultra",
    scrollMode: "wat",
    dockSize: "giant",
    readingCalm: 0,
    commentGlass: 0
  });
  assert.equal(s.enabled, false);
  assert.equal(s.mode, "ambient");
  assert.equal(s.brightness, 100);
  assert.equal(s.blur, 12);
  assert.equal(s.fps, 4);
  assert.equal(s.quality, "medium");
  assert.equal(s.scrollMode, "dock");
  assert.equal(s.dockSize, "medium");
  assert.equal(s.readingCalm, false);
  assert.equal(s.commentGlass, false);
});

test("new experience defaults preserve useful scroll behavior", () => {
  const s = H.normalizeSettings({});
  assert.equal(s.scrollMode, "dock");
  assert.equal(s.dockSize, "medium");
  assert.equal(s.readingCalm, true);
  assert.equal(s.commentGlass, true);
});

test("canvas size respects pixel budget and aspect", () => {
  const s = H.computeCanvasSize(3840, 2160, "medium", 12);
  assert.ok(s.width * s.height <= s.maxPixels * 1.01);
  assert.ok(Math.abs((s.width / s.height) - (16 / 9)) < 0.02);
});

test("softness lowers the dynamic canvas resolution instead of adding a costly live blur", () => {
  const crisp = H.computeCanvasSize(3840, 2160, "medium", 12);
  const soft = H.computeCanvasSize(3840, 2160, "medium", 42);
  const verySoft = H.computeCanvasSize(3840, 2160, "medium", 80);
  assert.ok(soft.width < crisp.width && soft.height < crisp.height);
  assert.ok(verySoft.width < soft.width && verySoft.height < soft.height);
  assert.ok(verySoft.softnessScale < soft.softnessScale);
});

test("throttle decisions", () => {
  assert.equal(H.shouldDrawFrame(100, 0, 6), true);
  assert.equal(H.shouldDrawFrame(1100, 1000, 6), false);
  assert.equal(H.shouldDrawFrame(1200, 1000, 6), true);
});

test("scroll presentation docks only after player leaves view", () => {
  let p = H.computeScrollPresentation(50, 500, { scrollMode: "dock" }, false);
  assert.deepEqual(p, { reading: false, dock: false });

  p = H.computeScrollPresentation(600, 40, { scrollMode: "dock" }, false);
  assert.deepEqual(p, { reading: true, dock: true });

  p = H.computeScrollPresentation(600, 40, { scrollMode: "off" }, false);
  assert.deepEqual(p, { reading: true, dock: false });
});

test("scroll presentation releases dock near top", () => {
  const p = H.computeScrollPresentation(90, -100, { scrollMode: "dock" }, true);
  assert.deepEqual(p, { reading: false, dock: false });
});

test("video id and eligibility parsing", () => {
  const u = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
  assert.equal(H.getVideoId(u), "dQw4w9WgXcQ");
  assert.equal(H.isEligibleYouTubeUrl(u), true);
  assert.equal(H.isEligibleYouTubeUrl("https://www.youtube.com/"), false);
  assert.equal(H.getVideoId("https://example.com/watch?v=dQw4w9WgXcQ"), null);
});

test("thumbnail URL", () => {
  assert.equal(
    H.getThumbnailUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ"),
    "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg"
  );
});

test("megapixel load calculation", () => {
  assert.equal(H.megapixelsPerSecond(640, 360, 6), 1.382);
});
