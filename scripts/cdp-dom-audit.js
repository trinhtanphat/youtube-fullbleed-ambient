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
      ws.send(JSON.stringify({ id, method: "Runtime.evaluate", params: { expression, returnByValue: true } }));
      setTimeout(() => {
        if (!pending.has(id)) return;
        pending.delete(id);
        reject(new Error("CDP timeout"));
      }, 8000);
    });
  }

  const result = await evaluate(`(() => {
    const selectors = [
      "ytd-masthead#masthead",
      "#masthead-container",
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
        zIndex: cs.zIndex,
        width: Math.round(r.width),
        height: Math.round(r.height),
        x: Math.round(r.x),
        y: Math.round(r.y),
        text: (el.textContent || "").trim().replace(/\s+/g," ").slice(0,120)
      };
    };
    return {
      url: location.href,
      title: document.title,
      selectors: selectors.map(inspect),
      logoCandidates: [...document.querySelectorAll('ytd-topbar-logo-renderer, a#logo, #logo-icon')].map(el => ({
        tag: el.tagName, id: el.id, text:(el.textContent||"").trim().slice(0,80),
        html: el.outerHTML.slice(0,400)
      }))
    };
  })()`);

  console.log(JSON.stringify(result.result?.value ?? null, null, 2));
  ws.close();
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
