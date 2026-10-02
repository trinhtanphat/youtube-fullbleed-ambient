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
    const v = document.querySelector("video");
    if (!v) return false;
    v.muted = true;
    Promise.resolve(v.play()).catch(() => {});
    return true;
  })()`);

  await new Promise((resolve) => setTimeout(resolve, 2000));

  const result = await evaluate(`(() => {
    const v = document.querySelector("video");
    return v ? {
      paused: v.paused,
      readyState: v.readyState,
      currentTime: Number(v.currentTime.toFixed(2)),
      videoWidth: v.videoWidth,
      videoHeight: v.videoHeight
    } : null;
  })()`);

  console.log(JSON.stringify(result.result?.value ?? null, null, 2));
  ws.close();
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
