const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const js = fs.readFileSync(path.join(root, "content.js"), "utf8");
const css = fs.readFileSync(path.join(root, "content.css"), "utf8");
const sanitizer = fs.readFileSync(path.join(root, "ad-sanitize.js"), "utf8");

test("detected in-player ads are visually suppressed immediately", () => {
  assert.match(js, /ytfb-ad-active/);
  assert.match(css, /html\.ytfb-ad-shield #movie_player\.ad-showing video\.html5-main-video[\s\S]*opacity: 0 !important/);
  assert.match(css, /html\.ytfb-ad-shield:has\(#movie_player\.ad-showing\) #ytfb-root \.ytfb-fallback/);
  assert.match(css, /html\.ytfb-ad-active #movie_player video\.html5-main-video[\s\S]*opacity: 0 !important/);
  assert.match(css, /html\.ytfb-ad-active #ytfb-root \.ytfb-fallback[\s\S]*opacity: 1 !important/);
});

test("Ad Shield tries native skip, DOM skip, bounded seek, and fast playback", () => {
  assert.match(js, /player\.skipAd/);
  assert.match(js, /clickFirstVisible\(AD_SKIP_SELECTORS\)/);
  assert.match(js, /function seekAdTail/);
  assert.match(js, /duration > 120/);
  assert.match(js, /video\.playbackRate = 16/);
});

test("sanitizer recognizes modern player ad payload keys", () => {
  for (const key of [
    "linearAdSequenceRenderer",
    "instreamVideoAdRenderer",
    "playerAdParams",
    "adContextParams"
  ]) {
    assert.match(sanitizer, new RegExp(key));
  }
});

