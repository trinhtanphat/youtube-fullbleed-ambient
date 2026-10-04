const crypto = require("node:crypto");

(async () => {
  const port = Number(process.argv[2] || 9295);
  const strictMotion = process.argv.includes("--strict-motion");
  const requireInstalled = process.argv.includes("--require-installed");

  const targets = await fetch("http://127.0.0.1:" + port + "/json/list").then((r) => r.json());
  const target = targets.find((item) => item.type === "page" && /youtube\.com\/watch/.test(item.url));
  if (!target) throw new Error("No YouTube watch target found on CDP port " + port);

  const ws = new WebSocket(target.webSocketDebuggerUrl);
  let nextId = 0;
  const pending = new Map();

  await new Promise((resolve, reject) => {
    ws.addEventListener("open", resolve, { once: true });
    ws.addEventListener("error", reject, { once: true });
  });

  ws.addEventListener("message", (event) => {
    const message = JSON.parse(String(event.data));
    if (!message.id || !pending.has(message.id)) return;
    const job = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) job.reject(new Error(message.error.message));
    else job.resolve(message.result);
  });

  function call(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = ++nextId;
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
      setTimeout(() => {
        if (!pending.has(id)) return;
        pending.delete(id);
        reject(new Error("CDP timeout: " + method));
      }, 10000);
    });
  }

  async function evaluate(expression) {
    const result = await call("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true
    });
    return result.result?.value;
  }

  function hashScreenshot(result) {
    return crypto
      .createHash("sha256")
      .update(Buffer.from(result.data, "base64"))
      .digest("hex");
  }

  async function readState() {
    const expression =
      "JSON.stringify((()=>{" +
      "const html=document.documentElement;" +
      "const video=document.querySelector('video.html5-main-video')||document.querySelector('video');" +
      "const relay=document.querySelector('.ytfb-relay');" +
      "const root=document.querySelector('#ytfb-root');" +
      "const masthead=document.querySelector('#masthead-container');" +
      "const mastheadStyle=masthead?getComputedStyle(masthead):null;" +
      "const rect=masthead?.getBoundingClientRect();" +
      "return {" +
      "url:location.href," +
      "mainWorldInjected:Boolean(globalThis.__ytfbRuntimeListener)," +
      "active:html.classList.contains('ytfb-active')," +
      "normal:html.classList.contains('ytfb-normal')," +
      "theater:html.classList.contains('ytfb-theater')," +
      "relayLive:html.classList.contains('ytfb-relay-live')," +
      "root:Boolean(root)," +
      "canvas:Boolean(root?.querySelector('canvas'))," +
      "relay:Boolean(relay)," +
      "legacyTopbarCanvas:Boolean(document.querySelector('#ytfb-topbar-video'))," +
      "legacyTopbarRelay:Boolean(document.querySelector('#ytfb-topbar-relay'))," +
      "sourceTime:video?.currentTime??null," +
      "sourcePaused:video?.paused??null," +
      "sourceReady:video?.readyState??null," +
      "relayTime:relay?.currentTime??null," +
      "relayReady:relay?.readyState??null," +
      "mastheadBackground:mastheadStyle?.backgroundColor??null," +
      "mastheadBorder:mastheadStyle?.borderBottomWidth??null," +
      "masthead:rect?{x:Math.max(0,rect.x),y:Math.max(0,rect.y),width:Math.max(1,rect.width),height:Math.max(1,rect.height)}:null" +
      "};})())";
    return JSON.parse(await evaluate(expression));
  }

  await call("Page.enable");

  const playback = JSON.parse(await evaluate(
    "JSON.stringify((()=>{" +
    "const video=document.querySelector('video.html5-main-video')||document.querySelector('video');" +
    "if(!video)return null;" +
    "return {paused:video.paused,muted:video.muted,currentTime:video.currentTime,duration:video.duration};" +
    "})())"
  ));

  let repositionedForAudit = false;

  try {
    const prep = JSON.parse(await evaluate(
      "JSON.stringify((()=>{" +
      "const video=document.querySelector('video.html5-main-video')||document.querySelector('video');" +
      "if(!video)return {repositioned:false};" +
      "const nearEnd=Number.isFinite(video.duration)&&video.duration>20&&video.duration-video.currentTime<15;" +
      "if(nearEnd){const safeTime=Math.min(30,Math.max(5,video.duration*0.25));video.currentTime=safeTime;return {repositioned:true,safeTime};}" +
      "return {repositioned:false};" +
      "})())"
    ));

    repositionedForAudit = Boolean(prep?.repositioned);
    if (repositionedForAudit) await new Promise((resolve) => setTimeout(resolve, 700));

    await evaluate(
      "(async()=>{" +
      "const video=document.querySelector('video.html5-main-video')||document.querySelector('video');" +
      "if(!video)return false;" +
      "video.muted=true;" +
      "try{await video.play();}catch{}" +
      "return !video.paused;" +
      "})()"
    );

    await new Promise((resolve) => setTimeout(resolve, 1200));
    const first = await readState();

    if (requireInstalled && first.mainWorldInjected) {
      throw new Error("Detected an injected MAIN-world runtime; audit the installed unpacked extension without cdp-inject.js");
    }

    const masthead = first.masthead || { x: 0, y: 0, width: 1000, height: 58 };

    await evaluate(
      "(()=>{" +
      "const style=document.createElement('style');" +
      "style.id='ytfb-live-audit-single-surface';" +
      "style.textContent='body>*:not(#ytfb-root){visibility:hidden!important} #ytfb-root,#ytfb-root *{visibility:visible!important} #ytfb-root{opacity:1!important}';" +
      "document.documentElement.append(style);" +
      "return true;" +
      "})()"
    );

    await new Promise((resolve) => setTimeout(resolve, 180));

    const bgA = await call("Page.captureScreenshot", {
      format: "png",
      captureBeyondViewport: false
    });
    const headerA = await call("Page.captureScreenshot", {
      format: "png",
      clip: {
        x: masthead.x,
        y: masthead.y,
        width: Math.min(1200, masthead.width),
        height: Math.min(100, masthead.height),
        scale: 1
      }
    });

    await new Promise((resolve) => setTimeout(resolve, 1300));

    const bgB = await call("Page.captureScreenshot", {
      format: "png",
      captureBeyondViewport: false
    });
    const headerB = await call("Page.captureScreenshot", {
      format: "png",
      clip: {
        x: masthead.x,
        y: masthead.y,
        width: Math.min(1200, masthead.width),
        height: Math.min(100, masthead.height),
        scale: 1
      }
    });

    await evaluate("document.getElementById('ytfb-live-audit-single-surface')?.remove()");

    const second = await readState();
    const backgroundHashA = hashScreenshot(bgA);
    const backgroundHashB = hashScreenshot(bgB);
    const headerHashA = hashScreenshot(headerA);
    const headerHashB = hashScreenshot(headerB);

    const sourceDelta = (second.sourceTime ?? 0) - (first.sourceTime ?? 0);
    const relayDelta = (second.relayTime ?? 0) - (first.relayTime ?? 0);
    const backgroundChanged = backgroundHashA !== backgroundHashB;
    const headerChanged = headerHashA !== headerHashB;

    const report = {
      port,
      mode: first.theater ? "theater" : (first.normal ? "normal" : "unknown"),
      installedRuntime: !first.mainWorldInjected,
      active: first.active,
      sourceDeltaSeconds: Number(sourceDelta.toFixed(3)),
      relayDeltaSeconds: Number(relayDelta.toFixed(3)),
      backgroundChanged,
      headerCropChanged: headerChanged,
      unifiedHeader: {
        mastheadBackground: first.mastheadBackground,
        mastheadBorder: first.mastheadBorder,
        legacyTopbarCanvas: first.legacyTopbarCanvas,
        legacyTopbarRelay: first.legacyTopbarRelay
      },
      surfaces: {
        root: first.root,
        canvas: first.canvas,
        relay: first.relay,
        relayLive: first.relayLive
      },
      hashes: {
        backgroundFirst: backgroundHashA,
        backgroundSecond: backgroundHashB,
        headerFirst: headerHashA,
        headerSecond: headerHashB
      }
    };

    console.log(JSON.stringify(report, null, 2));

    if (!first.active || !first.root || (!first.canvas && !first.relay)) process.exitCode = 2;
    if (first.legacyTopbarCanvas || first.legacyTopbarRelay) process.exitCode = 3;
    if (first.mastheadBackground !== "rgba(0, 0, 0, 0)" || first.mastheadBorder !== "0px") process.exitCode = 4;
    if (sourceDelta <= 0.5) process.exitCode = 5;

    const backgroundProgressed = relayDelta > 0.5 || backgroundChanged;
    if (!backgroundProgressed) process.exitCode = 6;
    if (strictMotion && (!backgroundChanged || !headerChanged)) process.exitCode = 7;
  } finally {
    await evaluate("document.getElementById('ytfb-live-audit-single-surface')?.remove()").catch(() => {});
    if (playback) {
      const restoreExpression =
        "(()=>{" +
        "const video=document.querySelector('video.html5-main-video')||document.querySelector('video');" +
        "if(!video)return false;" +
        "video.muted=" + JSON.stringify(playback.muted) + ";" +
        (repositionedForAudit
          ? "if(Number.isFinite(" + JSON.stringify(playback.currentTime) + "))video.currentTime=" + JSON.stringify(playback.currentTime) + ";"
          : "") +
        "if(" + JSON.stringify(playback.paused) + ")video.pause();" +
        "return true;" +
        "})()";
      await evaluate(restoreExpression).catch(() => {});
    }
    ws.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
