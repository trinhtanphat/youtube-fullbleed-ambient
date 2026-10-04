const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const sanitizerSource = fs.readFileSync(path.join(root, "ad-sanitize.js"), "utf8");
const guardSource = fs.readFileSync(path.join(root, "page-guard.js"), "utf8");

function bootGuard() {
  let shield = "on";
  const payload = JSON.stringify({
    videoDetails: { videoId: "abc123", title: "Playback" },
    streamingData: { formats: [{ itag: 18 }] },
    adPlacements: [{ adPlacementRenderer: { config: 1 } }],
    adSlots: [{ adSlotRenderer: {} }]
  });

  class TestHeaders {
    constructor(source = {}) {
      this.values = new Map();
      if (source instanceof TestHeaders) {
        for (const [key, value] of source.values) this.values.set(key, value);
      } else if (source && typeof source === "object") {
        for (const [key, value] of Object.entries(source)) {
          this.values.set(String(key).toLowerCase(), String(value));
        }
      }
    }
    delete(name) {
      this.values.delete(String(name).toLowerCase());
    }
  }

  class TestResponse {
    constructor(body = "", options = {}) {
      this.body = String(body);
      this.status = options.status ?? 200;
      this.statusText = options.statusText ?? "OK";
      this.headers = options.headers instanceof TestHeaders ? new TestHeaders(options.headers) : new TestHeaders(options.headers);
      this.url = options.url || "";
      this.redirected = Boolean(options.redirected);
      this.type = options.type || "basic";
    }
    async json() { return JSON.parse(this.body); }
    async text() { return this.body; }
    async arrayBuffer() { return new TextEncoder().encode(this.body).buffer; }
    clone() {
      return new TestResponse(this.body, {
        status: this.status,
        statusText: this.statusText,
        headers: this.headers,
        url: this.url,
        redirected: this.redirected,
        type: this.type
      });
    }
  }

  class TestXhr {
    addEventListener() {}
    open() {}
  }

  const context = vm.createContext({
    console,
    URL,
    ArrayBuffer,
    TextEncoder,
    TextDecoder,
    Response: TestResponse,
    Headers: TestHeaders,
    XMLHttpRequest: TestXhr,
    document: {
      documentElement: {
        getAttribute(name) {
          return name === "data-ytfb-ad-shield" ? shield : null;
        }
      }
    },
    fetch: async (input) => new TestResponse(payload, {
      url: typeof input === "string" ? input : input?.url || ""
    })
  });

  vm.runInContext(sanitizerSource, context, { filename: "ad-sanitize.js" });
  vm.runInContext(guardSource, context, { filename: "page-guard.js" });

  return {
    context,
    setShield(value) {
      shield = value;
    }
  };
}

test("MAIN-world fetch wrapper strips ad payload before YouTube consumes it", async () => {
  const { context } = bootGuard();
  const response = await context.fetch("https://www.youtube.com/youtubei/v1/player?prettyPrint=false");
  const body = await response.json();
  assert.equal("adPlacements" in body, false);
  assert.equal("adSlots" in body, false);
  assert.equal(body.videoDetails.videoId, "abc123");
  assert.equal(body.streamingData.formats[0].itag, 18);
});

test("Response text and arrayBuffer paths are sanitized at runtime", async () => {
  const { context } = bootGuard();
  const raw = JSON.stringify({
    videoDetails: { videoId: "abc123" },
    adPlacements: [{ adPlacementRenderer: {} }]
  });
  const response = new context.Response(raw, {
    url: "https://www.youtube.com/youtubei/v1/player"
  });
  const textBody = JSON.parse(await response.text());
  assert.equal("adPlacements" in textBody, false);
  const bufferBody = JSON.parse(new TextDecoder().decode(await response.arrayBuffer()));
  assert.equal("adPlacements" in bufferBody, false);
});

test("global player responses are sanitized on assignment", () => {
  const { context } = bootGuard();
  context.ytInitialPlayerResponse = {
    videoDetails: { videoId: "abc123" },
    adSlots: [{ adSlotRenderer: {} }]
  };
  context.playerResponse = {
    streamingData: { formats: [{ itag: 18 }] },
    adPlacements: [{ adPlacementRenderer: {} }]
  };
  assert.equal("adSlots" in context.ytInitialPlayerResponse, false);
  assert.equal("adPlacements" in context.playerResponse, false);
  assert.equal(context.playerResponse.streamingData.formats[0].itag, 18);
});

test("Ad Shield off leaves fetch payload unchanged", async () => {
  const { context, setShield } = bootGuard();
  setShield("off");
  const response = await context.fetch("https://www.youtube.com/youtubei/v1/player");
  const body = await response.json();
  assert.equal(Array.isArray(body.adPlacements), true);
  assert.equal(Array.isArray(body.adSlots), true);
});
