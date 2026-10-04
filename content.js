(() => {
  "use strict";

  const H = globalThis.YTFBHelpers;
  if (!H) return;

  const RUNTIME_VERSION = "1.8.2";

  const state = {
    settings: H.normalizeSettings(),
    root: null,
    canvas: null,
    ctx: null,
    fallback: null,
    relayVideo: null,
    relayStream: null,
    relaySource: null,
    relayLive: false,
    lastRelayTime: 0,
    lastRelayProgressAt: 0,
    topbarRelay: null,
    topbarRelayLive: false,
    video: null,
    brandLogo: null,
    topbarCanvas: null,
    topbarCtx: null,
    lastTopbarDraw: 0,
    hasAmbientFrame: false,
    videoFrameCallbackId: null,
    renderWatchdogId: null,
    adRestore: null,
    adTimer: null,
    adCleanupTimer: null,
    adSkipClicks: 0,
    adAccelerations: 0,
    adSeeks: 0,
    adEpisodeActive: false,
    adObserver: null,
    adObservedPlayer: null,
    watchModeObserver: null,
    observedFlexy: null,
    watchMode: "normal",
    observer: null,
    observing: false,
    timerId: null,
    scrollRaf: null,
    lastDraw: 0,
    active: false,
    focus: false,
    docked: false,
    drawFailed: false,
    lastUrl: location.href,
    mutationTimer: null,
    bound: false
  };

  function ensureRoot() {
    if (state.root?.isConnected) return state.root;

    const root = document.createElement("div");
    root.id = "ytfb-root";
    root.setAttribute("aria-hidden", "true");

    const fallback = document.createElement("img");
    fallback.className = "ytfb-fallback";
    fallback.alt = "";

    const relay = document.createElement("video");
    relay.className = "ytfb-relay";
    relay.muted = true;
    relay.autoplay = true;
    relay.playsInline = true;
    relay.disablePictureInPicture = true;
    relay.setAttribute("aria-hidden", "true");
    relay.setAttribute("tabindex", "-1");

    const canvas = document.createElement("canvas");
    const shade = document.createElement("div");
    shade.className = "ytfb-shade";

    root.append(fallback, relay, canvas, shade);
    (document.body || document.documentElement).prepend(root);

    state.root = root;
    state.fallback = fallback;
    state.relayVideo = relay;
    state.canvas = canvas;
    state.ctx = canvas.getContext("2d", { alpha: false, desynchronized: true });
    root.classList.add("ytfb-awaiting-frame");
    return root;
  }

  function setFallback() {
    ensureRoot();
    const src = H.getThumbnailUrl(location.href);
    if (src && state.fallback.src !== src) state.fallback.src = src;
    state.root.classList.toggle("ytfb-static", state.drawFailed);
    state.root.classList.toggle("ytfb-awaiting-frame", !state.relayLive && !state.hasAmbientFrame && !state.drawFailed);
  }

  function clearTopbarRelay() {
    const relay = state.topbarRelay || document.getElementById("ytfb-topbar-relay");
    if (relay) {
      try { relay.pause(); relay.srcObject = null; } catch {}
      relay.remove();
    }
    state.topbarRelay = null;
    state.topbarRelayLive = false;
    document.documentElement.classList.remove("ytfb-topbar-relay-live");
  }

  function clearTopbarVideoSurface() {
    (state.topbarCanvas || document.getElementById("ytfb-topbar-video"))?.remove();
    state.topbarCanvas = null;
    state.topbarCtx = null;
    state.lastTopbarDraw = 0;
    clearTopbarRelay();
  }

  function setRelayLive(next) {
    state.relayLive = Boolean(next);
    document.documentElement.classList.toggle("ytfb-relay-live", state.relayLive);
    if (state.relayLive) {
      state.lastRelayTime = state.relayVideo?.currentTime || 0;
      state.lastRelayProgressAt = performance.now();
      state.root?.classList.remove("ytfb-static", "ytfb-awaiting-frame");
    }
  }

  function clearRelay() {
    clearTopbarRelay();
    setRelayLive(false);

    if (state.relayVideo) {
      try {
        state.relayVideo.pause();
        state.relayVideo.srcObject = null;
      } catch {}
    }

    if (state.relayStream) {
      for (const track of state.relayStream.getTracks()) {
        try { track.stop(); } catch {}
      }
    }

    state.relayStream = null;
    state.relaySource = null;
    state.lastRelayTime = 0;
    state.lastRelayProgressAt = 0;
  }

  function syncRelay(video = state.video) {
    if (!state.active || !state.settings.enabled || !video) {
      clearRelay();
      return false;
    }

    if (
      state.relaySource === video &&
      state.relayStream &&
      state.relayVideo?.srcObject === state.relayStream
    ) {
      return state.relayLive;
    }

    clearRelay();
    const capture = typeof video.captureStream === "function"
      ? video.captureStream.bind(video)
      : null;
    if (!capture) return false;

    let stream;
    try {
      stream = capture();
    } catch {
      return false;
    }

    if (!stream?.getVideoTracks?.().length) {
      try { stream?.getTracks?.().forEach((track) => track.stop()); } catch {}
      return false;
    }

    const relay = state.relayVideo || ensureRoot().querySelector(".ytfb-relay");
    if (!relay) return false;

    state.relayStream = stream;
    state.relaySource = video;
    relay.srcObject = stream;

    const markPlaying = () => {
      if (relay !== state.relayVideo || state.relayStream !== stream) return;
      setRelayLive(true);
    };
    relay.addEventListener("playing", markPlaying, { once: true, passive: true });
    relay.addEventListener("loadeddata", markPlaying, { once: true, passive: true });
    relay.addEventListener("error", () => {
      if (state.relayStream !== stream) return;
      clearRelay();
      if (state.active && !document.hidden) scheduleRender();
    }, { once: true, passive: true });

    relay.play().then(markPlaying).catch(() => {});
    return true;
  }


  function setVisualSettings() {
    const root = ensureRoot();
    root.style.setProperty("--ytfb-brightness", String(state.settings.brightness / 100));
    root.style.setProperty("--ytfb-blur", String(state.settings.blur) + "px");

    const html = document.documentElement;
    html.classList.toggle("ytfb-comment-glass", state.settings.commentGlass);
    html.classList.toggle("ytfb-topbar-video-enabled", state.active && state.settings.topbarVideo);
    const adShieldEnabled = state.settings.enabled && state.settings.adBlock;
    html.classList.toggle("ytfb-ad-shield", adShieldEnabled);
    html.setAttribute("data-ytfb-ad-shield", adShieldEnabled ? "on" : "off");
    html.classList.remove("ytfb-dock-small", "ytfb-dock-medium", "ytfb-dock-large");
    html.classList.add("ytfb-dock-" + state.settings.dockSize);
  }

  function canSampleVideo(video = state.video) {
    return state.active &&
      state.settings.enabled &&
      H.isEligibleYouTubeUrl(location.href) &&
      !document.hidden &&
      Boolean(video) &&
      video.readyState >= 2 &&
      video.videoWidth > 0 &&
      video.videoHeight > 0;
  }

  function isPlayingRenderable() {
    return canSampleVideo(state.video) &&
      !state.video.paused &&
      !state.video.ended;
  }

  function cancelRenderLoop() {
    if (state.timerId !== null) {
      clearTimeout(state.timerId);
      state.timerId = null;
    }
    if (
      state.videoFrameCallbackId !== null &&
      state.video &&
      typeof state.video.cancelVideoFrameCallback === "function"
    ) {
      try {
        state.video.cancelVideoFrameCallback(state.videoFrameCallbackId);
      } catch {
        // The media element may have been replaced by YouTube.
      }
    }
    state.videoFrameCallbackId = null;
  }

  function drawAmbientFrame(video, now, force = false) {
    if (!canSampleVideo(video)) return false;
    if (!force && !H.shouldDrawFrame(now, state.lastDraw, state.settings.fps)) return false;

    const size = H.computeCanvasSize(
      video.videoWidth,
      video.videoHeight,
      state.settings.quality,
      state.settings.blur
    );
    if (state.canvas.width !== size.width || state.canvas.height !== size.height) {
      state.canvas.width = size.width;
      state.canvas.height = size.height;
    }

    try {
      state.ctx.filter = "none";
      state.ctx.drawImage(video, 0, 0, state.canvas.width, state.canvas.height);
      state.lastDraw = now;
      state.hasAmbientFrame = true;
      state.drawFailed = false;
      state.root.classList.remove("ytfb-static", "ytfb-awaiting-frame");
      return true;
    } catch {
      if (!state.hasAmbientFrame) {
        state.drawFailed = true;
        setFallback();
      }
      return false;
    }
  }

  function renderCurrentFrame(force = false) {
    const video = state.video;
    if (!canSampleVideo(video)) {
      setFallback();
      return;
    }

    if (state.relayLive && state.relaySource === video) return;

    const now = performance.now();
    drawAmbientFrame(video, now, force);
  }

  function scheduleRender() {
    cancelRenderLoop();

    if (!isPlayingRenderable()) {
      renderCurrentFrame(true);
      return;
    }

    const video = state.video;
    const interval = Math.max(100, Math.round(1000 / state.settings.fps));
    renderCurrentFrame(true);

    // Always keep a timer watchdog alive. requestVideoFrameCallback is ideal
    // when Chromium continues delivering decoded-frame callbacks, but YouTube
    // renderer/visibility transitions can occasionally strand that callback.
    // The watchdog guarantees the ambient page and masthead keep refreshing.
    const timerTick = () => {
      state.timerId = null;
      if (state.video !== video || !isPlayingRenderable()) return;
      renderCurrentFrame(false);
      state.timerId = setTimeout(timerTick, interval);
    };
    state.timerId = setTimeout(timerTick, interval);

    if (typeof video.requestVideoFrameCallback === "function") {
      const frameTick = () => {
        state.videoFrameCallbackId = null;
        if (state.video !== video || !isPlayingRenderable()) return;
        renderCurrentFrame(false);
        state.videoFrameCallbackId = video.requestVideoFrameCallback(frameTick);
      };
      state.videoFrameCallbackId = video.requestVideoFrameCallback(frameTick);
    }
  }

  function stopRenderWatchdog() {
    if (state.renderWatchdogId !== null) {
      clearInterval(state.renderWatchdogId);
      state.renderWatchdogId = null;
    }
  }

  function ensureRenderWatchdog() {
    if (state.renderWatchdogId !== null || !state.active || document.hidden) return;

    state.renderWatchdogId = setInterval(() => {
      if (!state.active || !state.settings.enabled || document.hidden) return;

      const current = document.querySelector("video.html5-main-video") || document.querySelector("video");
      if (current && current !== state.video) attachVideo(current);

      if (!isPlayingRenderable()) return;

      if (state.relayLive && state.relaySource === state.video) {
        const relayTime = state.relayVideo?.currentTime || 0;
        if (relayTime > state.lastRelayTime + 0.02) {
          state.lastRelayTime = relayTime;
          state.lastRelayProgressAt = performance.now();
          return;
        }

        if (performance.now() - state.lastRelayProgressAt > 1600) {
          clearRelay();
          syncRelay(state.video);
          if (!state.relayLive) scheduleRender();
        }
        return;
      }

      const interval = Math.max(100, Math.round(1000 / state.settings.fps));
      const staleFor = state.lastDraw > 0 ? performance.now() - state.lastDraw : Infinity;

      if (state.timerId === null && state.videoFrameCallbackId === null) {
        scheduleRender();
        return;
      }

      // Last-resort refresh if Chromium reports the media as playing but a
      // renderer transition has stranded both scheduled draw paths.
      if (staleFor > Math.max(750, interval * 3)) {
        renderCurrentFrame(true);
      }
    }, 500);
  }

  function onVideoReady() {
    renderCurrentFrame(true);
    if (state.video && !state.video.paused && !state.video.ended) scheduleRender();
  }

  function onVideoPauseOrEnd() {
    cancelRenderLoop();
    renderCurrentFrame(true);
  }

  function detachVideo() {
    cancelRenderLoop();
    clearRelay();
    if (!state.video) return;
    state.video.removeEventListener("play", scheduleRender);
    state.video.removeEventListener("playing", scheduleRender);
    state.video.removeEventListener("pause", onVideoPauseOrEnd);
    state.video.removeEventListener("ended", onVideoPauseOrEnd);
    state.video.removeEventListener("loadedmetadata", onVideoReady);
    state.video.removeEventListener("loadeddata", onVideoReady);
    state.video.removeEventListener("canplay", onVideoReady);
    state.video.removeEventListener("seeked", onVideoReady);
    state.video = null;
  }

  function attachVideo(video) {
    if (!video) return;
    if (state.video === video) {
      syncRelay(video);
      renderCurrentFrame(true);
      if (!video.paused && !video.ended && !state.relayLive) scheduleRender();
      return;
    }

    detachVideo();
    state.video = video;
    state.lastDraw = 0;
    state.lastTopbarDraw = 0;
    state.hasAmbientFrame = false;
    state.drawFailed = false;
    ensureRoot().classList.add("ytfb-awaiting-frame");
    syncRelay(video);

    video.addEventListener("play", scheduleRender, { passive: true });
    video.addEventListener("playing", scheduleRender, { passive: true });
    video.addEventListener("pause", onVideoPauseOrEnd, { passive: true });
    video.addEventListener("ended", onVideoPauseOrEnd, { passive: true });
    video.addEventListener("loadedmetadata", onVideoReady, { passive: true });
    video.addEventListener("loadeddata", onVideoReady, { passive: true });
    video.addEventListener("canplay", onVideoReady, { passive: true });
    video.addEventListener("seeked", onVideoReady, { passive: true });

    onVideoReady();
  }

  function findAndAttachVideo() {
    const video = document.querySelector("video.html5-main-video") || document.querySelector("video");
    if (video && video !== state.video) attachVideo(video);
  }

  const AD_SKIP_SELECTORS = [
    ".ytp-skip-ad-button",
    ".ytp-ad-skip-button",
    ".ytp-ad-skip-button-modern",
    ".ytp-ad-skip-button-container button",
    ".ytp-ad-skip-ad-slot button",
    ".ytp-ad-player-overlay-skip-or-preview button",
    ".video-ads [class*='ad-skip'] button",
    ".video-ads .ytp-ad-skip-button",
    ".video-ads .ytp-ad-skip-button-modern",
    ".video-ads button[class*='skip']",
    "button[class*='skip-ad']"
  ];

  const AD_CLOSE_SELECTORS = [
    ".ytp-ad-overlay-close-button",
    ".ytp-ad-overlay-close-container button",
    ".video-ads button[aria-label*='Close']"
  ];

  const AD_VISIBLE_SELECTORS = [
    ".ytp-ad-preview-container",
    ".ytp-ad-text",
    ".ytp-ad-simple-ad-badge",
    ".ytp-ad-duration-remaining",
    ".ytp-ad-player-overlay",
    ".ytp-ad-player-overlay-layout__ad-info-container",
    ".ytp-ad-player-overlay-skip-or-preview",
    ".ytp-ad-skip-ad-slot",
    ".ytp-ad-action-interstitial",
    ".ytp-ad-player-overlay-instream-info",
    ".ytp-ad-message-container",
    ".ytp-ad-preview-text",
    ".ytp-ad-persistent-progress-bar-container",
    ".video-ads.ytp-ad-module > *"
  ];

  function reportBlocked(kind, count = 1) {
    if (!state.settings.enabled || !state.settings.adBlock) return;
    try {
      chrome.runtime.sendMessage(
        { type: "ytfb-blocked-event", kind, count },
        () => void chrome.runtime.lastError
      );
    } catch {
      // Extension context may be invalidated during an unpacked reload.
    }
  }

  const AD_REMOVE_SELECTORS = [
    "ytd-ad-slot-renderer",
    "ytd-in-feed-ad-layout-renderer",
    "ytd-display-ad-renderer",
    "ytd-promoted-video-renderer",
    "ytd-promoted-sparkles-web-renderer",
    "ytd-action-companion-ad-renderer",
    "ytd-player-legacy-desktop-watch-ads-renderer",
    "ytd-search-pyv-renderer",
    "ytd-rich-item-renderer:has(ytd-ad-slot-renderer)",
    "ytd-rich-section-renderer:has(ytd-ad-slot-renderer)"
  ];

  function removeCosmeticAds() {
    let removed = 0;
    for (const selector of AD_REMOVE_SELECTORS) {
      for (const element of document.querySelectorAll(selector)) {
        if (!element.isConnected) continue;
        element.remove();
        removed += 1;
      }
    }
    if (removed) reportBlocked("cosmetic", removed);
    return removed;
  }

  function trySkipPlayerApi(player) {
    if (!player || typeof player.skipAd !== "function") return false;
    try {
      player.skipAd();
      return true;
    } catch {
      return false;
    }
  }

  function seekAdTail(video) {
    if (!video?.isConnected) return false;
    const duration = Number(video.duration);
    if (!Number.isFinite(duration) || duration <= 0 || duration > 120) return false;
    const target = Math.max(video.currentTime, duration - 0.08);
    if (target <= video.currentTime + 0.12) return false;
    try {
      video.currentTime = target;
      state.adSeeks += 1;
      return true;
    } catch {
      return false;
    }
  }

  function elementVisible(element) {
    if (!(element instanceof Element)) return false;
    const rect = element.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return false;
    const style = getComputedStyle(element);
    return style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity || 1) > 0;
  }

  function hasVisibleAdUi(player = document.querySelector("#movie_player")) {
    if (AD_VISIBLE_SELECTORS.some((selector) =>
      [...document.querySelectorAll(selector)].some(elementVisible)
    )) {
      return true;
    }

    if (!player) return false;

    for (const element of player.querySelectorAll("[class*='ytp-ad-']")) {
      if (elementVisible(element)) return true;
    }

    for (const element of player.querySelectorAll("button, [role='button'], [aria-label], [title]")) {
      if (!elementVisible(element)) continue;
      const labels = [
        element.getAttribute("aria-label"),
        element.getAttribute("title"),
        element.textContent
      ].filter(Boolean);
      if (labels.some((label) => H.isAdSignalText(label))) return true;
    }

    return false;
  }

  function playerReportsAd() {
    const player = document.querySelector("#movie_player");
    if (!player) return false;
    if (player.classList.contains("ad-showing") || player.classList.contains("ad-interrupting")) {
      return true;
    }

    try {
      if (player.getVideoData?.().isAd) return true;
    } catch {
      // YouTube experiments do not all expose the same player API.
    }

    return hasVisibleAdUi(player);
  }

  function restoreAdPlayback() {
    document.documentElement.classList.remove("ytfb-ad-active");
    if (state.adTimer !== null) {
      clearTimeout(state.adTimer);
      state.adTimer = null;
    }

    const restore = state.adRestore;
    if (!restore) return;
    state.adRestore = null;

    if (restore.video?.isConnected) {
      try {
        restore.video.playbackRate = restore.playbackRate;
        restore.video.muted = restore.muted;
      } catch {
        // YouTube may replace the media element between the ad and content.
      }
    }
  }

  function keepAdAccelerated() {
    if (!state.settings.enabled || !state.settings.adBlock || !state.adRestore) {
      restoreAdPlayback();
      return;
    }

    if (!playerReportsAd()) {
      restoreAdPlayback();
      return;
    }

    const player = document.querySelector("#movie_player");
    const video = state.adRestore.video;
    if (!video?.isConnected) {
      restoreAdPlayback();
      return;
    }

    clickFirstVisible(AD_CLOSE_SELECTORS);
    if (tryClickAdSkip()) {
      state.adSkipClicks += 1;
      state.adTimer = setTimeout(keepAdAccelerated, 60);
      return;
    }
    if (trySkipPlayerApi(player)) {
      state.adSkipClicks += 1;
      if (!playerReportsAd()) {
        state.adTimer = setTimeout(keepAdAccelerated, 60);
        return;
      }
    }

    try {
      video.muted = true;
      video.playbackRate = 16;
      seekAdTail(video);
    } catch {
      restoreAdPlayback();
      return;
    }

    state.adTimer = setTimeout(keepAdAccelerated, 80);
  }

  function clickFirstVisible(selectors) {
    for (const selector of selectors) {
      for (const element of document.querySelectorAll(selector)) {
        if (!elementVisible(element)) continue;
        const clickable = element.closest("button") || element;
        clickable.click();
        return true;
      }
    }
    return false;
  }

  function clickLocalizedSkipControl() {
    const player = document.querySelector("#movie_player");
    if (!player) return false;

    for (const element of player.querySelectorAll("button, [role='button']")) {
      const labels = [
        element.getAttribute("aria-label"),
        element.getAttribute("title"),
        element.textContent
      ].filter(Boolean).map((label) => String(label).replace(/\s+/g, " ").trim());

      if (!labels.some((label) => H.isAdSkipLabel(label))) continue;

      // Once YouTube positively reports an ad, clicking a hidden-but-present
      // localized Skip control is safe and avoids a race with our cosmetic
      // shield. Some 2026 layouts do not keep a stable skip-button class.
      element.click();
      return true;
    }
    return false;
  }

  function tryClickAdSkip() {
    return clickFirstVisible(AD_SKIP_SELECTORS) || clickLocalizedSkipControl();
  }

  function queueAdCleanup(delay = 12) {
    if (state.adCleanupTimer !== null) return;
    state.adCleanupTimer = setTimeout(() => {
      state.adCleanupTimer = null;
      cleanupAds();
    }, delay);
  }

  function cleanupAds() {
    const shieldEnabled = state.settings.enabled && state.settings.adBlock;
    const html = document.documentElement;
    html.classList.toggle("ytfb-ad-shield", shieldEnabled);

    if (!shieldEnabled) {
      html.classList.remove("ytfb-ad-active");
      state.adEpisodeActive = false;
      restoreAdPlayback();
      return;
    }

    removeCosmeticAds();

    const player = document.querySelector("#movie_player");
    const adActive = playerReportsAd();
    html.classList.toggle("ytfb-ad-active", adActive);

    if (!adActive) {
      state.adEpisodeActive = false;
      restoreAdPlayback();
      return;
    }

    if (!state.adEpisodeActive) {
      state.adEpisodeActive = true;
      reportBlocked("player", 1);
    }

    clickFirstVisible(AD_CLOSE_SELECTORS);

    if (tryClickAdSkip()) {
      state.adSkipClicks += 1;
      queueAdCleanup(40);
      return;
    }
    if (trySkipPlayerApi(player)) {
      state.adSkipClicks += 1;
      if (!playerReportsAd()) {
        queueAdCleanup(40);
        return;
      }
    }

    const video = state.video || document.querySelector("video.html5-main-video") || document.querySelector("video");
    if (!video || video.readyState < 2) {
      queueAdCleanup(80);
      return;
    }

    // A positive YouTube ad state plus a short finite media duration is a safe
    // signal to jump to the segment tail. This prevents the ad from remaining
    // visible while the 16x fallback is working.
    seekAdTail(video);

    if (state.adRestore) {
      queueAdCleanup(80);
      return;
    }

    state.adRestore = {
      video,
      muted: video.muted,
      playbackRate: video.playbackRate
    };

    try {
      video.muted = true;
      video.playbackRate = 16;
      state.adAccelerations += 1;
      state.adTimer = setTimeout(keepAdAccelerated, 80);
    } catch {
      restoreAdPlayback();
    }
  }

  function stopAdObserver() {
    state.adObserver?.disconnect();
    state.adObservedPlayer = null;
    if (state.adCleanupTimer !== null) {
      clearTimeout(state.adCleanupTimer);
      state.adCleanupTimer = null;
    }
  }

  function syncAdObserver() {
    if (!state.settings.enabled || !state.settings.adBlock) {
      stopAdObserver();
      return;
    }

    const player = document.querySelector("#movie_player");
    if (!player) {
      stopAdObserver();
      return;
    }
    if (state.adObservedPlayer === player) return;

    stopAdObserver();
    state.adObserver ||= new MutationObserver(() => queueAdCleanup());
    state.adObserver.observe(player, {
      attributes: true,
      attributeFilter: ["class"],
      childList: true,
      subtree: true
    });
    state.adObservedPlayer = player;
  }

  function clearTopbarBrand() {
    document.getElementById("ytfb-brand-fallback")?.remove();
    clearTopbarVideoSurface();
    state.brandLogo?.classList.remove("ytfb-logo-anchor");
    document.querySelectorAll("ytd-topbar-logo-renderer.ytfb-logo-anchor")
      .forEach((logo) => logo.classList.remove("ytfb-logo-anchor"));
    state.brandLogo = null;
  }

  function syncTopbarBrand() {
    if (!state.active) {
      clearTopbarBrand();
      return;
    }

    // Remove stale v1.5 masthead surfaces. v1.6 reveals the same full-page
    // ambient surface through a transparent masthead for perfect continuity.
    clearTopbarVideoSurface();
    const masthead = document.querySelector("ytd-masthead#masthead");
    if (!masthead) return;

    const nativeLogo = masthead.querySelector("ytd-topbar-logo-renderer");
    const fallback = document.getElementById("ytfb-brand-fallback");

    if (nativeLogo?.isConnected) {
      nativeLogo.classList.add("ytfb-logo-anchor");
      state.brandLogo = nativeLogo;
      fallback?.remove();
      return;
    }

    state.brandLogo = null;
    const start = masthead.querySelector("#start");
    if (!start || fallback) return;

    const link = document.createElement("a");
    link.id = "ytfb-brand-fallback";
    link.className = "yt-simple-endpoint";
    link.href = "/";
    link.title = "YouTube Home";
    link.setAttribute("aria-label", "YouTube Home");

    const play = document.createElement("span");
    play.className = "ytfb-brand-play";
    play.setAttribute("aria-hidden", "true");

    const label = document.createElement("span");
    label.className = "ytfb-brand-word";
    label.textContent = "YouTube";

    link.append(play, label);
    start.append(link);
  }

  function startObserver() {
    if (!state.observer || state.observing) return;
    state.observer.observe(document.documentElement, { childList: true, subtree: true });
    state.observing = true;
  }

  function stopObserver() {
    if (state.mutationTimer !== null) {
      clearTimeout(state.mutationTimer);
      state.mutationTimer = null;
    }
    if (state.observer && state.observing) state.observer.disconnect();
    state.observing = false;
  }

  function syncWatchMode() {
    const flexy = document.querySelector("ytd-watch-flexy");
    const theater = Boolean(
      flexy?.hasAttribute("theater") ||
      flexy?.hasAttribute("full-bleed-player")
    );
    state.watchMode = theater ? "theater" : "normal";
    document.documentElement.classList.toggle("ytfb-theater", state.active && theater);
    document.documentElement.classList.toggle("ytfb-normal", state.active && !theater);
    queueScrollPresentation();
  }

  function stopWatchModeObserver() {
    state.watchModeObserver?.disconnect();
    state.observedFlexy = null;
  }

  function syncWatchModeObserver() {
    if (!state.active) {
      stopWatchModeObserver();
      return;
    }

    const flexy = document.querySelector("ytd-watch-flexy");
    if (!flexy) {
      stopWatchModeObserver();
      syncWatchMode();
      return;
    }

    if (state.observedFlexy !== flexy) {
      stopWatchModeObserver();
      state.watchModeObserver ||= new MutationObserver(syncWatchMode);
      state.watchModeObserver.observe(flexy, {
        attributes: true,
        attributeFilter: [
          "theater",
          "full-bleed-player",
          "default-layout",
          "default-two-column-layout",
          "class"
        ]
      });
      state.observedFlexy = flexy;
    }

    syncWatchMode();
  }

  function setDocked(next) {
    const value = Boolean(next) && state.active && !state.focus && state.settings.scrollMode !== "off";
    if (state.docked === value) return;
    state.docked = value;
    document.documentElement.classList.toggle("ytfb-docked", value);
  }

  function getPlayerAnchorBottom() {
    const flexy = document.querySelector("ytd-watch-flexy");
    const theater = Boolean(
      flexy?.hasAttribute("theater") ||
      flexy?.hasAttribute("full-bleed-player")
    );
    const selectors = theater
      ? ["#player-full-bleed-container", "#full-bleed-container", "ytd-player", "#movie_player", "#player-container-outer"]
      : ["#player-container-outer", "ytd-player", "#movie_player", "#player-full-bleed-container"];

    for (const selector of selectors) {
      const anchor = document.querySelector(selector);
      if (!anchor) continue;
      const rect = anchor.getBoundingClientRect();
      if (rect.width > 1 && rect.height > 1) return rect.bottom;
    }
    return NaN;
  }

  function applyScrollPresentation() {
    state.scrollRaf = null;
    if (!state.active) {
      setDocked(false);
      document.documentElement.classList.remove("ytfb-reading");
      return;
    }

    const presentation = H.computeScrollPresentation(
      window.scrollY,
      getPlayerAnchorBottom(),
      state.settings,
      state.docked
    );

    document.documentElement.classList.toggle(
      "ytfb-reading",
      Boolean(state.settings.readingCalm && presentation.reading)
    );

    if (state.focus) setDocked(false);
    else setDocked(presentation.dock);
  }

  function queueScrollPresentation() {
    if (state.scrollRaf !== null) return;
    state.scrollRaf = requestAnimationFrame(applyScrollPresentation);
  }

  function enterFocus() {
    if (!state.active) return;
    setDocked(false);
    state.focus = true;
    document.documentElement.classList.add("ytfb-focus");
  }

  function exitFocus() {
    state.focus = false;
    document.documentElement.classList.remove("ytfb-focus");
    queueScrollPresentation();
  }

  function applyFocusPreference() {
    if (state.settings.mode === "focus" && state.active) enterFocus();
    else exitFocus();
  }

  function activate(applyStartupMode = false) {
    state.active = true;
    ensureRoot();
    setVisualSettings();
    setFallback();
    document.documentElement.classList.add("ytfb-active");
    startObserver();
    ensureRenderWatchdog();
    syncWatchModeObserver();
    findAndAttachVideo();
    syncTopbarBrand();
    syncAdObserver();
    cleanupAds();
    if (state.video) { syncRelay(state.video); renderCurrentFrame(true); }

    if (applyStartupMode) applyFocusPreference();
    else if (state.settings.mode !== "focus" && state.focus) exitFocus();

    setDocked(state.docked);
    queueScrollPresentation();
    if (state.video && !state.video.paused && !state.relayLive) scheduleRender();
  }

  function deactivate() {
    state.active = false;
    stopObserver();
    stopRenderWatchdog();
    stopWatchModeObserver();
    cancelRenderLoop();
    detachVideo();
    exitFocus();
    setDocked(false);
    clearTopbarBrand();
    restoreAdPlayback();
    document.documentElement.classList.remove(
      "ytfb-active",
      "ytfb-reading",
      "ytfb-comment-glass",
      "ytfb-topbar-video-enabled",
      "ytfb-relay-live",
      "ytfb-topbar-relay-live",
      "ytfb-theater",
      "ytfb-normal",
      "ytfb-dock-small",
      "ytfb-dock-medium",
      "ytfb-dock-large"
    );
    state.hasAmbientFrame = false;
    state.drawFailed = false;
    if (state.root) state.root.classList.remove("ytfb-static", "ytfb-awaiting-frame");
    syncAdObserver();
    cleanupAds();
  }

  function syncPage(applyStartupMode = false) {
    const urlChanged = location.href !== state.lastUrl;
    const eligible = state.settings.enabled && H.isEligibleYouTubeUrl(location.href);
    state.lastUrl = location.href;

    if (!eligible) {
      deactivate();
      return;
    }

    if (!state.active || urlChanged) {
      setDocked(false);
      state.hasAmbientFrame = false;
      state.drawFailed = false;
      ensureRoot().classList.add("ytfb-awaiting-frame");
      activate(applyStartupMode);
      return;
    }

    setVisualSettings();
    syncWatchModeObserver();
    syncTopbarBrand();
    syncAdObserver();
    cleanupAds();
    if (state.video) { syncRelay(state.video); renderCurrentFrame(true); }
    if (state.settings.mode !== "focus" && state.focus) exitFocus();
    setDocked(state.docked);
    findAndAttachVideo();
    queueScrollPresentation();
    if (state.video && !state.video.paused && !state.relayLive) scheduleRender();
  }

  function onNavigation() {
    syncPage(true);
  }

  function onMutations() {
    if (!state.active || state.mutationTimer !== null) return;
    state.mutationTimer = setTimeout(() => {
      state.mutationTimer = null;
      if (!state.active) return;
      if (location.href !== state.lastUrl) {
        syncPage(true);
        return;
      }
      if (!state.video || !state.video.isConnected) findAndAttachVideo();
      const logoNeedsSync = !state.brandLogo?.isConnected ||
        !state.brandLogo.closest("ytd-masthead#masthead") ||
        document.getElementById("ytfb-brand-fallback");
      if (logoNeedsSync) syncTopbarBrand();
      if (state.observedFlexy !== document.querySelector("ytd-watch-flexy")) syncWatchModeObserver();
      if (state.adObservedPlayer !== document.querySelector("#movie_player")) syncAdObserver();
      cleanupAds();
    }, 250);
  }

  function onVisibility() {
    if (document.hidden) {
      cancelRenderLoop();
      stopRenderWatchdog();
    } else if (state.active) {
      ensureRenderWatchdog();
      findAndAttachVideo();
      syncWatchModeObserver();
      syncAdObserver();
      cleanupAds();
      if (state.video) {
        syncRelay(state.video);
        renderCurrentFrame(true);
      }
      if (!state.relayLive) scheduleRender();
      queueScrollPresentation();
    }
  }

  function onKeydown(event) {
    if (event.key === "Escape" && state.focus) {
      exitFocus();
      event.stopPropagation();
      return;
    }

    const target = event.target;
    const editable = target instanceof HTMLElement &&
      (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));
    if (editable) return;

    if (event.altKey && event.shiftKey && event.code === "KeyA") {
      state.settings = H.normalizeSettings({ ...state.settings, enabled: !state.settings.enabled });
      chrome.storage.sync.set({ ytfbSettings: state.settings });
      event.preventDefault();
    }

    if (event.altKey && event.shiftKey && event.code === "KeyD" && state.active) {
      setDocked(!state.docked);
      event.preventDefault();
    }
  }

  function bindOnce() {
    if (state.bound) return;
    state.bound = true;

    document.addEventListener("yt-navigate-finish", onNavigation, true);
    window.addEventListener("popstate", onNavigation, { passive: true });
    window.addEventListener("scroll", queueScrollPresentation, { passive: true });
    window.addEventListener("resize", queueScrollPresentation, { passive: true });
    document.addEventListener("visibilitychange", onVisibility, { passive: true });
    document.addEventListener("keydown", onKeydown, true);

    state.observer = new MutationObserver(onMutations);

    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "sync" || !changes.ytfbSettings) return;
      state.settings = H.normalizeSettings(changes.ytfbSettings.newValue);
      syncPage(false);
    });

    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (message?.type === "ytfb-version-probe") {
        sendResponse({ ok: true, version: RUNTIME_VERSION });
        return;
      }

      if (message?.type === "ytfb-toggle-focus") {
        if (!state.active) {
          sendResponse({ ok: false, reason: "not-on-watch-page" });
          return;
        }
        state.focus ? exitFocus() : enterFocus();
        sendResponse({ ok: true, focus: state.focus });
      }

      if (message?.type === "ytfb-toggle-dock") {
        if (!state.active || state.settings.scrollMode === "off") {
          sendResponse({ ok: false, reason: "dock-disabled" });
          return;
        }
        if (state.focus) exitFocus();
        setDocked(!state.docked);
        sendResponse({ ok: true, docked: state.docked });
      }

      if (message?.type === "ytfb-status") {
        sendResponse({
          ok: true,
          active: state.active,
          focus: state.focus,
          docked: state.docked,
          reading: document.documentElement.classList.contains("ytfb-reading"),
          drawing: Boolean(state.relayLive || state.timerId !== null || state.videoFrameCallbackId !== null),
          ambientFrame: Boolean(state.relayLive || state.hasAmbientFrame),
          ambientFrameAgeMs: state.relayLive
            ? 0
            : (state.lastDraw > 0 ? Math.round(performance.now() - state.lastDraw) : null),
          relayLive: state.relayLive,
          relayTime: state.relayVideo?.currentTime ?? null,
          relayTracks: state.relayStream?.getVideoTracks?.().length || 0,
          topbarRelayLive: false,
          topbarRelayTime: null,
          renderTimerActive: state.timerId !== null,
          videoFrameCallbackActive: state.videoFrameCallbackId !== null,
          renderWatchdogActive: state.renderWatchdogId !== null,
          canvas: state.canvas ? { width: state.canvas.width, height: state.canvas.height } : null,
          topbarVideo: Boolean(state.active && state.settings.topbarVideo),
          unifiedHeader: Boolean(state.active && state.settings.topbarVideo),
          topbarHost: null,
          topbarFrameAgeMs: state.relayLive
            ? 0
            : (state.lastDraw > 0 ? Math.round(performance.now() - state.lastDraw) : null),
          videoReady: Boolean(state.video?.readyState >= 2 && state.video?.videoWidth > 0),
          videoPaused: state.video ? state.video.paused : null,
          watchMode: state.watchMode,
          adBlock: Boolean(state.settings.adBlock),
          adSkips: state.adSkipClicks,
          adAccelerations: state.adAccelerations,
          adSeeks: state.adSeeks,
          adAccelerating: Boolean(state.adRestore),
          version: RUNTIME_VERSION,
          drawFailed: state.drawFailed
        });
      }
    });
  }

  bindOnce();
  ensureRoot();

  chrome.storage.sync.get({ ytfbSettings: H.DEFAULT_SETTINGS }, (result) => {
    state.settings = H.normalizeSettings(result.ytfbSettings);
    setVisualSettings();
    syncPage(true);
  });
})();
