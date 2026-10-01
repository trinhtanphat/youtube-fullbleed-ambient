(async () => {
  const port = Number(process.argv[2] || 9229);
  const targets = await fetch("http://127.0.0.1:" + port + "/json/list").then((r) => r.json());
  const target = targets.find((t) => t.type === "page" && /youtube\.com\/watch/.test(t.url));
  if (!target) throw new Error("No YouTube watch page target found");

  const ws = new WebSocket(target.webSocketDebuggerUrl);
  const result = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("CDP timeout")), 5000);
    ws.addEventListener("open", () => {
      ws.send(JSON.stringify({
        id: 1,
        method: "Runtime.evaluate",
        params: {
          returnByValue: true,
          expression: `JSON.stringify({
            url: location.href,
            root: !!document.getElementById("ytfb-root"),
            active: document.documentElement.classList.contains("ytfb-active"),
            focus: document.documentElement.classList.contains("ytfb-focus"),
            canvas: (() => {
              const c = document.querySelector("#ytfb-root canvas");
              return c ? {width:c.width,height:c.height} : null;
            })()
          })`
        }
      }));
    });
    ws.addEventListener("message", (event) => {
      const msg = JSON.parse(String(event.data));
      if (msg.id !== 1) return;
      clearTimeout(timeout);
      resolve(JSON.parse(msg.result.result.value));
    });
    ws.addEventListener("error", reject);
  });
  ws.close();
  console.log(JSON.stringify(result, null, 2));
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
