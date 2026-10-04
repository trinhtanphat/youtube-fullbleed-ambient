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

test("sanitizer recognizes YouTube playback response endpoints", () => {
  assert.equal(S.shouldSanitizeResponseUrl("https://www.youtube.com/youtubei/v1/player?prettyPrint=false"), true);
  assert.equal(S.shouldSanitizeResponseUrl("https://youtube.com/get_video_info?video_id=abc"), true);
  assert.equal(S.shouldSanitizeResponseUrl("https://www.youtube.com/playlist?list=PL123"), true);
  assert.equal(S.shouldSanitizeResponseUrl("https://www.youtube.com/watch?v=abc123"), true);
  assert.equal(S.shouldSanitizeResponseUrl("https://www.youtube.com/get_watch?v=abc123"), true);
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


test("sanitizeArrayBuffer strips ad payloads while preserving playback JSON", () => {
  const text = JSON.stringify({
    playerResponse: {
      videoDetails: { videoId: "abc123" },
      streamingData: { formats: [{ itag: 18 }] },
      adPlacements: [{ adPlacementRenderer: {} }],
      adSlots: [{ adSlotRenderer: {} }]
    }
  });
  const input = new TextEncoder().encode(text).buffer;
  const cleanBuffer = S.sanitizeArrayBuffer(
    input,
    "https://www.youtube.com/youtubei/v1/player?prettyPrint=false"
  );
  const clean = JSON.parse(new TextDecoder().decode(cleanBuffer));
  assert.equal("adPlacements" in clean.playerResponse, false);
  assert.equal("adSlots" in clean.playerResponse, false);
  assert.equal(clean.playerResponse.videoDetails.videoId, "abc123");
  assert.equal(clean.playerResponse.streamingData.formats[0].itag, 18);
});

test("sanitizeArrayBuffer leaves non-player responses untouched", () => {
  const input = new TextEncoder().encode(JSON.stringify({ adPlacements: [1], keep: true })).buffer;
  const output = S.sanitizeArrayBuffer(input, "https://www.youtube.com/youtubei/v1/next");
  assert.equal(output, input);
});
