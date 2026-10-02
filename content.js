(() => {
  "use strict";

  const H = globalThis.YTFBHelpers;
  if (!H) return;

  const state = {
    settings: H.normalizeSettings(),
    root: null,
    canvas: null,
    ctx: null,
    fallback: null,
    video: null,
    brandLogo: null,
    topbarCanvas: null,
    topbarCtx: null,
    lastTopbarDraw: 0,
    adRestore: null,
    adTimer: null,
    adSkipClicks: 0,
    adAccelerations: 0,
    adObserver: null,
    adObservedPlayer: null,
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

    const canvas = document.createElement("canvas");
    const shade = document.createElement("div");
    shade.className = "ytfb-shade";

    root.append(fallback, canvas, shade);
    (document.body || document.documentElement).prepend(root);

    state.root = root;
    state.fallback = fallback;
    state.canvas = canvas;
    state.ctx = canvas.getContext("2d", { alpha: false, desynchronized: true });
    return root;
  }

  function setFallback() {
    ensureRoot();
    const src = H.getThumbnailUrl(location.href);
    if (src && state.fallback.src !== src) state.fallback.src = src;
    state.root.classList.toggle("ytfb-static", state.drawFailed);
  }

  function clearTopbarVideoSurface() {
    state.topbarCanvas?.remove();
    state.topbarCanvas = null;
    state.topbarCtx = null;
    state.lastTopbarDraw = 0;
    document.documentElement.classList.remove("ytfb-topbar-video-enabled");
  }

  function ensureTopbarVideoSurface() {
    if (!state.active || !state.settings.topbarVideo) {
      clearTopbarVideoSurface();
      return null;
    }

    const container = document.querySelector("#masthead-container");
    if (!container) return null;
    if (state.topbarCanvas?.isConnected && state.topbarCanvas.parentElement === container) {
      return state.topbarCanvas;
    }

    state.topbarCanvas?.remove();
    const canvas = document.createElement("canvas");
    canvas.id = "ytfb-topbar-video";
    canvas.width = 384;
    canvas.height = 24;
    canvas.setAttribute("aria-hidden", "true");
    container.prepend(canvas);

    state.topbarCanvas = canvas;
    state.topbarCtx = canvas.getContext("2d", { alpha: false, desynchronized: true });
    state.lastTopbarDraw = 0;
    return canvas;
  }

  function drawTopbarFrame(video, now, force = false) {
    if (!state.settings.topbarVideo || !video || video.readyState < 2) return;
    if (!force && now - state.lastTopbarDraw < 450) return;

    const canvas = ensureTopbarVideoSurface();
    const ctx = state.topbarCtx;
    if (!canvas || !ctx || !video.videoWidth || !video.videoHeight) return;

    const sourceRatio = video.videoWidth / video.videoHeight;
    const targetRatio = canvas.width / canvas.height;
    let sx = 0;
    let sy = 0;
    let sw = video.videoWidth;
    let sh = video.videoHeight;

    if (sourceRatio < targetRatio) {
      sh = sw / targetRatio;
      sy = (video.videoHeight - sh) / 2;
    } else {
      sw = sh * targetRatio;
      sx = (video.videoWidth - sw) / 2;
    }

    try {
      ctx.filter = "none";
      ctx.drawImage(video, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
      state.lastTopbarDraw = now;
    } catch {
      // The main ambient fallback handles transient draw/cross-origin failures.
    }
  }

  function setVisualSettings() {
    const root = ensureRoot();
    root.style.setProperty("--ytfb-brightness", String(state.settings.brightness / 100));
    root.style.setProperty("--ytfb-blur", String(state.settings.blur) + "px");

    const html = document.documentElement;
    html.classList.toggle("ytfb-comment-glass", state.settings.commentGlass);
    html.classList.toggle("ytfb-topbar-video-enabled", state.active && state.settings.topbarVideo);
    html.classList.toggle("ytfb-ad-shield", state.settings.enabled && state.settings.adBlock);
    html.classList.remove("ytfb-dock-small", "ytfb-dock-medium", "ytfb-dock-large");
    html.classList.add("ytfb-dock-" + state.settings.dockSize);
  }

  function isRenderable() {
    return state.active &&
      state.settings.enabled &&
      H.isEligibleYouTubeUrl(location.href) &&
      !document.hidden &&
      state.video &&
      !state.video.paused &&
      !state.video.ended &&
      state.video.readyState >= 2;
  }

  function cancelRenderLoop() {
    if (state.timerId !== null) {
      clearTimeout(state.timerId);
      state.timerId = null;
    }
  }

  function drawFrame(now) {
    if (!isRenderable() || !H.shouldDrawFrame(now, state.lastDraw, state.settings.fps)) return;

    const video = state.video;
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
      drawTopbarFrame(video, now);
      state.lastDraw = now;
      if (state.drawFailed) {
        state.drawFailed = false;
        state.root.classList.remove("ytfb-static");
      }
    } catch {
      state.drawFailed = true;
      setFallback();
    }
  }

  function scheduleRender() {
    cancelRenderLoop();
    if (!isRenderable()) return;

    const interval = Math.max(100, Math.round(1000 / state.settings.fps));
    const tick = () => {
      state.timerId = null;
      if (!isRenderable()) return;
      drawFrame(performance.now());
      state.timerId = setTimeout(tick, interval);
    };
    state.timerId = setTimeout(tick, 0);
  }

  function detachVideo() {
    cancelRenderLoop();
    if (!state.video) return;
    state.video.removeEventListener("play", scheduleRender);
    state.video.removeEventListener("pause", cancelRenderLoop);
    state.video.removeEventListener("ended", cancelRenderLoop);
    state.video.removeEventListener("loadedmetadata", scheduleRender);
    state.video = null;
  }

  function attachVideo(video) {
    if (!video || state.video === video) return;
    detachVideo();
    state.video = video;
    state.lastDraw = 0;
    state.drawFailed = false;
    video.addEventListener("play", scheduleRender, { passive: true });
    video.addEventListener("pause", cancelRenderLoop, { passive: true });
    video.addEventListener("ended", cancelRenderLoop, { passive: true });
    video.addEventListener("loadedmetadata", scheduleRender, { passive: true });
    if (!video.paused) scheduleRender();
  }

  function findAndAttachVideo() {
    const video = document.querySelector("video.html5-main-video") || document.querySelector("video");
    if (video && video !== state.video) attachVideo(video);
  }

  const AD_SKIP_SELECTORS = [
    ".ytp-skip-ad-button",
    ".ytp-ad-skip-button",
    ".ytp-ad-skip-button-modern",
    "button[class*='skip-ad']"
  ];

  const AD_CLOSE_SELECTORS = [
    ".ytp-ad-overlay-close-button",
    ".ytp-ad-overlay-close-container button"
  ];

  function restoreAdPlayback() {
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

    const player = document.querySelector("#movie_player");
    const adShowing = Boolean(
      player?.classList.contains("ad-showing") ||
      player?.classList.contains("ad-interrupting")
    );
    if (!adShowing) {
      restoreAdPlayback();
      return;
    }

    const video = state.adRestore.video;
    if (!video?.isConnected) {
      restoreAdPlayback();
      return;
    }

    try {
      video.muted = true;
      video.playbackRate = 16;
    } catch {
      restoreAdPlayback();
      return;
    }

    state.adTimer = setTimeout(keepAdAccelerated, 180);
  }

  function clickFirstVisible(selectors) {
    for (const selector of selectors) {
      for (const element of document.querySelectorAll(selector)) {
        const rect = element.getBoundingClientRect();
        if (rect.width < 1 || rect.height < 1) continue;
        element.click();
        return true;
      }
    }
    return false;
  }

  function cleanupAds() {
    document.documentElement.classList.toggle("ytfb-ad-shield", state.settings.enabled && state.settings.adBlock);
    if (!state.settings.enabled || !state.settings.adBlock) {
      restoreAdPlayback();
      return;
    }

    const player = document.querySelector("#movie_player");
    const adShowing = Boolean(
      player?.classList.contains("ad-showing") ||
      player?.classList.contains("ad-interrupting")
    );

    if (!adShowing) {
      restoreAdPlayback();
      return;
    }

    clickFirstVisible(AD_CLOSE_SELECTORS);

    if (clickFirstVisible(AD_SKIP_SELECTORS)) {
      state.adSkipClicks += 1;
      return;
    }

    const video = state.video;
    if (!video || video.readyState < 2 || state.adRestore) return;

    state.adRestore = {
      video,
      muted: video.muted,
      playbackRate: video.playbackRate
    };

    try {
      video.muted = true;
      video.playbackRate = 16;
      state.adAccelerations += 1;
      state.adTimer = setTimeout(keepAdAccelerated, 180);
    } catch {
      restoreAdPlayback();
    }
  }

  function stopAdObserver() {
    state.adObserver?.disconnect();
    state.adObservedPlayer = null;
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
    state.adObserver ||= new MutationObserver(cleanupAds);
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

    ensureTopbarVideoSurface();
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

  function setDocked(next) {
    const value = Boolean(next) && state.active && !state.focus && state.settings.scrollMode !== "off";
    if (state.docked === value) return;
    state.docked = value;
    document.documentElement.classList.toggle("ytfb-docked", value);
  }

  function getPlayerAnchorBottom() {
    const anchor =
      document.querySelector("#player-container-outer") ||
      document.querySelector("#player-full-bleed-container") ||
      document.querySelector("ytd-player") ||
      document.querySelector("#movie_player");
    if (!anchor) return NaN;
    return anchor.getBoundingClientRect().bottom;
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
    findAndAttachVideo();
    syncTopbarBrand();
    syncAdObserver();
    cleanupAds();
    if (state.video) drawTopbarFrame(state.video, performance.now(), true);

    if (applyStartupMode) applyFocusPreference();
    else if (state.settings.mode !== "focus" && state.focus) exitFocus();

    setDocked(state.docked);
    queueScrollPresentation();
    if (state.video && !state.video.paused) scheduleRender();
  }

  function deactivate() {
    state.active = false;
    stopObserver();
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
      "ytfb-dock-small",
      "ytfb-dock-medium",
      "ytfb-dock-large"
    );
    if (state.root) state.root.classList.remove("ytfb-static");
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
      activate(applyStartupMode);
      return;
    }

    setVisualSettings();
    syncTopbarBrand();
    syncAdObserver();
    cleanupAds();
    if (state.video) drawTopbarFrame(state.video, performance.now(), true);
    if (state.settings.mode !== "focus" && state.focus) exitFocus();
    setDocked(state.docked);
    findAndAttachVideo();
    queueScrollPresentation();
    if (state.video && !state.video.paused) scheduleRender();
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
      const topbarNeedsSync = state.settings.topbarVideo &&
        (!state.topbarCanvas?.isConnected ||
          state.topbarCanvas.parentElement !== document.querySelector("#masthead-container"));
      if (logoNeedsSync || topbarNeedsSync) syncTopbarBrand();
      if (state.adObservedPlayer !== document.querySelector("#movie_player")) syncAdObserver();
      cleanupAds();
    }, 250);
  }

  function onVisibility() {
    if (document.hidden) cancelRenderLoop();
    else if (state.active) {
      findAndAttachVideo();
      syncAdObserver();
      cleanupAds();
      if (state.video) drawTopbarFrame(state.video, performance.now(), true);
      scheduleRender();
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
          drawing: Boolean(state.timerId !== null),
          canvas: state.canvas ? { width: state.canvas.width, height: state.canvas.height } : null,
          topbarVideo: Boolean(state.topbarCanvas?.isConnected && state.settings.topbarVideo),
          adBlock: Boolean(state.settings.adBlock),
          adSkips: state.adSkipClicks,
          adAccelerations: state.adAccelerations,
          adAccelerating: Boolean(state.adRestore),
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
