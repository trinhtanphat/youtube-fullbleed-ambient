const test = require("node:test");
const assert = require("node:assert/strict");
const S = require("../ad-sanitize.js");

test("player response sanitizer strips ad payloads but preserves playback data", () => {
  const response = {
    videoDetails: { videoId: "abc123", title: "Video" },
    streamingData: { formats: [{ itag: 18 }] },
    adPlacements: [{ adPlacementRenderer: { config: 1 } }],
    playerAds: [{ playerLegacyDesktopWatchAdsRenderer: {} }],
    nested: {
      adSlots: [{ adSlotRenderer: {} }],
      keep: { value: 42 }
    }
  };

  const same = S.sanitizePlayerResponse(response);
  assert.equal(same, response);
  assert.equal("adPlacements" in response, false);
  assert.equal("playerAds" in response, false);
  assert.equal("adSlots" in response.nested, false);
  assert.deepEqual(response.videoDetails, { videoId: "abc123", title: "Video" });
  assert.deepEqual(response.streamingData, { formats: [{ itag: 18 }] });
  assert.deepEqual(response.nested.keep, { value: 42 });
});

test("sanitizer recognizes only YouTube player response endpoints", () => {
  assert.equal(S.shouldSanitizeResponseUrl("https://www.youtube.com/youtubei/v1/player?prettyPrint=false"), true);
  assert.equal(S.shouldSanitizeResponseUrl("https://youtube.com/get_video_info?video_id=abc"), true);
  assert.equal(S.shouldSanitizeResponseUrl("https://www.youtube.com/youtubei/v1/next"), false);
  assert.equal(S.shouldSanitizeResponseUrl("https://example.com/youtubei/v1/player"), false);
});

test("sanitizeJsonText leaves unrelated JSON byte-for-byte unchanged", () => {
  const text = JSON.stringify({ videoDetails: { title: "ok" }, streamingData: { formats: [] } });
  assert.equal(
    S.sanitizeJsonText(text, "https://www.youtube.com/youtubei/v1/player"),
    text
  );
});

test("sanitizeJsonText removes ad fields on player endpoint", () => {
  const text = JSON.stringify({
    videoDetails: { title: "ok" },
    adPlacements: [{ foo: "bar" }],
    nested: { adBreakHeartbeatParams: "ad-only", keep: true }
  });
  const clean = JSON.parse(
    S.sanitizeJsonText(text, "https://www.youtube.com/youtubei/v1/player")
  );
  assert.equal("adPlacements" in clean, false);
  assert.equal("adBreakHeartbeatParams" in clean.nested, false);
  assert.equal(clean.nested.keep, true);
});
