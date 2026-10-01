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
    observer: null,
    timerId: null,
    lastDraw: 0,
    active: false,
    focus: false,
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

  function setVisualSettings() {
    const root = ensureRoot();
    root.style.setProperty("--ytfb-brightness", String(state.settings.brightness / 100));
    root.style.setProperty("--ytfb-blur", String(state.settings.blur) + "px");
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
    const size = H.computeCanvasSize(video.videoWidth, video.videoHeight, state.settings.quality);
    if (state.canvas.width !== size.width || state.canvas.height !== size.height) {
      state.canvas.width = size.width;
      state.canvas.height = size.height;
    }

    try {
      const internalBlur = Math.max(2, state.settings.blur / 6);
      state.ctx.filter = "blur(" + internalBlur.toFixed(1) + "px) saturate(1.3)";
      state.ctx.drawImage(video, 0, 0, state.canvas.width, state.canvas.height);
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

  function enterFocus() {
    if (!state.active) return;
    state.focus = true;
    document.documentElement.classList.add("ytfb-focus");
  }

  function exitFocus() {
    state.focus = false;
    document.documentElement.classList.remove("ytfb-focus");
  }

  function applyFocusPreference() {
    if (state.settings.mode === "focus" && state.active) enterFocus();
    else exitFocus();
  }

  function activate() {
    state.active = true;
    ensureRoot();
    setVisualSettings();
    setFallback();
    document.documentElement.classList.add("ytfb-active");
    findAndAttachVideo();
    applyFocusPreference();
    if (state.video && !state.video.paused) scheduleRender();
  }

  function deactivate() {
    state.active = false;
    cancelRenderLoop();
    exitFocus();
    document.documentElement.classList.remove("ytfb-active");
    if (state.root) state.root.classList.remove("ytfb-static");
  }

  function syncPage() {
    state.lastUrl = location.href;
    if (state.settings.enabled && H.isEligibleYouTubeUrl(location.href)) activate();
    else deactivate();
  }

  function onMutations() {
    if (state.mutationTimer !== null) return;
    state.mutationTimer = setTimeout(() => {
      state.mutationTimer = null;
      if (location.href !== state.lastUrl) syncPage();
      if (state.active && (!state.video || !state.video.isConnected)) findAndAttachVideo();
    }, 250);
  }

  function onVisibility() {
    if (document.hidden) cancelRenderLoop();
    else if (state.active) {
      findAndAttachVideo();
      scheduleRender();
    }
  }

  function onKeydown(event) {
    if (event.key === "Escape" && state.focus) {
      exitFocus();
      event.stopPropagation();
    }
  }

  function bindOnce() {
    if (state.bound) return;
    state.bound = true;

    document.addEventListener("yt-navigate-finish", syncPage, true);
    window.addEventListener("popstate", syncPage, { passive: true });
    document.addEventListener("visibilitychange", onVisibility, { passive: true });
    document.addEventListener("keydown", onKeydown, true);

    state.observer = new MutationObserver(onMutations);
    state.observer.observe(document.documentElement, { childList: true, subtree: true });

    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "sync" || !changes.ytfbSettings) return;
      state.settings = H.normalizeSettings(changes.ytfbSettings.newValue);
      setVisualSettings();
      syncPage();
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
      if (message?.type === "ytfb-status") {
        sendResponse({
          ok: true,
          active: state.active,
          focus: state.focus,
          drawing: Boolean(state.timerId !== null),
          canvas: state.canvas ? { width: state.canvas.width, height: state.canvas.height } : null,
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
    syncPage();
  });
})();
