(async () => {
  const port = Number(process.argv[2] || 9270);
  const targets = await fetch("http://127.0.0.1:" + port + "/json/list").then((r) => r.json());
  const target = targets.find((t) => t.type === "page" && /youtube\.com/.test(t.url));
  if (!target) throw new Error("No YouTube page target found");

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

  function evaluate(expression) {
    return new Promise((resolve, reject) => {
      const id = nextId++;
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({
        id,
        method: "Runtime.evaluate",
        params: { expression, returnByValue: true }
      }));
      setTimeout(() => {
        if (!pending.has(id)) return;
        pending.delete(id);
        reject(new Error("CDP timeout"));
      }, 8000);
    });
  }

  await evaluate(`(() => {
    const player = document.querySelector("#movie_player");
    if (!player) return false;

    globalThis.__ytfbAdSkipClicked = false;
    document.getElementById("ytfb-audit-skip")?.remove();

    const button = document.createElement("button");
    button.id = "ytfb-audit-skip";
    button.className = "ytp-ad-skip-button-modern";
    button.textContent = "Skip ad";
    button.style.cssText = "position:fixed;left:20px;top:80px;width:120px;height:40px;z-index:2147483647";
    button.addEventListener("click", () => {
      globalThis.__ytfbAdSkipClicked = true;
      player.classList.remove("ad-showing");
      button.remove();
    });

    player.classList.add("ad-showing");
    player.append(button);

    const marker = document.createElement("i");
    marker.id = "ytfb-audit-mutation";
    document.body.append(marker);
    marker.remove();
    return true;
  })()`);

  await new Promise((resolve) => setTimeout(resolve, 700));

  const adAccelerationStart = await evaluate(`(() => {
    const player = document.querySelector("#movie_player");
    const video = document.querySelector("video.html5-main-video") || document.querySelector("video");
    if (!player || !video) return null;
    globalThis.__ytfbAuditRate = video.playbackRate;
    globalThis.__ytfbAuditMuted = video.muted;
    player.classList.add("ad-showing");
    return { rate: video.playbackRate, muted: video.muted };
  })()`);

  await new Promise((resolve) => setTimeout(resolve, 600));

  const adAccelerationActive = await evaluate(`(() => {
    const video = document.querySelector("video.html5-main-video") || document.querySelector("video");
    return video ? { rate: video.playbackRate, muted: video.muted } : null;
  })()`);
  const adStatusActive = await evaluate(`JSON.stringify((() => {
    let value = null;
    globalThis.__ytfbRuntimeListener?.({ type: "ytfb-status" }, null, (response) => { value = response; });
    return value;
  })())`);

  await evaluate(`document.querySelector("#movie_player")?.classList.remove("ad-showing")`);
  await new Promise((resolve) => setTimeout(resolve, 600));

  const adAccelerationRestored = await evaluate(`(() => {
    const video = document.querySelector("video.html5-main-video") || document.querySelector("video");
    return video ? {
      rate: video.playbackRate,
      muted: video.muted,
      expectedRate: globalThis.__ytfbAuditRate,
      expectedMuted: globalThis.__ytfbAuditMuted
    } : null;
  })()`);
  const adStatusRestored = await evaluate(`JSON.stringify((() => {
    let value = null;
    globalThis.__ytfbRuntimeListener?.({ type: "ytfb-status" }, null, (response) => { value = response; });
    return value;
  })())`);

  const result = await evaluate(`(() => {
    const selectors = [
      "ytd-masthead#masthead",
      "#masthead-container",
      "#ytfb-topbar-video",
      "ytd-topbar-logo-renderer",
      "ytd-topbar-logo-renderer #logo",
      "ytd-topbar-logo-renderer #logo-icon",
      "a#logo",
      "#start",
      "#center",
      "#end"
    ];

    const inspect = (selector) => {
      const el = document.querySelector(selector);
      if (!el) return { selector, found: false };
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return {
        selector,
        found: true,
        tag: el.tagName,
        id: el.id,
        classes: el.className?.toString?.() || "",
        display: cs.display,
        visibility: cs.visibility,
        opacity: cs.opacity,
        position: cs.position,
        pointerEvents: cs.pointerEvents,
        filter: cs.filter,
        zIndex: cs.zIndex,
        width: Math.round(r.width),
        height: Math.round(r.height),
        x: Math.round(r.x),
        y: Math.round(r.y),
        intrinsicWidth: el instanceof HTMLCanvasElement ? el.width : null,
        intrinsicHeight: el instanceof HTMLCanvasElement ? el.height : null,
        text: (el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 120)
      };
    };

    const adSelectors = [
      "#player-ads",
      ".ytp-ad-overlay-container",
      "ytd-ad-slot-renderer",
      "ytd-in-feed-ad-layout-renderer",
      "ytd-display-ad-renderer",
      "ytd-promoted-video-renderer"
    ];

    return {
      url: location.href,
      title: document.title,
      active: document.documentElement.classList.contains("ytfb-active"),
      topbarVideoEnabled: document.documentElement.classList.contains("ytfb-topbar-video-enabled"),
      adShieldEnabled: document.documentElement.classList.contains("ytfb-ad-shield"),
      adSkipSimulated: Boolean(globalThis.__ytfbAdSkipClicked),
      playerStillAdShowing: document.querySelector("#movie_player")?.classList.contains("ad-showing") ?? null,
      selectors: selectors.map(inspect),
      adContainers: adSelectors.map((selector) => ({
        selector,
        count: document.querySelectorAll(selector).length,
        visibleCount: [...document.querySelectorAll(selector)].filter((el) => getComputedStyle(el).display !== "none").length
      })),
      logoCandidates: [...document.querySelectorAll("ytd-topbar-logo-renderer, a#logo, #logo-icon")].map((el) => ({
        tag: el.tagName,
        id: el.id,
        text: (el.textContent || "").trim().slice(0, 80),
        html: el.outerHTML.slice(0, 400)
      }))
    };
  })()`);

  const value = result.result?.value ?? null;
  value.adAccelerationStart = adAccelerationStart?.result?.value ?? null;
  value.adAccelerationActive = adAccelerationActive?.result?.value ?? null;
  value.adStatusActive = JSON.parse(adStatusActive?.result?.value || "null");
  value.adAccelerationRestored = adAccelerationRestored?.result?.value ?? null;
  value.adStatusRestored = JSON.parse(adStatusRestored?.result?.value || "null");
  console.log(JSON.stringify(value, null, 2));

  const topbar = value?.selectors?.find((item) => item.selector === "#ytfb-topbar-video");
  if (!value?.active || !value?.topbarVideoEnabled || !value?.adShieldEnabled) process.exitCode = 2;
  if (!topbar?.found || topbar.intrinsicWidth !== 640 || topbar.intrinsicHeight !== 64 ||
      topbar.pointerEvents !== "none") process.exitCode = 3;
  if (!value?.adSkipSimulated || value?.playerStillAdShowing) process.exitCode = 4;
  if (!value?.adAccelerationActive?.muted || value.adAccelerationActive.rate < 8 ||
      !value?.adStatusActive?.adAccelerating || value?.adStatusActive?.adAccelerations < 1) process.exitCode = 5;
  if (value?.adAccelerationRestored?.rate !== value?.adAccelerationRestored?.expectedRate ||
      value?.adStatusRestored?.adAccelerating) process.exitCode = 6;

  ws.close();
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
