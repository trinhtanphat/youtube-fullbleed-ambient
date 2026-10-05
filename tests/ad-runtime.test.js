const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const js = fs.readFileSync(path.join(root, "content.js"), "utf8");
const css = fs.readFileSync(path.join(root, "content.css"), "utf8");
const sanitizer = fs.readFileSync(path.join(root, "ad-sanitize.js"), "utf8");
const guard = fs.readFileSync(path.join(root, "page-guard.js"), "utf8");

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

test("2026 interactive player overlay is hidden without hiding the whole ad module", () => {
  assert.match(css, /html\.ytfb-ad-shield \.ytp-ad-player-overlay,/);
  assert.match(css, /ytp-ad-player-overlay-layout__ad-info-container/);
  assert.doesNotMatch(css, /html\.ytfb-ad-shield \.video-ads\.ytp-ad-module\s*\{/);
});

test("localized skip controls use the tested accent-folding helper", () => {
  assert.equal(js.includes("H.isAdSkipLabel(label)"), true);
  assert.match(js, /function clickLocalizedSkipControl/);
  assert.match(js, /function tryClickAdSkip/);
  assert.doesNotMatch(js, /AD_SKIP_LABEL_RE/);
});

test("generic visible ytp-ad UI and localized labels are positive fallback signals", () => {
  assert.equal(js.includes("[class*='ytp-ad-']"), true);
  assert.equal(js.includes("H.isAdSignalText(label)"), true);
  assert.equal(js.includes("H.isAdSkipLabel(label)"), true);
  assert.doesNotMatch(js, /AD_SKIP_LABEL_RE/);
});

test("ad mutation cleanup uses the low-latency debounce", () => {
  assert.equal(js.includes("function queueAdCleanup(delay = 12)"), true);
});


test("MAIN-world guard covers globals, fetch, text, json, and arrayBuffer response paths", () => {
  assert.match(guard, /installSanitizedGlobal\("ytInitialPlayerResponse"\)/);
  assert.match(guard, /installSanitizedGlobal\("playerResponse"\)/);
  assert.match(guard, /globalThis\.fetch = async function ytfbFetch/);
  assert.match(guard, /Response\.prototype\.json = async function ytfbResponseJson/);
  assert.match(guard, /Response\.prototype\.text = async function ytfbResponseText/);
  assert.match(guard, /Response\.prototype\.arrayBuffer = async function ytfbResponseArrayBuffer/);
  assert.match(guard, /S\.sanitizeJsonText\(raw, responseUrl\)/);
  assert.match(guard, /S\.sanitizeArrayBuffer\(buffer, this\.url\)/);
});


test("localized Skip fallback searches outside the player and open shadow roots", () => {
  assert.match(js, /clickLocalizedSkipInRoot\(document\)/);
  assert.match(js, /function collectOpenShadowRoots/);
  assert.match(js, /host\.shadowRoot/);
  assert.match(js, /clickLocalizedSkipInRoot\(root\)/);
  assert.doesNotMatch(js, /player\.querySelectorAll\("button, \[role='button'\]"\)/);
});


test("DOM Skip attempts do not short-circuit native API and acceleration fallbacks", () => {
  assert.match(js, /const domSkipAttempted = tryClickAdSkip\(\);/);
  assert.match(js, /const apiSkipAttempted = trySkipPlayerApi\(player\);/);
  assert.match(js, /video\.playbackRate = 16/);
  assert.doesNotMatch(js, /if \(tryClickAdSkip\(\)\) \{[\s\S]*?return;/);
});

test("isolated content requests native skip through the MAIN-world guard", () => {
  assert.match(js, /MAIN_SKIP_EVENT = "ytfb-request-native-skip"/);
  assert.match(js, /document\.dispatchEvent\(new Event\(MAIN_SKIP_EVENT\)\)/);
  assert.match(guard, /MAIN_SKIP_EVENT = "ytfb-request-native-skip"/);
  assert.match(guard, /player\.skipAd\(\)/);
  assert.match(guard, /ad-showing/);
  assert.match(guard, /ad-interrupting/);
});
