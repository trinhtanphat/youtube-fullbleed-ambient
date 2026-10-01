(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.YTFBHelpers = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const DEFAULT_SETTINGS = Object.freeze({
    enabled: true,
    mode: "ambient",
    brightness: 52,
    blur: 42,
    fps: 4,
    quality: "medium"
  });

  const QUALITY_PIXELS = Object.freeze({
    low: 115200,
    medium: 230400,
    high: 518400
  });

  function clamp(value, min, max) {
    const n = Number(value);
    if (!Number.isFinite(n)) return min;
    return Math.min(max, Math.max(min, n));
  }

  function normalizeSettings(input) {
    const source = input && typeof input === "object" ? input : {};
    const fpsChoices = [2, 4, 6, 10];
    const fpsRaw = Number(source.fps);
    const fps = fpsChoices.includes(fpsRaw) ? fpsRaw : DEFAULT_SETTINGS.fps;
    const quality = Object.prototype.hasOwnProperty.call(QUALITY_PIXELS, source.quality)
      ? source.quality
      : DEFAULT_SETTINGS.quality;
    const mode = source.mode === "focus" ? "focus" : "ambient";
    return {
      enabled: source.enabled === undefined ? DEFAULT_SETTINGS.enabled : Boolean(source.enabled),
      mode,
      brightness: Math.round(clamp(source.brightness ?? DEFAULT_SETTINGS.brightness, 20, 100)),
      blur: Math.round(clamp(source.blur ?? DEFAULT_SETTINGS.blur, 12, 80)),
      fps,
      quality
    };
  }

  function computeCanvasSize(videoWidth, videoHeight, quality) {
    const w = Math.max(1, Number(videoWidth) || 16);
    const h = Math.max(1, Number(videoHeight) || 9);
    const budget = QUALITY_PIXELS[quality] || QUALITY_PIXELS.medium;
    const scale = Math.min(1, Math.sqrt(budget / (w * h)));
    const even = (n) => Math.max(2, Math.round(n / 2) * 2);
    return { width: even(w * scale), height: even(h * scale), maxPixels: budget };
  }

  function shouldDrawFrame(nowMs, lastDrawMs, fps) {
    const rate = [2, 4, 6, 10].includes(Number(fps)) ? Number(fps) : DEFAULT_SETTINGS.fps;
    if (!Number.isFinite(lastDrawMs) || lastDrawMs <= 0) return true;
    return Number(nowMs) - Number(lastDrawMs) >= (1000 / rate) * 0.95;
  }

  function getVideoId(urlLike) {
    try {
      const url = new URL(urlLike, "https://www.youtube.com/");
      const host = url.hostname.replace(/^www\./, "");
      if (host !== "youtube.com" && host !== "m.youtube.com") return null;
      if (url.pathname === "/watch") {
        const v = url.searchParams.get("v");
        return v && /^[A-Za-z0-9_-]{6,20}$/.test(v) ? v : null;
      }
      const shorts = url.pathname.match(/^\/shorts\/([A-Za-z0-9_-]{6,20})/);
      return shorts ? shorts[1] : null;
    } catch {
      return null;
    }
  }

  function isEligibleYouTubeUrl(urlLike) {
    try {
      const url = new URL(urlLike, "https://www.youtube.com/");
      return url.protocol === "https:" &&
        url.hostname.replace(/^www\./, "") === "youtube.com" &&
        url.pathname === "/watch" &&
        Boolean(getVideoId(url.href));
    } catch {
      return false;
    }
  }

  function getThumbnailUrl(urlLike) {
    const id = getVideoId(urlLike);
    return id ? "https://i.ytimg.com/vi/" + id + "/hqdefault.jpg" : "";
  }

  function megapixelsPerSecond(width, height, fps) {
    return Number(((Number(width) * Number(height) * Number(fps)) / 1000000).toFixed(3));
  }

  return {
    DEFAULT_SETTINGS,
    QUALITY_PIXELS,
    clamp,
    normalizeSettings,
    computeCanvasSize,
    shouldDrawFrame,
    getVideoId,
    isEligibleYouTubeUrl,
    getThumbnailUrl,
    megapixelsPerSecond
  };
});
