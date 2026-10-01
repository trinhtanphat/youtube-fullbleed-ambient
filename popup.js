(() => {
  "use strict";
  const H = globalThis.YTFBHelpers;
  const ids = ["enabled", "mode", "brightness", "blur", "fps", "quality"];
  const els = Object.fromEntries(ids.map((id) => [id, document.getElementById(id)]));
  const brightnessValue = document.getElementById("brightnessValue");
  const blurValue = document.getElementById("blurValue");
  const status = document.getElementById("status");

  function setStatus(message) {
    status.textContent = message;
  }

  function render(settings) {
    const s = H.normalizeSettings(settings);
    els.enabled.checked = s.enabled;
    els.mode.value = s.mode;
    els.brightness.value = String(s.brightness);
    els.blur.value = String(s.blur);
    els.fps.value = String(s.fps);
    els.quality.value = s.quality;
    brightnessValue.value = s.brightness + "%";
    blurValue.value = s.blur + " px";
  }

  function readForm() {
    return H.normalizeSettings({
      enabled: els.enabled.checked,
      mode: els.mode.value,
      brightness: Number(els.brightness.value),
      blur: Number(els.blur.value),
      fps: Number(els.fps.value),
      quality: els.quality.value
    });
  }

  function save() {
    const next = readForm();
    render(next);
    chrome.storage.sync.set({ ytfbSettings: next }, () => {
      setStatus(chrome.runtime.lastError ? "Could not save settings." : "Saved");
    });
  }

  ids.forEach((id) => {
    els[id].addEventListener(id === "brightness" || id === "blur" ? "input" : "change", save);
  });

  document.getElementById("reset").addEventListener("click", () => {
    const defaults = H.normalizeSettings(H.DEFAULT_SETTINGS);
    render(defaults);
    chrome.storage.sync.set({ ytfbSettings: defaults }, () => setStatus("Defaults restored"));
  });

  document.getElementById("toggleFocus").addEventListener("click", async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) {
      setStatus("No active tab");
      return;
    }
    chrome.tabs.sendMessage(tab.id, { type: "ytfb-toggle-focus" }, (response) => {
      if (chrome.runtime.lastError || !response?.ok) {
        setStatus("Open a YouTube watch page first");
        return;
      }
      setStatus(response.focus ? "Focus fill on" : "Focus fill off");
    });
  });

  chrome.storage.sync.get({ ytfbSettings: H.DEFAULT_SETTINGS }, (result) => {
    render(result.ytfbSettings);
    setStatus("");
  });
})();
