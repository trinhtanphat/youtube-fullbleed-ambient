(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.YTFBHelpers = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const DEFAULT_SETTINGS = Object.freeze({
    enabled: true,
    mode: "ambient",
    brightness: 50,
    blur: 42,
    fps: 4,
    quality: "medium",
    scrollMode: "dock",
    dockSize: "medium",
    readingCalm: true,
    commentGlass: true,
    topbarVideo: true,
    adBlock: true
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

  function foldUiText(value) {
    return String(value ?? "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/\u0111/g, "d")
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .trim();
  }

  const AD_SKIP_TEXTS = new Set([
    "skip",
    "skip ad",
    "skip ads",
    "bo qua",
    "bo qua quang cao",
    "omitir anuncio",
    "saltar anuncio",
    "ignorer l annonce",
    "uberspringen",
    "salta annuncio",
    "pular anuncio",
    "pular anuncios",
    "広告をスキップ",
    "광고 건너뛰기",
    "пропустить рекламу",
    "跳过广告",
    "跳過廣告"
  ]);

  const AD_SIGNAL_TEXTS = Object.freeze([
    "sponsored",
    "duoc tai tro",
    "quang cao",
    "ads by google",
    "why this ad",
    "visit advertiser",
    "ad 1 of",
    "ad 2 of",
    "ad 3 of",
    "広告",
    "광고",
    "реклама",
    "广告",
    "廣告"
  ]);

  function isAdSkipLabel(value) {
    const text = foldUiText(value);
    if (!text) return false;
    return AD_SKIP_TEXTS.has(text) || /^skip ad \d+$/.test(text);
  }

  function isAdSignalText(value) {
    const text = foldUiText(value);
    if (!text) return false;
    if (isAdSkipLabel(value)) return true;
    return AD_SIGNAL_TEXTS.some((needle) => text === needle || text.includes(needle));
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
    const scrollMode = source.scrollMode === "off" ? "off" : "dock";
    const dockSize = ["small", "medium", "large"].includes(source.dockSize)
      ? source.dockSize
      : DEFAULT_SETTINGS.dockSize;

    return {
      enabled: source.enabled === undefined ? DEFAULT_SETTINGS.enabled : Boolean(source.enabled),
      mode,
      brightness: Math.round(clamp(source.brightness ?? DEFAULT_SETTINGS.brightness, 20, 100)),
      blur: Math.round(clamp(source.blur ?? DEFAULT_SETTINGS.blur, 12, 80)),
      fps,
      quality,
      scrollMode,
      dockSize,
      readingCalm: source.readingCalm === undefined ? DEFAULT_SETTINGS.readingCalm : Boolean(source.readingCalm),
      commentGlass: source.commentGlass === undefined ? DEFAULT_SETTINGS.commentGlass : Boolean(source.commentGlass),
      topbarVideo: source.topbarVideo === undefined ? DEFAULT_SETTINGS.topbarVideo : Boolean(source.topbarVideo),
      adBlock: source.adBlock === undefined ? DEFAULT_SETTINGS.adBlock : Boolean(source.adBlock)
    };
  }

  function computeCanvasSize(videoWidth, videoHeight, quality, softness = 12) {
    const w = Math.max(1, Number(videoWidth) || 16);
    const h = Math.max(1, Number(videoHeight) || 9);
    const budget = QUALITY_PIXELS[quality] || QUALITY_PIXELS.medium;
    const baseScale = Math.min(1, Math.sqrt(budget / (w * h)));
    const soft = clamp(softness, 12, 80);
    const softnessScale = 1 - ((soft - 12) / 68) * 0.55;
    const scale = Math.min(1, baseScale * softnessScale);
    const even = (n) => Math.max(2, Math.round(n / 2) * 2);
    return {
      width: even(w * scale),
      height: even(h * scale),
      maxPixels: budget,
      softnessScale: Number(softnessScale.toFixed(3))
    };
  }

  function shouldDrawFrame(nowMs, lastDrawMs, fps) {
    const rate = [2, 4, 6, 10].includes(Number(fps)) ? Number(fps) : DEFAULT_SETTINGS.fps;
    if (!Number.isFinite(lastDrawMs) || lastDrawMs <= 0) return true;
    return Number(nowMs) - Number(lastDrawMs) >= (1000 / rate) * 0.95;
  }

  function computeScrollPresentation(scrollY, playerBottom, settings, currentlyDocked) {
    const s = normalizeSettings(settings);
    const y = Math.max(0, Number(scrollY) || 0);
    const bottom = Number(playerBottom);
    const reading = y >= 180;
    if (s.scrollMode === "off") return { reading, dock: false };
    if (currentlyDocked && y < 140) return { reading, dock: false };
    if (currentlyDocked) return { reading, dock: true };
    return { reading, dock: Number.isFinite(bottom) ? bottom < 72 && y > 180 : y > 520 };
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
    foldUiText,
    isAdSkipLabel,
    isAdSignalText,
    normalizeSettings,
    computeCanvasSize,
    shouldDrawFrame,
    computeScrollPresentation,
    getVideoId,
    isEligibleYouTubeUrl,
    getThumbnailUrl,
    megapixelsPerSecond
  };
});
