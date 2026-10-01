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
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    if (msg.error) reject(new Error(msg.error.message));
    else resolve(msg.result);
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

  const root = path.resolve(__dirname, "..");
  const css = fs.readFileSync(path.join(root, "content.css"), "utf8");
  const helpers = fs.readFileSync(path.join(root, "helpers.js"), "utf8");
  const content = fs.readFileSync(path.join(root, "content.js"), "utf8");

  await evaluate(`(() => {
    let style = document.getElementById("ytfb-dev-style");
    if (!style) {
      style = document.createElement("style");
      style.id = "ytfb-dev-style";
      document.documentElement.appendChild(style);
    }
    style.textContent = ${JSON.stringify(css)};
    globalThis.chrome = {
      storage: {
        sync: {
          get(defaults, cb) { cb(defaults); },
          set(_value, cb) { if (cb) cb(); }
        },
        onChanged: { addListener() {} }
      },
      runtime: {
        lastError: null,
        onMessage: { addListener() {} }
      }
    };
  })()`);

  await evaluate(helpers);
  await evaluate(content);
  await new Promise((resolve) => setTimeout(resolve, 2000));

  const status = await evaluate(`JSON.stringify({
    root: !!document.getElementById("ytfb-root"),
    active: document.documentElement.classList.contains("ytfb-active"),
    focus: document.documentElement.classList.contains("ytfb-focus"),
    paused: document.querySelector("video")?.paused ?? null,
    canvas: (() => {
      const c = document.querySelector("#ytfb-root canvas");
      return c ? { width: c.width, height: c.height } : null;
    })(),
    staticFallback: document.getElementById("ytfb-root")?.classList.contains("ytfb-static") ?? null
  })`);

  console.log(status);
  ws.close();
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
