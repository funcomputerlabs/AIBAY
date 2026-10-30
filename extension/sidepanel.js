const log = document.getElementById("log");
const form = document.getElementById("form");
const prompt = document.getElementById("prompt");
const send = document.getElementById("send");
const read = document.getElementById("read");
const page = document.getElementById("page");

const history = [];
const locale = navigator.language?.startsWith("en") ? "en" : "es";

function add(role, text) {
  const bubble = document.createElement("div");
  bubble.className = `bubble ${role}`;
  bubble.textContent = text;
  log.appendChild(bubble);
  log.scrollTop = log.scrollHeight;
  return bubble;
}

async function ask(text) {
  const content = text.trim();
  if (!content) return;
  prompt.value = "";
  send.disabled = true;
  read.disabled = true;
  add("user", content);
  history.push({ role: "user", content });
  const pending = add("meta", locale === "en" ? "Reading the page…" : "Leyendo la página…");

  try {
    const result = await chrome.runtime.sendMessage({
      type: "AIBAY_CHAT",
      locale,
      messages: history,
    });
    pending.remove();
    if (result?.error) {
      add("meta", result.error);
      history.pop();
      return;
    }
    if (result?.page?.title) page.textContent = result.page.title;
    const reply = result?.text || (locale === "en" ? "Done." : "Listo.");
    add("assistant", reply);
    history.push({ role: "assistant", content: reply });
    if (result?.applied?.length) {
      const ok = result.applied.filter((item) => item.result === "ok").length;
      add("meta", locale === "en" ? `Changed ${ok} item(s) on the page.` : `Cambié ${ok} dato(s) en la página.`);
    }
  } catch {
    pending.remove();
    add("meta", locale === "en" ? "Network error." : "Error de red.");
    history.pop();
  } finally {
    send.disabled = false;
    read.disabled = false;
    prompt.focus();
  }
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  void ask(prompt.value);
});

prompt.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" || event.shiftKey) return;
  event.preventDefault();
  void ask(prompt.value);
});

read.addEventListener("click", () => {
  void ask(locale === "en" ? "Read this page and tell me what I can change." : "Lee esta página y dime qué puedes cambiar.");
});
