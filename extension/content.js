(() => {
  const ATTR = "data-aibay";
  const nodes = new Map();

  function visible(el) {
    if (!(el instanceof HTMLElement)) return false;
    if (el.closest("[hidden], noscript, template")) return false;
    const style = window.getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") return false;
    const box = el.getBoundingClientRect();
    return box.width > 2 && box.height > 2;
  }

  function labelOf(el) {
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) {
      if (el.labels && el.labels[0]) return el.labels[0].innerText.trim();
    }
    return (
      el.getAttribute("aria-label") ||
      el.getAttribute("placeholder") ||
      el.getAttribute("name") ||
      el.getAttribute("title") ||
      el.innerText ||
      ""
    )
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 120);
  }

  function snapshot() {
    nodes.clear();
    document.querySelectorAll(`[${ATTR}]`).forEach((el) => el.removeAttribute(ATTR));
    const fields = [];
    const controls = document.querySelectorAll(
      "input, textarea, select, button, a[href], [contenteditable='true'], [role='button'], [role='textbox']",
    );
    let id = 1;
    for (const el of controls) {
      if (!visible(el) || fields.length >= 80) continue;
      if (el instanceof HTMLInputElement && (el.type === "hidden" || el.type === "file")) continue;
      el.setAttribute(ATTR, String(id));
      nodes.set(id, el);
      const type =
        el instanceof HTMLInputElement
          ? el.type || "text"
          : el.getAttribute("contenteditable") === "true"
            ? "contenteditable"
            : el.tagName.toLowerCase();
      const value =
        type === "password"
          ? ""
          : el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement
            ? String(el.value || "").slice(0, 200)
            : "";
      fields.push({
        id,
        tag: el.tagName.toLowerCase(),
        type,
        label: labelOf(el),
        value,
      });
      id += 1;
    }

    const text = document.body
      ? document.body.innerText.replace(/\s+/g, " ").trim().slice(0, 6_000)
      : "";

    return {
      url: location.href.slice(0, 500),
      title: document.title.slice(0, 200),
      text,
      fields,
    };
  }

  function setValue(el, value) {
    if (el instanceof HTMLInputElement && el.type === "password") return "skipped";
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
      el.focus();
      el.value = value;
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
      return "ok";
    }
    if (el instanceof HTMLSelectElement) {
      const match = [...el.options].find(
        (option) => option.value === value || option.text.trim() === value,
      );
      el.value = match ? match.value : value;
      el.dispatchEvent(new Event("change", { bubbles: true }));
      return "ok";
    }
    if (el.isContentEditable) {
      el.focus();
      el.textContent = value;
      el.dispatchEvent(new Event("input", { bubbles: true }));
      return "ok";
    }
    return "skipped";
  }

  function apply(actions) {
    const results = [];
    if (!Array.isArray(actions)) return results;
    for (const action of actions.slice(0, 20)) {
      if (!action || typeof action !== "object") continue;
      const id = Number(action.id);
      const el = nodes.get(id) || document.querySelector(`[${ATTR}="${id}"]`);
      if (!(el instanceof HTMLElement)) {
        results.push({ id, op: action.op, result: "missing" });
        continue;
      }
      const op = action.op;
      if (op === "click") {
        el.click();
        results.push({ id, op, result: "ok" });
        continue;
      }
      if (op === "check" && el instanceof HTMLInputElement) {
        el.checked = action.value !== false && action.value !== "false";
        el.dispatchEvent(new Event("change", { bubbles: true }));
        results.push({ id, op, result: "ok" });
        continue;
      }
      if (op === "fill" || op === "select" || op === "replace") {
        results.push({ id, op, result: setValue(el, String(action.value ?? "")) });
        continue;
      }
      results.push({ id, op, result: "skipped" });
    }
    return results;
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === "AIBAY_SNAPSHOT") {
      sendResponse(snapshot());
      return;
    }
    if (message?.type === "AIBAY_APPLY") {
      snapshot();
      sendResponse({ results: apply(message.actions) });
    }
  });
})();
