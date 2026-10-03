const fs = require("node:fs");
const path = require("node:path");

(async () => {
  const port = Number(process.argv[2] || 9244);
  const targets = await fetch("http://127.0.0.1:" + port + "/json/list").then((r) => r.json());
  const target = targets.find((t) => t.type === "page" && /youtube\.com\/watch/.test(t.url));
  if (!target) throw new Error("No YouTube watch page target found");

  const ws = new WebSocket(target.webSocketDebuggerUrl);
  let nextId = 1;
  const pending = new Map();

  await new Promise((resolve, reject) => {
    ws.addEventListener("open", resolve, { once: true });
    ws.addEventListener("error", reject, { once: true });
  });

  ws.addEventListener("message", (event) => {
    const msg = JSON.parse(String(event.data));
    if (!msg.id || !pending.has(msg.id)) return;
    const job = pending.get(msg.id);
    pending.delete(msg.id);
    if (msg.error) job.reject(new Error(msg.error.message));
    else job.resolve(msg.result);
  });

  function call(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = nextId++;
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
      setTimeout(() => {
        if (!pending.has(id)) return;
        pending.delete(id);
        reject(new Error("CDP timeout: " + method));
      }, 8000);
    });
  }

  async function evaluate(expression) {
    const result = await call("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true
    });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || "Evaluation failed");
    return result.result?.value;
  }

  async function wait(ms) {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }

  const root = path.resolve(__dirname, "..");
  const css = fs.readFileSync(path.join(root, "content.css"), "utf8");
  const helpers = fs.readFileSync(path.join(root, "helpers.js"), "utf8");
  const content = fs.readFileSync(path.join(root, "content.js"), "utf8");

  await evaluate(`(() => {
    document.getElementById("ytfb-root")?.remove();
    document.getElementById("ytfb-brand-fallback")?.remove();
    document.querySelectorAll(".ytfb-logo-anchor").forEach((el) => el.classList.remove("ytfb-logo-anchor"));
    document.documentElement.classList.remove(
      "ytfb-active","ytfb-reading","ytfb-docked","ytfb-focus",
      "ytfb-comment-glass","ytfb-dock-small","ytfb-dock-medium","ytfb-dock-large"
    );

    let style = document.getElementById("ytfb-dev-style");
    if (!style) {
      style = document.createElement("style");
      style.id = "ytfb-dev-style";
      document.documentElement.appendChild(style);
    }
    style.textContent = ${JSON.stringify(css)};

    globalThis.__ytfbStorageListener = null;
    globalThis.__ytfbRuntimeListener = null;
    globalThis.chrome = {
      storage: {
        sync: {
          get(defaults, cb) { cb(defaults); },
          set(_value, cb) { if (cb) cb(); }
        },
        onChanged: {
          addListener(fn) { globalThis.__ytfbStorageListener = fn; }
        }
      },
      runtime: {
        lastError: null,
        onMessage: {
          addListener(fn) { globalThis.__ytfbRuntimeListener = fn; }
        }
      }
    };
  })()`);

  await evaluate(helpers);
  await evaluate(content);
  await wait(1200);

  await evaluate(`(() => {
    const flexy = document.querySelector("ytd-watch-flexy");
    flexy?.removeAttribute("theater");
    flexy?.removeAttribute("full-bleed-player");
  })()`);
  await wait(500);

  const initial = JSON.parse(await evaluate(`JSON.stringify((() => {
    const masthead = document.querySelector("#masthead-container");
    const nativeLogo = document.querySelector("ytd-masthead#masthead ytd-topbar-logo-renderer");
    const logoLink = nativeLogo?.querySelector("a#logo");
    const logoRect = nativeLogo?.getBoundingClientRect();
    const logoLinkStyle = logoLink ? getComputedStyle(logoLink) : null;
    const mastheadStyle = masthead ? getComputedStyle(masthead) : null;
    const canvas = document.querySelector("#ytfb-root canvas");
    const topbar = document.querySelector("#ytfb-topbar-video");
    const topbarStyle = topbar ? getComputedStyle(topbar) : null;
    return {
      active: document.documentElement.classList.contains("ytfb-active"),
      docked: document.documentElement.classList.contains("ytfb-docked"),
      reading: document.documentElement.classList.contains("ytfb-reading"),
      glass: document.documentElement.classList.contains("ytfb-comment-glass"),
      canvas: canvas ? [canvas.width, canvas.height] : null,
      normalMode: document.documentElement.classList.contains("ytfb-normal"),
      theaterMode: document.documentElement.classList.contains("ytfb-theater"),
      topbarCanvas: topbar ? [topbar.width, topbar.height] : null,
      topbarPointerEvents: topbarStyle?.pointerEvents || null,
      topbarOpacity: topbarStyle?.opacity || null,
      topbarHost: topbar?.parentElement?.id || topbar?.parentElement?.tagName || null,
      nativeLogoVisible: Boolean(nativeLogo && logoRect.width >= 40 && logoRect.height >= 20),
      logoAccent: Boolean(nativeLogo?.classList.contains("ytfb-logo-anchor")),
      logoHref: logoLink?.getAttribute("href") || null,
      logoTitle: logoLink?.getAttribute("title") || null,
      logoPointerEvents: logoLinkStyle?.pointerEvents || null,
      fallbackCount: document.querySelectorAll("#ytfb-brand-fallback").length,
      mastheadBorder: mastheadStyle?.borderBottomWidth || null,
      mastheadBackground: mastheadStyle?.backgroundColor || null
    };
  })())`));

  await evaluate(`(() => {
    const nativeLogo = document.querySelector("ytd-masthead#masthead ytd-topbar-logo-renderer");
    if (!nativeLogo?.parentNode) return false;
    globalThis.__ytfbRemovedNativeLogo = {
      node: nativeLogo,
      parent: nativeLogo.parentNode,
      next: nativeLogo.nextSibling
    };
    nativeLogo.remove();
    return true;
  })()`);
  await wait(500);

  const fallbackWhenNativeHidden = JSON.parse(await evaluate(`JSON.stringify((() => {
    const fallback = document.getElementById("ytfb-brand-fallback");
    const rect = fallback?.getBoundingClientRect();
    return {
      exists: Boolean(fallback),
      visible: Boolean(fallback && rect.width > 60 && rect.height >= 20),
      label: fallback?.getAttribute("aria-label") || null
    };
  })())`));

  await evaluate(`(() => {
    const saved = globalThis.__ytfbRemovedNativeLogo;
    if (saved?.node && saved.parent?.isConnected) {
      const before = saved.next?.parentNode === saved.parent ? saved.next : null;
      saved.parent.insertBefore(saved.node, before);
    }
    globalThis.__ytfbRemovedNativeLogo = null;
  })()`);
  await wait(500);

  const nativeRestored = JSON.parse(await evaluate(`JSON.stringify({
    fallbackGone: !document.getElementById("ytfb-brand-fallback"),
    logoAccent: Boolean(document.querySelector("ytd-masthead#masthead ytd-topbar-logo-renderer")?.classList.contains("ytfb-logo-anchor"))
  })`));

  await evaluate(`(() => {
    const flexy = document.querySelector("ytd-watch-flexy");
    flexy?.setAttribute("theater", "");
    flexy?.setAttribute("full-bleed-player", "");
  })()`);
  await wait(650);

  const theaterMode = JSON.parse(await evaluate(`JSON.stringify((() => {
    const flexy = document.querySelector("ytd-watch-flexy");
    const fullBleed = document.querySelector("#full-bleed-container");
    const movie = document.querySelector("#movie_player");
    const topbar = document.querySelector("#ytfb-topbar-video");
    let status = null;
    globalThis.__ytfbRuntimeListener?.({ type: "ytfb-status" }, null, (response) => { status = response; });
    return {
      flexyTheater: Boolean(flexy?.hasAttribute("theater") || flexy?.hasAttribute("full-bleed-player")),
      htmlTheater: document.documentElement.classList.contains("ytfb-theater"),
      htmlNormal: document.documentElement.classList.contains("ytfb-normal"),
      fullBleedBackground: fullBleed ? getComputedStyle(fullBleed).backgroundColor : null,
      movieBackground: movie ? getComputedStyle(movie).backgroundColor : null,
      topbarConnected: Boolean(topbar?.isConnected),
      topbarSize: topbar ? [topbar.width, topbar.height] : null,
      statusMode: status?.watchMode || null
    };
  })())`));

  await evaluate(`(() => {
    const flexy = document.querySelector("ytd-watch-flexy");
    flexy?.removeAttribute("theater");
    flexy?.removeAttribute("full-bleed-player");
  })()`);
  await wait(650);

  const normalMode = JSON.parse(await evaluate(`JSON.stringify((() => {
    const flexy = document.querySelector("ytd-watch-flexy");
    const topbar = document.querySelector("#ytfb-topbar-video");
    let status = null;
    globalThis.__ytfbRuntimeListener?.({ type: "ytfb-status" }, null, (response) => { status = response; });
    return {
      flexyTheater: Boolean(flexy?.hasAttribute("theater") || flexy?.hasAttribute("full-bleed-player")),
      htmlTheater: document.documentElement.classList.contains("ytfb-theater"),
      htmlNormal: document.documentElement.classList.contains("ytfb-normal"),
      topbarConnected: Boolean(topbar?.isConnected),
      statusMode: status?.watchMode || null
    };
  })())`));

  const focusLifecycle = JSON.parse(await evaluate(`JSON.stringify((() => {
    const storage = globalThis.__ytfbStorageListener;
    const runtime = globalThis.__ytfbRuntimeListener;
    if (!storage || !runtime) return { hooks: false };

    const focusSettings = {
      enabled: true, mode: "focus", brightness: 50, blur: 42,
      fps: 4, quality: "medium", scrollMode: "dock", dockSize: "medium",
      readingCalm: true, commentGlass: true
    };
    storage({ ytfbSettings: { newValue: focusSettings } }, "sync");
    const focusAfterModeSetting = document.documentElement.classList.contains("ytfb-focus");

    let toggleResponse = null;
    runtime({ type: "ytfb-toggle-focus" }, null, (response) => { toggleResponse = response; });
    const focusAfterManualToggle = document.documentElement.classList.contains("ytfb-focus");

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    const focusAfterEscape = document.documentElement.classList.contains("ytfb-focus");

    storage({
      ytfbSettings: { newValue: { ...focusSettings, brightness: 61 } }
    }, "sync");
    const focusAfterBrightnessChange = document.documentElement.classList.contains("ytfb-focus");

    return {
      hooks: true,
      focusAfterModeSetting,
      focusAfterManualToggle,
      toggleOk: Boolean(toggleResponse?.ok),
      focusAfterEscape,
      focusAfterBrightnessChange
    };
  })())`));

  await evaluate(`window.scrollTo({ top: Math.max(1200, document.documentElement.scrollHeight * 0.25), behavior: "instant" })`);
  await wait(700);

  const scrolled = JSON.parse(await evaluate(`JSON.stringify({
    y: window.scrollY,
    docked: document.documentElement.classList.contains("ytfb-docked"),
    reading: document.documentElement.classList.contains("ytfb-reading"),
    playerPosition: getComputedStyle(document.querySelector("#movie_player")).position,
    logoAccent: Boolean(document.querySelector("ytd-masthead#masthead ytd-topbar-logo-renderer")?.classList.contains("ytfb-logo-anchor"))
  })`));

  await evaluate(`window.scrollTo({ top: 0, behavior: "instant" })`);
  await wait(500);

  const restored = JSON.parse(await evaluate(`JSON.stringify({
    y: window.scrollY,
    docked: document.documentElement.classList.contains("ytfb-docked"),
    reading: document.documentElement.classList.contains("ytfb-reading")
  })`));

  const lifecycle = JSON.parse(await evaluate(`JSON.stringify((() => {
    const watchUrl = location.href;
    history.pushState({}, "", "/");
    document.dispatchEvent(new Event("yt-navigate-finish", { bubbles: true }));
    const inactive = !document.documentElement.classList.contains("ytfb-active");
    const brandCleared = !document.getElementById("ytfb-brand-fallback") &&
      !document.querySelector(".ytfb-logo-anchor");
    const adShieldOnHome = document.documentElement.classList.contains("ytfb-ad-shield");

    history.pushState({}, "", watchUrl);
    document.dispatchEvent(new Event("yt-navigate-finish", { bubbles: true }));
    return {
      inactive,
      brandCleared,
      adShieldOnHome,
      activeAgain: document.documentElement.classList.contains("ytfb-active")
    };
  })())`));
  await wait(350);

  const result = {
    initial,
    fallbackWhenNativeHidden,
    nativeRestored,
    theaterMode,
    normalMode,
    focusLifecycle,
    scrolled,
    restored,
    lifecycle
  };
  console.log(JSON.stringify(result, null, 2));

  if (!initial.active || initial.docked || !initial.glass || !initial.normalMode || initial.theaterMode ||
      !Array.isArray(initial.topbarCanvas) || initial.topbarCanvas[0] !== 480 || initial.topbarCanvas[1] !== 36 ||
      initial.topbarPointerEvents !== "none" || Number(initial.topbarOpacity) < 0.9) process.exitCode = 2;
  if (!initial.logoAccent || initial.logoHref !== "/" || initial.logoPointerEvents === "none") process.exitCode = 3;
  if (initial.mastheadBorder !== "1px") process.exitCode = 4;
  if (fallbackWhenNativeHidden.exists && (!fallbackWhenNativeHidden.visible || fallbackWhenNativeHidden.label !== "YouTube Home")) process.exitCode = 5;
  if (!nativeRestored.logoAccent) process.exitCode = 6;
  if (!theaterMode.flexyTheater || !theaterMode.htmlTheater || theaterMode.htmlNormal ||
      theaterMode.fullBleedBackground !== "rgba(0, 0, 0, 0)" ||
      theaterMode.movieBackground !== "rgba(0, 0, 0, 0)" ||
      !theaterMode.topbarConnected || theaterMode.statusMode !== "theater") process.exitCode = 11;
  if (normalMode.flexyTheater || normalMode.htmlTheater || !normalMode.htmlNormal ||
      !normalMode.topbarConnected || normalMode.statusMode !== "normal") process.exitCode = 12;
  if (!focusLifecycle.hooks || focusLifecycle.focusAfterModeSetting || !focusLifecycle.focusAfterManualToggle ||
      !focusLifecycle.toggleOk || focusLifecycle.focusAfterEscape || focusLifecycle.focusAfterBrightnessChange) process.exitCode = 7;
  if (scrolled.y > 180 && (!scrolled.docked || !scrolled.reading ||
      scrolled.playerPosition !== "fixed" || !scrolled.logoAccent)) process.exitCode = 8;
  if (restored.docked || restored.reading) process.exitCode = 9;
  if (!lifecycle.inactive || !lifecycle.brandCleared || !lifecycle.adShieldOnHome || !lifecycle.activeAgain) process.exitCode = 10;

  ws.close();
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
