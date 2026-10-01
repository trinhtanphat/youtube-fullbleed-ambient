const test = require("node:test");
const assert = require("node:assert/strict");
const H = require("../helpers.js");

test("normalizeSettings clamps and validates", () => {
  const s = H.normalizeSettings({enabled:0,mode:"weird",brightness:999,blur:1,fps:7,quality:"ultra"});
  assert.equal(s.enabled,false);
  assert.equal(s.mode,"ambient");
  assert.equal(s.brightness,100);
  assert.equal(s.blur,12);
  assert.equal(s.fps,4);
  assert.equal(s.quality,"medium");
});

test("canvas size respects pixel budget and aspect", () => {
  const s = H.computeCanvasSize(3840,2160,"medium");
  assert.ok(s.width*s.height <= s.maxPixels*1.01);
  assert.ok(Math.abs((s.width/s.height)-(16/9)) < 0.02);
});

test("throttle decisions", () => {
  assert.equal(H.shouldDrawFrame(100,0,6),true);
  assert.equal(H.shouldDrawFrame(1100,1000,6),false);
  assert.equal(H.shouldDrawFrame(1200,1000,6),true);
});

test("video id and eligibility parsing", () => {
  const u="https://www.youtube.com/watch?v=dQw4w9WgXcQ";
  assert.equal(H.getVideoId(u),"dQw4w9WgXcQ");
  assert.equal(H.isEligibleYouTubeUrl(u),true);
  assert.equal(H.isEligibleYouTubeUrl("https://www.youtube.com/"),false);
  assert.equal(H.getVideoId("https://example.com/watch?v=dQw4w9WgXcQ"),null);
});

test("thumbnail URL", () => {
  assert.equal(
    H.getThumbnailUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ"),
    "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg"
  );
});

test("megapixel load calculation", () => {
  assert.equal(H.megapixelsPerSecond(640,360,6),1.382);
});
