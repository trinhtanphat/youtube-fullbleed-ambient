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
  function installSanitizedGlobal(name) {
    try {
      const descriptor = Object.getOwnPropertyDescriptor(globalThis, name);
      if (descriptor?.configurable === false) {
        sanitize(globalThis[name]);
        return false;
      }

      // Avoid replacing an existing accessor: YouTube may attach behavior to it.
      // We can still sanitize the currently exposed object in place.
      if (descriptor && (typeof descriptor.get === "function" || typeof descriptor.set === "function")) {
        sanitize(globalThis[name]);
        return false;
      }

      let currentValue = sanitize(globalThis[name]);
      Object.defineProperty(globalThis, name, {
        configurable: true,
        enumerable: descriptor?.enumerable ?? true,
        get() {
          return currentValue;
        },
        set(value) {
          currentValue = sanitize(value);
        }
      });
      return true;
    } catch {
      return false;
    }
  }

  installSanitizedGlobal("ytInitialPlayerResponse");
  installSanitizedGlobal("playerResponse");

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

  const nativeResponseArrayBuffer = Response.prototype.arrayBuffer;
  Response.prototype.arrayBuffer = async function ytfbResponseArrayBuffer() {
    const buffer = await nativeResponseArrayBuffer.call(this);
    return enabled() ? S.sanitizeArrayBuffer(buffer, this.url) : buffer;
  };

  const nativeFetch = globalThis.fetch;
  if (typeof nativeFetch === "function") {
    globalThis.fetch = async function ytfbFetch(input, init) {
      const response = await nativeFetch.call(this, input, init);
      if (!enabled()) return response;

      const inputUrl = typeof input === "string" ? input : input?.url;
      const responseUrl = response?.url || inputUrl || "";
      if (!S.shouldSanitizeResponseUrl(responseUrl)) return response;

      try {
        const raw = await nativeResponseText.call(response.clone());
        const clean = S.sanitizeJsonText(raw, responseUrl);
        if (clean === raw) return response;

        const headers = new Headers(response.headers);
        headers.delete("content-length");
        const replacement = new Response(clean, {
          status: response.status,
          statusText: response.statusText,
          headers
        });

        for (const [key, value] of [
          ["url", response.url],
          ["redirected", response.redirected],
          ["type", response.type]
        ]) {
          try {
            Object.defineProperty(replacement, key, {
              configurable: true,
              enumerable: false,
              value
            });
          } catch {}
        }

        return replacement;
      } catch {
        return response;
      }
    };
  }

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
