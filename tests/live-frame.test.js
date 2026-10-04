const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const js = fs.readFileSync(path.join(root, "content.js"), "utf8");
const css = fs.readFileSync(path.join(root, "content.css"), "utf8");

test("live fallback pipeline uses decoded frames with timer recovery", () => {
  assert.match(js, /requestVideoFrameCallback/);
  assert.match(js, /cancelVideoFrameCallback/);
  assert.match(js, /setTimeout\(timerTick, interval\)/);
  assert.match(js, /renderWatchdogId/);
});

test("captureStream relay is preferred for truly live ambient video", () => {
  assert.match(js, /video\.captureStream/);
  assert.match(js, /relay\.srcObject = stream/);
  assert.match(js, /state\.relayStream = stream/);
  assert.match(js, /state\.relaySource = video/);
  assert.match(js, /getVideoTracks/);
  assert.match(js, /track\.stop\(\)/);
});

test("relay creates no second network media source", () => {
  assert.doesNotMatch(js, /\.src\s*=\s*video\.src/);
  assert.doesNotMatch(js, /document\.createElement\(["']source["']\)/);
  assert.match(js, /srcObject = state\.relayStream/);
  assert.match(js, /srcObject = stream/);
});

test("ambient poster remains visible until relay or first fallback frame arrives", () => {
  assert.match(js, /ytfb-awaiting-frame/);
  assert.match(css, /#ytfb-root\.ytfb-awaiting-frame \.ytfb-fallback/);
  assert.match(js, /state\.hasAmbientFrame = true/);
  assert.match(js, /setRelayLive\(true\)/);
});

test("full-page and masthead relay surfaces are non-interactive", () => {
  assert.match(js, /relay\.className = "ytfb-relay"/);
  assert.match(js, /relay\.id = "ytfb-topbar-relay"/);
  assert.match(css, /#ytfb-topbar-relay/);
  assert.match(css, /pointer-events: none/);
});

test("timer and heartbeat watchdogs recover stranded fallback callbacks", () => {
  assert.match(js, /state\.timerId = setTimeout\(timerTick, interval\)/);
  assert.match(js, /state\.videoFrameCallbackId = video\.requestVideoFrameCallback\(frameTick\)/);
  assert.match(js, /setInterval\(\(\) =>/);
  assert.match(js, /if \(state\.timerId === null && state\.videoFrameCallbackId === null\)/);
});

test("relay heartbeat detects stalled captured media", () => {
  assert.match(js, /lastRelayProgressAt/);
  assert.match(js, /relayTime > state\.lastRelayTime \+ 0\.02/);
  assert.match(js, /performance\.now\(\) - state\.lastRelayProgressAt > 1600/);
  assert.match(js, /clearRelay\(\);\s*syncRelay\(state\.video\)/);
});
