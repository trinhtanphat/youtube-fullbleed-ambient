(() => {
  "use strict";

  if (globalThis.__ytfbAdMainGuardInstalled) return;
  globalThis.__ytfbAdMainGuardInstalled = true;

  const S = globalThis.YTFBAdSanitizer;
  if (!S) return;

  function enabled() {
    return document.documentElement?.getAttribute("data-ytfb-ad-shield") !== "off";
  }

  function sanitize(value) {
    if (!enabled()) return value;
    try {
      return S.sanitizePlayerResponse(value);
    } catch {
      return value;
    }
  }

  // Default-on is intentional: Ad Shield is enabled by default and this script
  // runs at document_start before the isolated content script reads settings.
  // content.js later sets data-ytfb-ad-shield="off" immediately when the user
  // disables the master switch or Ad Shield toggle.
  try {
    let initialValue = sanitize(globalThis.ytInitialPlayerResponse);
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, "ytInitialPlayerResponse");
    if (!descriptor || descriptor.configurable !== false) {
      Object.defineProperty(globalThis, "ytInitialPlayerResponse", {
        configurable: true,
        enumerable: descriptor?.enumerable ?? true,
        get() {
          return initialValue;
        },
        set(value) {
          initialValue = sanitize(value);
        }
      });
    }
  } catch {
    // Leave YouTube's own property untouched if an experiment locks it down.
  }

  const nativeResponseJson = Response.prototype.json;
  Response.prototype.json = async function ytfbResponseJson() {
    const value = await nativeResponseJson.call(this);
    if (!enabled() || !S.shouldSanitizeResponseUrl(this.url)) return value;
    return sanitize(value);
  };

  const nativeResponseText = Response.prototype.text;
  Response.prototype.text = async function ytfbResponseText() {
    const text = await nativeResponseText.call(this);
    return enabled() ? S.sanitizeJsonText(text, this.url) : text;
  };

  const nativeXhrOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function ytfbXhrOpen(method, url, ...rest) {
    this.__ytfbPlayerResponseUrl =
      enabled() && S.shouldSanitizeResponseUrl(url) ? String(url) : "";

    if (this.__ytfbPlayerResponseUrl) {
      this.addEventListener("readystatechange", function ytfbSanitizeXhr() {
        if (this.readyState !== 4 || !this.__ytfbPlayerResponseUrl || !enabled()) return;
        try {
          if (this.responseType === "" || this.responseType === "text") {
            const clean = S.sanitizeJsonText(this.responseText, this.__ytfbPlayerResponseUrl);
            if (clean !== this.responseText) {
              Object.defineProperty(this, "responseText", { configurable: true, value: clean });
              Object.defineProperty(this, "response", { configurable: true, value: clean });
            }
          } else if (this.responseType === "json" && this.response) {
            sanitize(this.response);
          }
        } catch {
          // Some browser builds expose response fields as non-configurable.
        }
      });
    }

    return nativeXhrOpen.call(this, method, url, ...rest);
  };
})();
