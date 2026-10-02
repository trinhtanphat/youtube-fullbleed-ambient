(() => {
  "use strict";

  const H = globalThis.YTFBHelpers;
  const ids = [
    "enabled",
    "mode",
    "scrollMode",
    "dockSize",
    "topbarVideo",
    "adBlock",
    "readingCalm",
    "commentGlass",
    "brightness",
    "blur",
    "fps",
    "quality"
  ];
  const els = Object.fromEntries(ids.map((id) => [id, document.getElementById(id)]));
  const brightnessValue = document.getElementById("brightnessValue");
  const blurValue = document.getElementById("blurValue");
  const status = document.getElementById("status");
  const liveDot = document.getElementById("liveDot");
  let saveTimer = null;

  function setStatus(message, tone = "idle") {
    status.textContent = message;
    liveDot.classList.toggle("active", tone === "active");
    liveDot.classList.toggle("warn", tone === "warn");
  }

  function render(settings) {
    const s = H.normalizeSettings(settings);
    els.enabled.checked = s.enabled;
    els.mode.value = s.mode;
    els.scrollMode.value = s.scrollMode;
    els.dockSize.value = s.dockSize;
    els.topbarVideo.checked = s.topbarVideo;
    els.adBlock.checked = s.adBlock;
    els.readingCalm.checked = s.readingCalm;
    els.commentGlass.checked = s.commentGlass;
    els.brightness.value = String(s.brightness);
    els.blur.value = String(s.blur);
    els.fps.value = String(s.fps);
    els.quality.value = s.quality;
    brightnessValue.value = s.brightness + "%";
    blurValue.value = String(s.blur);
  }

  function readForm() {
    return H.normalizeSettings({
      enabled: els.enabled.checked,
      mode: els.mode.value,
      scrollMode: els.scrollMode.value,
      dockSize: els.dockSize.value,
      topbarVideo: els.topbarVideo.checked,
      adBlock: els.adBlock.checked,
      readingCalm: els.readingCalm.checked,
      commentGlass: els.commentGlass.checked,
      brightness: Number(els.brightness.value),
      blur: Number(els.blur.value),
      fps: Number(els.fps.value),
      quality: els.quality.value
    });
  }

  function saveNow() {
    if (saveTimer !== null) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }

    const next = readForm();
    render(next);
    chrome.storage.sync.set({ ytfbSettings: next }, () => {
      if (chrome.runtime.lastError) setStatus("Could not save settings", "warn");
      else queryStatus();
    });
  }

  function saveSoon() {
    if (saveTimer !== null) clearTimeout(saveTimer);
    saveTimer = setTimeout(saveNow, 140);
  }

  async function activeTab() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return tab;
  }

  async function sendToTab(message) {
    const tab = await activeTab();
    if (!tab?.id) return null;

    return new Promise((resolve) => {
      chrome.tabs.sendMessage(tab.id, message, (response) => {
        if (chrome.runtime.lastError) resolve(null);
        else resolve(response || null);
      });
    });
  }

  async function queryAdRuleStatus() {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: "ytfb-ad-rules-status" }, (response) => {
        if (chrome.runtime.lastError) resolve(null);
        else resolve(response || null);
      });
    });
  }

  async function queryStatus() {
    const [response, adRules] = await Promise.all([
      sendToTab({ type: "ytfb-status" }),
      queryAdRuleStatus()
    ]);

    if (!response?.ok) {
      setStatus("Open a YouTube watch page", "warn");
      return;
    }

    const parts = [];
    if (response.focus) parts.push("Focus");
    else if (response.docked) parts.push("Docked");
    else parts.push("Ambient");

    if (response.reading) parts.push("calm");
    if (response.topbarVideo) parts.push("topbar live");
    if (response.adBlock) parts.push(adRules?.enabled ? "Ad Shield" : "Ad Shield UI");
    if (response.canvas?.width) parts.push(response.canvas.width + "x" + response.canvas.height);

    setStatus(parts.join(" - "), response.active ? "active" : "warn");
  }

  for (const id of ids) {
    const el = els[id];
    if (id === "brightness" || id === "blur") {
      el.addEventListener("input", () => {
        brightnessValue.value = els.brightness.value + "%";
        blurValue.value = els.blur.value;
        saveSoon();
      });
    } else {
      el.addEventListener("change", saveNow);
    }
  }

  document.getElementById("reset").addEventListener("click", () => {
    const defaults = H.normalizeSettings(H.DEFAULT_SETTINGS);
    render(defaults);
    chrome.storage.sync.set({ ytfbSettings: defaults }, () => queryStatus());
  });

  document.getElementById("toggleFocus").addEventListener("click", async () => {
    const response = await sendToTab({ type: "ytfb-toggle-focus" });
    if (!response?.ok) {
      setStatus("Open a YouTube watch page first", "warn");
      return;
    }
    setStatus(response.focus ? "Focus fill on" : "Focus fill off", "active");
  });

  document.getElementById("toggleDock").addEventListener("click", async () => {
    const response = await sendToTab({ type: "ytfb-toggle-dock" });
    if (!response?.ok) {
      setStatus("Enable scroll dock on a watch page", "warn");
      return;
    }
    setStatus(response.docked ? "Docked player on" : "Docked player off", "active");
  });

  chrome.storage.sync.get({ ytfbSettings: H.DEFAULT_SETTINGS }, (result) => {
    render(result.ytfbSettings);
    queryStatus();
  });
})();
