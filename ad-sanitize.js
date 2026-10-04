(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.YTFBAdSanitizer = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const AD_KEYS = new Set([
    "adPlacements",
    "playerAds",
    "adSlots",
    "adBreakHeartbeatParams",
    "adBreakParams",
    "adSignalsInfo",
    "adSafetyReason",
    "ad3Module",
    "adPlacementRenderer",
    "adSlotRenderer",
    "adBreakRenderer",
    "playerLegacyDesktopWatchAdsRenderer",
    "linearAdSequenceRenderer",
    "instreamVideoAdRenderer",
    "companionAdRenderer",
    "adInfoDialogRenderer",
    "adLayoutLoggingData",
    "playerAdParams",
    "adContextParams",
    "adVideoId",
    "promotedSparklesWebRenderer",
    "displayAdRenderer",
    "inFeedAdLayoutRenderer",
    "actionCompanionAdRenderer"
  ]);

  function shouldSanitizeResponseUrl(urlLike) {
    try {
      const url = new URL(String(urlLike || ""), "https://www.youtube.com/");
      const host = url.hostname.replace(/^www\./, "");
      if (host !== "youtube.com" && host !== "m.youtube.com") return false;

      const path = url.pathname;
      return path === "/youtubei/v1/player" ||
        path === "/youtubei/v1/player/" ||
        path === "/get_video_info" ||
        path === "/playlist" ||
        path === "/watch" ||
        path === "/get_watch";
    } catch {
      return false;
    }
  }

  function sanitizePlayerResponse(value, maxNodes = 12000) {
    if (!value || typeof value !== "object") return value;

    const stack = [value];
    const seen = new WeakSet();
    let visited = 0;

    while (stack.length && visited < maxNodes) {
      const node = stack.pop();
      if (!node || typeof node !== "object" || seen.has(node)) continue;
      seen.add(node);
      visited += 1;

      if (Array.isArray(node)) {
        for (const child of node) {
          if (child && typeof child === "object") stack.push(child);
        }
        continue;
      }

      for (const key of Object.keys(node)) {
        if (AD_KEYS.has(key)) {
          delete node[key];
          continue;
        }
        const child = node[key];
        if (child && typeof child === "object") stack.push(child);
      }
    }

    return value;
  }

  function sanitizeJsonText(text, urlLike) {
    if (!shouldSanitizeResponseUrl(urlLike) || typeof text !== "string") return text;
    if (!/"(?:adPlacements|playerAds|adSlots|adBreakHeartbeatParams|ad3Module|linearAdSequenceRenderer|instreamVideoAdRenderer|playerAdParams|adContextParams)"/.test(text)) {
      return text;
    }
    try {
      return JSON.stringify(sanitizePlayerResponse(JSON.parse(text)));
    } catch {
      return text;
    }
  }

  function sanitizeArrayBuffer(buffer, urlLike) {
    if (!shouldSanitizeResponseUrl(urlLike) || !(buffer instanceof ArrayBuffer)) return buffer;
    try {
      const text = new TextDecoder().decode(buffer);
      const clean = sanitizeJsonText(text, urlLike);
      return clean === text ? buffer : new TextEncoder().encode(clean).buffer;
    } catch {
      return buffer;
    }
  }

  return {
    AD_KEYS,
    shouldSanitizeResponseUrl,
    sanitizePlayerResponse,
    sanitizeJsonText,
    sanitizeArrayBuffer
  };
});
