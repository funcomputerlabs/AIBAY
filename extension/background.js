const DEFAULT_API = "https://aibayapp.vercel.app";

chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
});

chrome.action.onClicked.addListener((tab) => {
  if (tab.id) chrome.sidePanel.open({ tabId: tab.id }).catch(() => {});
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "AIBAY_CHAT") {
    void chat(message, sender).then(sendResponse).catch((error) => {
      sendResponse({ error: error instanceof Error ? error.message : "network" });
    });
    return true;
  }
});

async function chat(message, sender) {
  const tabId = sender.tab?.id || (await currentTabId());
  const page = tabId ? await snapshot(tabId) : null;
  const settings = await chrome.storage.sync.get({ api: DEFAULT_API });
  const api = String(settings.api || DEFAULT_API).replace(/\/$/, "");
  const locale = String(message.locale || "es");
  const history = Array.isArray(message.messages) ? message.messages.slice(-20) : [];

  const response = await fetch(`${api}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      locale,
      messages: history,
      ...(page ? { page } : {}),
    }),
  });

  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new Error((data && data.error) || "couldNotRespond");
  }

  const raw = await response.text();
  const parsed = splitActions(raw);
  let applied = [];
  if (tabId && parsed.actions.length) {
    applied = await apply(tabId, parsed.actions);
  }
  return { text: parsed.text, actions: parsed.actions, applied, page };
}

async function currentTabId() {
  const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  return tabs[0]?.id ?? null;
}

async function snapshot(tabId) {
  try {
    return await chrome.tabs.sendMessage(tabId, { type: "AIBAY_SNAPSHOT" });
  } catch {
    try {
      await chrome.scripting.executeScript({ target: { tabId }, files: ["content.js"] });
      return await chrome.tabs.sendMessage(tabId, { type: "AIBAY_SNAPSHOT" });
    } catch {
      return null;
    }
  }
}

async function apply(tabId, actions) {
  try {
    const result = await chrome.tabs.sendMessage(tabId, { type: "AIBAY_APPLY", actions });
    return result?.results || [];
  } catch {
    return [];
  }
}

function splitActions(raw) {
  const match = raw.match(/```aibay\s*([\s\S]*?)```/i);
  if (!match) return { text: raw.trim(), actions: [] };
  let actions = [];
  try {
    const parsed = JSON.parse(match[1].trim());
    if (Array.isArray(parsed)) actions = parsed.slice(0, 20);
  } catch {
    actions = [];
  }
  return { text: raw.replace(match[0], "").trim(), actions };
}
