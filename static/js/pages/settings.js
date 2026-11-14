/* Settings (plan 10.1) — two-column, autosave for everyday fields, explicit
   Save for secrets. Sections: gmail, sending, signature, ai, branding, advanced. */
import {
  api, el, icon, esc, toast, modal, menu, confirmSimple, confirmTyped, withLoading,
  badge, errorCard,
} from "/static/js/core/ui.js";
import { fmtInt, initials, avatarColor } from "/static/js/core/format.js";

const $ = (id) => document.getElementById(id);
const col = $("set-col");
const HOST = location.origin;
let SETTINGS = null;

const PROVIDERS = {
  openai: { url: "https://api.openai.com/v1", model: "gpt-4o-mini", help: "platform.openai.com/api-keys" },
  groq: { url: "https://api.groq.com/openai/v1", model: "llama-3.3-70b-versatile", help: "console.groq.com/keys" },
  gemini: { url: "https://generativelanguage.googleapis.com/v1beta/openai", model: "gemini-2.0-flash", help: "aistudio.google.com/apikey" },
  custom: { url: "", model: "", help: "" },
};

function saved(node) {
  let cap = node && node.querySelector(".set-saved");
  if (!cap) {
    cap = el("span", { class: "set-saved" }, "Saved");
    (node || col).append(cap);
  }
  cap.classList.add("is-shown");
  clearTimeout(cap._t);
  cap._t = setTimeout(() => cap.classList.remove("is-shown"), 2000);
}
async function autosave(key, value, node) {
  try {
    await api("/api/settings", { body: { [key]: String(value) } });
    SETTINGS[key] = String(value);
    saved(node);
    document.dispatchEvent(new CustomEvent("cm:settings-changed", { detail: { key, value: SETTINGS[key] } }));
    return true;
  } catch (e) {
    toast(MSG_saveFailed(), { type: "error", action: () => autosave(key, value, node), actionLabel: "Retry" });
    return false;
  }
}
function MSG_saveFailed() { return "Could not save. Check your connection and try again."; }

/* ================= section registry ================= */
const SECTIONS = { gmail: secGmail, sending: secSending, signature: secSignature, ai: secAI, branding: secBranding, advanced: secAdvanced };
const ADMIN_SECS = ["branding", "advanced"];
let current = location.pathname.split("/").pop();
if (!SECTIONS[current]) current = "gmail";
if (window.me_role !== "admin" && ADMIN_SECS.includes(current)) current = "gmail";

async function init() {
  try {
    const d = await api("/api/settings");
    SETTINGS = d.settings;
  } catch (e) {
    col.append(errorCard("Could not load settings.", { onRetry: init }));
    return;
  }
  document.querySelectorAll("#set-nav a").forEach((a) => a.classList.toggle("is-active", a.dataset.sec === current));
  render();
}
function render() {
  col.innerHTML = "";
  SECTIONS[current](col);
  document.querySelectorAll("#set-nav a").forEach((a) => a.classList.toggle("is-active", a.dataset.sec === current));
}
function switchSection(sec) {
  if (!SECTIONS[sec]) sec = "gmail";
  if (window.me_role !== "admin" && ADMIN_SECS.includes(sec)) sec = "gmail";
  current = sec;
  history.replaceState(null, "", "/settings/" + sec);
  render();
}
document.querySelectorAll("#set-nav a").forEach((a) => {
  a.addEventListener("click", (e) => { e.preventDefault(); switchSection(a.dataset.sec); });
});

function row(label, help, ctrl, opts = {}) {
  const wrapped = (ctrl && ctrl.classList && ctrl.classList.contains("set-row-ctrl"))
    ? ctrl
    : el("div", { class: "set-row-ctrl" }, ctrl);
  return el("div", { class: "set-row" + (opts.cls ? " " + opts.cls : "") },
    el("div", { class: "set-row-main" },
      el("div", { class: "set-row-label" }, label),
      help ? el("div", { class: "set-row-help" }, help) : null),
    wrapped);
}
function switchInput(on, onchange, label) {
  const inp = el("input", { type: "checkbox" });
  inp.checked = !!on;
  inp.setAttribute("aria-label", label || "Toggle");
  inp.addEventListener("change", () => onchange(inp.checked));
  return el("span", { class: "switch" }, inp, el("span", { class: "track" }), el("span", { class: "knob" }));
}

/* ================= Gmail accounts ================= */
function secGmail(col) {
  const admin = window.me_role === "admin";
  const clientSet = SETTINGS.client_secret_set === "1";

  /* step-by-step connect guide */
  col.append(el("div", { class: "set-card" },
    el("div", { class: "set-card-head" }, icon("mail", "i i-16"), "How to connect your email"),
    el("div", { class: "set-card-body" },
      el("div", { class: "steps" },
        step("Set up the Gmail API client once",
          admin
            ? 'Create a project at <a href="https://console.cloud.google.com" target="_blank" rel="noopener">console.cloud.google.com</a>, enable the <b>Gmail API</b>, create an <b>OAuth client ID (Web application)</b> with the redirect URI <code>' + HOST + "/api/auth/callback" + '</code>, then paste the client JSON in Settings, Advanced, Gmail API client.'
            : "Your admin does this once - enabling the Gmail API and pasting the client JSON in Settings, Advanced. You do not need to touch this."),
        step("Click Connect a Gmail account",
          'Give the account a label you will recognise, like "Team mailbox" or your own name.')),
      el("div", { class: "steps", style: "margin-top:8px" },
        step("Sign in to the Gmail you want to use",
          "A Google window opens. Pick the email that should send your campaigns. Use an account that is not your personal inbox - a team mailbox is best."),
        step("You are done",
          "You land back on this page and the account shows Connected. Your emails will be saved as drafts there for you to review.")))
  ));

  if (!clientSet) {
    col.append(el("div", { class: "banner banner-warn", style: "margin-bottom:var(--sp-4)" },
      icon("alert-triangle", "i i-16"),
      el("div", { style: "flex:1" },
        admin ? "The Gmail client JSON is not set yet. Set it up in Advanced first." : "Ask an admin to finish Gmail setup (Settings, Advanced) before connecting an account."),
      admin ? el("a", { class: "btn btn-ghost btn-sm", href: "/settings/advanced" }, "Open Advanced") : null));
  }

  const card = el("div", { class: "set-card" },
    el("div", { class: "set-card-head" }, icon("users", "i i-16"), "Accounts",
      el("span", { class: "push" }),
      el("button", { class: "btn btn-primary btn-sm", id: "gm-connect" }, icon("plus", "i i-14"), "Connect a Gmail account")),
    el("div", { class: "set-card-body", id: "gm-accounts" }, el("div", { class: "t-caption" }, "Loading…")));
  col.append(card);
  $("gm-connect").onclick = () => connectModal(clientSet);

  api("/api/accounts").then((d) => {
    const w = $("gm-accounts");
    w.innerHTML = "";
    const accts = d.accounts || [];
    if (!accts.length) {
      w.append(el("div", { class: "t-caption" }, "No Gmail accounts yet. Connect one to start saving drafts and sending."));
      return;
    }
    for (const a of accts) {
      const label = a.label || a.email || "Account " + a.id;
      const share = a.visibility === "shared";
      const rowEl = el("div", { class: "set-acc-row" },
        el("span", { class: "avatar", style: `background:${avatarColor(a.email || label)}` }, initials(a.email || label)),
        el("div", { class: "set-acc-main" },
          el("div", { class: "set-acc-email" }, a.email || label),
          el("div", { class: "set-acc-cap" },
            [a.label && a.label !== a.email ? a.label : null,
              a.mine ? "Added by you" : "Added by a teammate"].filter(Boolean).join(" · "))),
        el("div", { class: "set-acc-actions" },
          a.connected
            ? badge("Connected", "active", "check-circle-2")
            : el("span", { style: "display:flex;gap:8px;align-items:center" },
                badge("Needs reconnecting", "bounced", "alert-triangle"),
                el("button", { class: "btn btn-ghost btn-sm", onclick: () => reconnect(a) }, "Reconnect")),
          a.mine || admin ? el("div", { class: "set-acc-share" },
            el("label", {}, "Shared with the team",
              switchInput(share, async (on) => {
                try {
                  await api("/api/accounts/" + a.id, { body: { visibility: on ? "shared" : "private" } });
                  saved();
                } catch (e) { toast(e.message, { type: "error" }); }
              }, "Shared with the team"))) : null,
          el("div", { class: "set-acc-share" }, el("span", { class: "t-caption" }, "Anyone on the team can send from it")),
          kebabAccount(a, admin)));
    w.append(rowEl);
    }
  }).catch((e) => {
    $("gm-accounts").innerHTML = "";
    $("gm-accounts").append(errorCard("Could not load accounts.", { onRetry: () => render() }));
  });
}
function step(title, text) {
  return el("div", { class: "step" },
    el("div", { class: "step-num" }),
    el("div", { class: "step-body" },
      el("div", { class: "step-title" }, title),
      el("div", { class: "step-text", html: text })));
}
function reconnect(a) {
  connectModal(true, a.id).then(() => {});
}
function connectModal(clientSet, existingId) {
  if (!clientSet) {
    modal({ title: "Gmail is not set up yet",
      body: el("div", { class: "t-card" }, window.me_role === "admin"
        ? "Paste the Gmail client JSON in Settings, Advanced first, then connect an account."
        : "Ask an admin to finish Gmail setup (Settings, Advanced) first."),
      foot: [el("button", { class: "btn btn-primary" }, "Got it")] });
    return;
  }
  const label = el("input", { class: "input", style: "width:100%", placeholder: "Label (optional), e.g. Team mailbox", "aria-label": "Account label" });
  const priv = el("input", { type: "checkbox" });
  const btn = el("button", { class: "btn btn-primary" }, existingId ? "Reconnect with Google" : "Continue with Google");
  const m = modal({ title: existingId ? "Reconnect this account" : "Connect a Gmail account",
    sub: "You will sign in to Google in a new window. Only the sending permission is requested.",
    body: el("div", { style: "display:flex;flex-direction:column;gap:12px" },
      existingId ? null : el("div", { class: "field" }, el("label", { class: "field-label" }, "Label"), label),
      existingId ? null : el("label", { style: "display:flex;gap:8px;align-items:center;font-size:13px", for: "" }, priv, "Keep private to me (only I can send from it)")),
    foot: [el("button", { class: "btn btn-ghost" }, "Cancel"), btn] });
  btn.onclick = async () => {
    await withLoading(btn, async () => {
      try {
        const d = await api("/api/accounts/add", {
          body: { label: label.value.trim(), private: priv.checked,
                  existing_id: existingId || undefined },
        });
        m.close();
        toast("Continue in the Google window that opens.");
        location.href = d.auth_url;
      } catch (e) { toast(e.message, { type: "error" }); }
    });
  };
}
function kebabAccount(a, admin) {
  const b = el("button", { class: "btn btn-icon", "aria-label": "Account actions" }, icon("more-vertical"));
  b.onclick = (e) => {
    e.stopPropagation();
    menu(b, [
      { icon: "trash-2", label: "Remove account", danger: true, action: async () => {
        const ok = await confirmSimple({
          title: "Remove this account?",
          body: "Drafts already in Gmail stay.",
          actionLabel: "Remove account",
        });
        if (!ok) return;
        try {
          await api("/api/accounts/" + a.id + "/delete", { body: {} });
          toast("Account removed.");
          render();
        } catch (e2) { toast(e2.message, { type: "error" }); }
      } },
    ]);
  };
  return b;
}

/* ================= Sending ================= */
function secSending(col) {
  const safe = SETTINGS.safe_mode === "1";
  const card = el("div", { class: "set-card" },
    el("div", { class: "set-card-head" }, icon("send", "i i-16"), "How emails go out"),
    el("div", { class: "set-card-body" },
      el("div", { class: "mode-opts" },
        modeOpt("drafts", "Drafts only", "Nothing is sent. Emails are saved in Gmail for you to review.", !safe, () => setMode(true)),
        modeOpt("live", "Live sending", "Scheduled and immediate sends go out on their own.", safe, () => setMode(false))),
    ));
  col.append(card);

  function modeOpt(key, title, sub, active, fn) {
    const b = el("button", { class: "mode-opt" + (active ? " is-active" : ""), type: "button", onclick: () => { if (!active) fn(); } },
      el("div", { class: "mode-opt-title" }, icon(key === "drafts" ? "shield-check" : "zap", "i i-16"), title),
      el("div", { class: "mode-opt-sub" }, sub));
    return b;
  }
  async function setMode(toSafe) {
    if (toSafe) {
      const ok = await confirmSimple({
        title: "Switch to Drafts only?",
        body: "Nothing will be sent. Emails are saved in Gmail for you to review.",
        actionLabel: "Switch to Drafts only", danger: false,
      });
      if (!ok) return;
    } else {
      const ok = await confirmSimple({
        title: "Turn on Live sending?",
        body: "Scheduled and immediate sends will go out on their own.",
        actionLabel: "Turn on Live sending", danger: false,
      });
      if (!ok) return;
    }
    await autosave("safe_mode", toSafe ? "1" : "0", card);
    toast(toSafe ? "Drafts only. Nothing will be sent." : "Live sending is on. Scheduled emails will go out.");
    render();
  }

  const capCard = el("div", { class: "set-card" },
    el("div", { class: "set-card-head" }, icon("settings", "i i-16"), "Limits and spacing"),
    el("div", { class: "set-card-body" },
      row("Daily limit", "Across all accounts. Stops accidents and protects your Gmail reputation.",
        el("div", { class: "set-row-ctrl" },
          el("input", { type: "number", min: "1", class: "input", value: SETTINGS.max_sends_per_day || "100", "aria-label": "Daily limit" })
            .addEventListener && numInput(SETTINGS.max_sends_per_day || "100", (v, node) => autosave("max_sends_per_day", v, node)))),
      row("Default spacing between emails", "Minutes to space them out so Gmail does not flag the sends.",
        numInput(SETTINGS.default_stagger_min || "0", (v, node) => autosave("default_stagger_min", v, node), "minutes")),
    ));
  col.append(capCard);

  const catchup = SETTINGS.catchup_policy || "send_now";
  const catchCard = el("div", { class: "set-card" },
    el("div", { class: "set-card-head" }, icon("clock", "i i-16"), "If the platform was switched off when an email was due"),
    el("div", { class: "set-card-body" },
      radioCard("send_now", "Send it as soon as it is back", "The email goes out on the next tick, a few minutes later.", catchup === "send_now"),
      radioCard("mark_missed", "Mark it as missed", "It is marked as failed so you can reschedule it deliberately.", catchup === "mark_missed")));
  col.append(catchCard);
  function radioCard(value, title, sub, active) {
    const b = el("button", { class: "mode-opt" + (active ? " is-active" : ""), type: "button", style: "margin-bottom:10px",
      onclick: async () => {
        if (value === SETTINGS.catchup_policy) return;
        await autosave("catchup_policy", value, catchCard);
        catchCard.querySelectorAll(".mode-opt").forEach((x) => x.classList.remove("is-active"));
        b.classList.add("is-active");
      } },
      el("div", { class: "mode-opt-title" }, icon(value === "send_now" ? "zap" : "pause-circle", "i i-16"), title),
      el("div", { class: "mode-opt-sub" }, sub));
    return b;
  }
  function numInput(value, onSave, unit) {
    const wrap = el("div", { class: "set-row-ctrl" });
    const inp = el("input", { type: "number", min: unit ? "0" : "1", class: "input", value, "aria-label": "Value" });
    let t;
    inp.addEventListener("change", () => {
      const v = String(inp.value);
      if (v === String(value)) return;
      onSave(v, wrap);
    });
    wrap.append(inp);
    if (unit) wrap.append(el("span", { class: "t-caption" }, unit));
    return wrap;
  }
}

/* ================= Signature ================= */
function secSignature(col) {
  const editor = el("div", { class: "ed-body", style: "min-height:140px", contenteditable: "true", "aria-label": "Signature" });
  const preview = el("div", { class: "sig-preview" });
  const htmlArea = el("textarea", { class: "input", style: "width:100%;min-height:90px;display:none", "aria-label": "Signature HTML" });
  const saveBtn = el("button", { class: "btn btn-primary" }, "Save signature");
  const imgInp = el("input", { type: "file", accept: "image/*", style: "display:none" });
  const toolbar = el("div", { class: "ed-toolbar", style: "top:auto" },
    tb("bold", "Bold", () => docCmd("bold")),
    tb("italic", "Italic", () => docCmd("italic")),
    tb("link", "Link", () => { const u = prompt("Link address", "https://"); if (u) { document.execCommand("createLink", false, u); sync(); } }),
    tb("image", "Upload image", () => imgInp.click()));
  function tb(ico, label, fn) {
    const b = el("button", { class: "btn btn-icon", "aria-label": label, title: label, mousedown: (e) => e.preventDefault() }, icon(ico));
    b.onclick = fn;
    return b;
  }
  function docCmd(cmd) { document.execCommand(cmd); sync(); }
  function sync() { preview.innerHTML = editor.innerHTML; }
  editor.addEventListener("input", sync);
  imgInp.onchange = async () => {
    const f = imgInp.files[0];
    if (!f) return;
    const fd = new FormData();
    fd.append("file", f);
    try {
      const d = await fetch("/api/signature/upload", { method: "POST", body: fd }).then((r) => r.json());
      if (!d.ok) throw new Error(d.error || "Upload failed");
      document.execCommand("insertHTML", false, d.html);
      sync();
    } catch (e) { toast(e.message, { type: "error" }); }
    imgInp.value = "";
  };
  const disc = el("details", {},
    el("summary", { style: "cursor:pointer;font-size:13px;color:var(--text-2);margin-bottom:8px" }, "Edit HTML"),
    htmlArea);
  htmlArea.addEventListener("input", () => { editor.innerHTML = htmlArea.value; preview.innerHTML = htmlArea.value; });
  saveBtn.onclick = async () => {
    await withLoading(saveBtn, async () => {
      try {
        await api("/api/signature", { body: { html: editor.innerHTML } });
        toast("Signature saved.");
      } catch (e) { toast(e.message, { type: "error" }); }
    });
  };
  const card = el("div", { class: "set-card" },
    el("div", { class: "set-card-head" }, icon("pencil", "i i-16"), "Your signature"),
    el("div", { class: "set-card-body" },
      el("div", { class: "sig-wrap" },
        el("div", { style: "min-width:0" }, toolbar, editor, imgInp,
          el("div", { style: "margin-top:10px" }, disc)),
        el("div", {},
          el("div", { class: "t-caption", style: "margin-bottom:6px" }, "Preview"),
          preview),
      ),
      el("div", { class: "t-caption", style: "margin-top:var(--sp-3)" }, "Added to emails when you tick Add my signature while sending."),
      el("div", { style: "margin-top:var(--sp-3)" }, saveBtn)));
  col.append(card);
  api("/api/signature").then((d) => {
    editor.innerHTML = d.html || "";
    htmlArea.value = d.html || "";
    sync();
  }).catch(() => {});
}

/* ================= AI ================= */
function secAI(col) {
  const on = SETTINGS.ai_enabled === "1";
  const hasKey = SETTINGS.ai_has_key === "1";
  const keyInp = el("input", { class: "input wide", type: "password", placeholder: hasKey ? "Key saved - paste to replace" : "Paste your API key", "autocomplete": "off", "aria-label": "API key" });
  const showKey = el("button", { class: "btn btn-icon", "aria-label": "Show key" }, icon("eye"));
  showKey.onclick = () => { keyInp.type = keyInp.type === "password" ? "text" : "password"; showKey.innerHTML = ""; showKey.append(icon(keyInp.type === "password" ? "eye" : "eye", "i")); };
  const model = el("input", { class: "input", value: SETTINGS.ai_model || "", "aria-label": "Model" });
  const baseUrl = el("input", { class: "input", value: SETTINGS.ai_base_url || "", "aria-label": "Base URL" });
  const testRes = el("span", { class: "t-caption", style: "min-width:0" });
  const testBtn = el("button", { class: "btn btn-ghost btn-sm" }, "Test connection");
  testBtn.onclick = async () => {
    if (keyInp.value.trim()) {
      try { await api("/api/settings", { body: { ai_api_key: keyInp.value.trim() } }); } catch { /* test may use saved key */ }
    }
    testRes.innerHTML = "";
    testRes.append(el("span", { class: "t-caption t-faint" }, "Testing…"));
    try {
      const d = await api("/api/ai/test", { body: {} });
      testRes.innerHTML = "";
      testRes.append(el("span", { style: "color:var(--success);font-size:12.5px;font-weight:600" }, d.ok ? "Works" : "Works (no test call)"));
    } catch (e) {
      testRes.innerHTML = "";
      testRes.append(el("span", { style: "color:var(--danger);font-size:12.5px" }, e.message));
    }
  };
  const saveBtn = el("button", { class: "btn btn-primary btn-sm" }, "Save");
  saveBtn.onclick = async () => {
    await withLoading(saveBtn, async () => {
      try {
        const body = { ai_model: model.value.trim(), ai_base_url: baseUrl.value.trim() };
        if (keyInp.value.trim()) body.ai_api_key = keyInp.value.trim();
        await api("/api/settings", { body });
        SETTINGS.ai_model = body.ai_model;
        SETTINGS.ai_base_url = body.ai_base_url;
        if (body.ai_api_key) { SETTINGS.ai_has_key = "1"; keyInp.value = ""; }
        toast("AI settings saved.");
      } catch (e) { toast(e.message, { type: "error" }); }
    });
  };
  const card = el("div", { class: "set-card" },
    el("div", { class: "set-card-head" }, icon("sparkles", "i i-16"), "AI features"),
    el("div", { class: "set-card-body" },
      row("Turn on AI features", "Writes templates, suggests replies and polishes emails for you.",
        switchInput(on, (v) => autosave("ai_enabled", v ? "1" : "0", card)), "AI features"),
      row("Model", "Which model writes your emails.", el("div", { class: "set-row-ctrl" }, model)),
      el("details", {},
        el("summary", { style: "cursor:pointer;font-size:13px;color:var(--text-2);padding:10px 0" }, "Advanced (base URL)"),
        el("div", { class: "set-row" }, el("div", { class: "set-row-main" },
          el("div", { class: "set-row-label" }, "Base URL"),
          el("div", { class: "set-row-help" }, "Usually fills itself from your provider. Leave as-is unless your provider is different."),
          el("div", { class: "set-row-ctrl", style: "margin-top:6px" }, baseUrl)))),
      el("div", { style: "padding:12px 0;border-top:1px solid var(--border)" },
        el("div", { class: "set-row-label" }, "API key"),
        el("div", { class: "set-row-help" }, "Where to get one: OpenAI at platform.openai.com/api-keys, Groq at console.groq.com/keys, Google Gemini at aistudio.google.com/apikey."),
        el("div", { class: "set-row-ctrl", style: "margin-top:8px" }, keyInp, showKey,
          el("span", { style: "display:flex;gap:8px;align-items:center" }, testBtn, testRes), saveBtn)),
      el("div", { class: "set-row-help", style: "margin-top:10px" },
        "AI is used for: writing a first draft from a short brief, and polishing an email you already wrote. You review everything before it goes out.")));
  col.append(card);
}

/* ================= Branding (admin) ================= */
function secBranding(col) {
  const team = el("input", { class: "input wide", value: SETTINGS.brand_team_name || "", "aria-label": "Team name" });
  const tagline = el("input", { class: "input wide", value: SETTINGS.brand_tagline || "", "aria-label": "Login footer line" });
  const adminEmail = el("input", { class: "input wide", value: SETTINGS.admin_email || "", "aria-label": "Admin email" });
  const mini = el("div", { class: "brand-preview" },
    el("div", { class: "side-mark" }, icon("send", "i")),
    el("div", {},
      el("div", { style: "font-weight:700;font-size:13px" }, "CampusMail AI"),
      el("div", { class: "t-caption" }, team.value || "Your team name"),
      el("div", { class: "t-caption", style: "margin-top:4px" }, tagline.value || "Your footer line")));
  function syncMini() {
    mini.children[1].children[1].textContent = team.value || "Your team name";
    mini.children[1].children[2].textContent = tagline.value || "Your footer line";
  }
  team.addEventListener("input", syncMini);
  tagline.addEventListener("input", syncMini);
  const saveBtn = el("button", { class: "btn btn-primary" }, "Save");
  saveBtn.onclick = async () => {
    await withLoading(saveBtn, async () => {
      try {
        await api("/api/settings", { body: {
          brand_team_name: team.value.trim(), brand_tagline: tagline.value.trim(), admin_email: adminEmail.value.trim(),
        } });
        toast("Branding saved.");
      } catch (e) { toast(e.message, { type: "error" }); }
    });
  };
  col.append(el("div", { class: "set-card" },
    el("div", { class: "set-card-head" }, icon("globe", "i i-16"), "Team branding"),
    el("div", { class: "set-card-body" },
      row("Team name", "Shown under the app name in the sidebar.", team),
      row("Login footer line", "One line at the bottom of the login card.", tagline),
      row("Admin email", "Where 'Contact your admin' points.", adminEmail),
      el("div", {}, mini, el("div", { style: "margin-top:12px" }, saveBtn)))));
}

/* ================= Advanced (admin) ================= */
function secAdvanced(col) {
  col.append(acc("Setup assistant", "Not set", "info", () =>
    el("div", { style: "padding-top:12px" },
      el("div", { class: "set-row-help", style: "margin-bottom:10px" }, "A short guided flow: connect Gmail, add your first list, write your first template."),
      el("a", { class: "btn btn-secondary btn-sm", href: "/guide" }, "Open setup assistant"))));

  /* Google sign-in */
  const gid = el("input", { class: "input", value: SETTINGS.google_client_id || "", placeholder: "client id", "aria-label": "Google client ID" });
  const gsec = el("input", { class: "input", type: "password", value: SETTINGS.google_client_secret || "", placeholder: "client secret", "aria-label": "Google client secret" });
  const gsave = el("button", { class: "btn btn-primary btn-sm" }, "Save");
  gsave.onclick = async () => {
    await withLoading(gsave, async () => {
      try {
        await api("/api/settings", { body: { google_client_id: gid.value.trim(), google_client_secret: gsec.value.trim() } });
        toast("Google sign-in saved.");
      } catch (e) { toast(e.message, { type: "error" }); }
    });
  };
  col.append(acc("Google sign-in", SETTINGS.google_ready === "1" ? "Set" : "Not set", SETTINGS.google_ready === "1" ? "check-circle-2" : "circle-dashed", () =>
    el("div", { style: "display:flex;flex-direction:column;gap:10px;padding-top:12px" },
      el("div", { class: "set-row-help", style: "margin:0" }, "Lets people sign in with their Google account. Needs a separate OAuth client from the Gmail one (scope: openid email profile)."),
      el("div", { class: "row", style: "gap:8px" }, gid, gsec, gsave))));

  /* Gmail API client */
  const gj = el("textarea", { class: "input", style: "width:100%;min-height:110px", placeholder: "Paste the client JSON here", "aria-label": "Gmail client JSON" });
  const gjFile = el("input", { type: "file", accept: ".json", style: "display:none" });
  const gjSave = el("button", { class: "btn btn-primary btn-sm" }, "Save");
  gjSave.onclick = async () => {
    const v = gj.value.trim();
    if (!v) { toast("Paste the client JSON first.", { type: "error" }); return; }
    try { JSON.parse(v); } catch { toast("That is not valid JSON. Paste the whole client secret file.", { type: "error" }); return; }
    await withLoading(gjSave, async () => {
      try {
        await api("/api/settings", { body: { client_secret_json: v } });
        toast("Gmail client is set.");
        render();
      } catch (e) { toast(e.message, { type: "error" }); }
    });
  };
  col.append(acc("Gmail API client", SETTINGS.client_secret_set === "1" ? "Gmail client is set" : "Not set",
    SETTINGS.client_secret_set === "1" ? "check-circle-2" : "circle-dashed", () =>
    el("div", { style: "display:flex;flex-direction:column;gap:10px;padding-top:12px" },
      el("div", { class: "set-row-help", style: "margin:0" }, "From your Google Cloud project: OAuth client ID, download the JSON and paste it here."),
      el("div", { class: "row", style: "gap:8px" },
        el("button", { class: "btn btn-ghost btn-sm", onclick: () => gjFile.click() }, "Choose file"),
        gjSave),
      gj, gjFile)));
  gjFile.onchange = () => {
    const f = gjFile.files[0];
    if (!f) return;
    f.text().then((t) => { gj.value = t; });
  };

  /* Cloud scheduling */
  const rurl = el("input", { class: "input", value: SETTINGS.cloud_relay_url || "", placeholder: "https://YOUR-PROJECT.functions.supabase.co/relay", "aria-label": "Cloud scheduling URL" });
  const rsec = el("input", { class: "input", type: "password", value: SETTINGS.cloud_relay_secret || "", placeholder: "RELAY_SECRET", "aria-label": "Cloud scheduling secret" });
  const rsave = el("button", { class: "btn btn-primary btn-sm" }, "Save");
  rsave.onclick = async () => {
    await withLoading(rsave, async () => {
      try {
        await api("/api/settings", { body: { cloud_relay_url: rurl.value.trim(), cloud_relay_secret: rsec.value.trim() } });
        toast("Cloud scheduling saved.");
      } catch (e) { toast(e.message, { type: "error" }); }
    });
  };
  const packBtn = el("button", { class: "btn btn-ghost btn-sm" }, "Show relay setup values");
  packBtn.onclick = async () => {
    const d = await api("/api/accounts").catch(() => ({ accounts: [] }));
    const accts = (d.accounts || []).filter((a) => a.connected);
    if (!accts.length) { toast("Connect a Gmail account first.", { type: "error" }); return; }
    const sel = el("select", { class: "select", style: "width:100%", "aria-label": "Account" },
      ...accts.map((a) => el("option", { value: String(a.id) }, a.email || a.label)));
    const copyBtn = el("button", { class: "btn btn-primary" }, "Copy all");
    copyBtn.onclick = async () => {
      try {
        const r = await api("/api/settings/relay-pack?account_id=" + sel.value);
        const txt = Object.entries(r.pack).map(([k, v]) => k + "=" + v).join("\n");
        await navigator.clipboard.writeText(txt);
        toast("Copied to clipboard.");
      } catch (e) { toast(e.message, { type: "error" }); }
    };
    const m = modal({ title: "Relay setup values", wide: true,
      body: el("div", { style: "display:flex;flex-direction:column;gap:10px" },
        sel,
        el("div", { class: "t-caption" }, "Copy these five values into the relay function's environment.")),
      foot: [el("button", { class: "btn btn-ghost", onclick: () => m.close() }, "Close"), copyBtn] });
  };
  const relayOn = (SETTINGS.cloud_relay_url || "").trim() !== "";
  col.append(acc("Cloud scheduling", relayOn ? "On" : "Off", relayOn ? "zap" : "circle-dashed", () =>
    el("div", { style: "display:flex;flex-direction:column;gap:10px;padding-top:12px" },
      el("div", { class: "set-row-help", style: "margin:0" }, "Lets scheduled emails go out even when this computer is asleep."),
      el("div", { class: "row", style: "gap:8px" }, rurl),
      el("div", { class: "row", style: "gap:8px" }, rsec, rsave),
      packBtn)));

  /* Sync status */
  const syncBody = el("div", { style: "padding-top:12px" },
    el("div", { class: "t-small t-faint" }, "Loading sync status…"));
  const syncCard = acc("Sync status", relayOn ? "On" : "Off", relayOn ? "zap" : "circle-dashed", () => syncBody);
  const fmtBytes = (n) => {
    n = Number(n || 0);
    if (n < 1024) return n + " B";
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + " KB";
    return (n / 1024 / 1024).toFixed(2) + " MB";
  };
  const loadSyncStatus = async () => {
    try {
      const d = await api("/api/sync/status");
      syncBody.innerHTML = "";
      const line = (k, v) => el("div", { class: "row", style: "justify-content:space-between;gap:12px" },
        el("div", { class: "t-small t-faint" }, k), el("div", { class: "t-small" }, String(v)));
      if (!d.relay_configured) {
        syncBody.append(el("div", { class: "t-small t-faint" }, "No cloud relay is configured, so this instance works offline."));
        return;
      }
      syncBody.append(
        line("Client version", "v" + d.client_version + (d.halted ? "  ·  halted (relay requires upgrade)" : "")),
        line("Instance", d.instance || "—"),
        line("Changes waiting to send", d.pending_rows + " row(s)" + (d.fail_count ? "  ·  " + d.fail_count + " failed attempt(s), backing off" : "")),
      );
      const r = d.relay || {};
      if (r.ok) {
        const me = (r.instances || []).find((x) => x.instance === d.instance) || {};
        syncBody.append(
          el("div", { class: "t-small t-faint", style: "margin-top:10px" }, "Relay"),
          line("Relay version / enabled", "v" + r.version + (r.enabled ? "  ·  on" : "  ·  kill switch ON")),
          line("Last change id (rev)", String(d.rev_watermark)),
          line("Sent to relay (24h)", (me.rows_pushed_24h || 0) + " rows · " + fmtBytes(me.bytes_pushed_24h)),
          line("Received from relay (24h)", (me.rows_pulled_24h || 0) + " changes · " + fmtBytes(me.bytes_pulled_24h)),
          line("Project egress (24h)", fmtBytes(r.project.egress_used_bytes_24h) + " of " + r.project.egress_budget_mb_24h + " MB"),
          line("Outbox depth", r.outbox_depth + " change(s)"),
        );
        if (me.last_error) syncBody.append(line("Relay last error", me.last_error));
      } else if (r.error) {
        syncBody.append(el("div", { class: "t-small t-faint", style: "margin-top:10px" }, "Relay unreachable: " + r.error));
      }
    } catch (e) {
      syncBody.innerHTML = "";
      syncBody.append(el("div", { class: "t-small t-faint" }, "Could not load sync status: " + e.message));
    }
  };
  col.append(syncCard);
  if (relayOn) loadSyncStatus();

  /* File storage */
  const sbe = el("select", { class: "select", style: "width:170px", "aria-label": "Storage backend" },
    el("option", { value: "local" }, "This computer"),
    el("option", { value: "supabase" }, "Supabase bucket"));
  sbe.value = SETTINGS.storage_backend || "local";
  const surl = el("input", { class: "input wide", value: SETTINGS.supabase_url || "", placeholder: "https://xxx.supabase.co", "aria-label": "Supabase URL" });
  const sbk = el("input", { class: "input", value: SETTINGS.supabase_bucket || "", placeholder: "bucket name", "aria-label": "Bucket" });
  const ssk = el("input", { class: "input", type: "password", placeholder: SETTINGS.supabase_key_set === "1" ? "Service key saved" : "service role key", "aria-label": "Service key" });
  const ssave = el("button", { class: "btn btn-primary btn-sm" }, "Save");
  ssave.onclick = async () => {
    await withLoading(ssave, async () => {
      try {
        const body = { storage_backend: sbe.value, supabase_url: surl.value.trim(), supabase_bucket: sbk.value.trim() };
        if (ssk.value.trim()) body.supabase_service_key = ssk.value.trim();
        await api("/api/settings", { body });
        toast("Storage settings saved.");
      } catch (e) { toast(e.message, { type: "error" }); }
    });
  };
  const smig = el("button", { class: "btn btn-ghost btn-sm" }, "Move existing files");
  smig.onclick = async () => {
    await withLoading(smig, async () => {
      try {
        const d = await api("/api/storage/migrate", { body: {} });
        toast(d.failed ? d.moved + " moved, " + d.failed + " failed" : d.moved + " file(s) moved.");
      } catch (e) { toast(e.message, { type: "error" }); }
    });
  };
  col.append(acc("File storage", (SETTINGS.storage_backend || "local") === "supabase" ? "Supabase" : "Local", "folder-open", () =>
    el("div", { style: "display:flex;flex-direction:column;gap:10px;padding-top:12px" },
      el("div", { class: "row", style: "gap:8px" }, sbe),
      el("div", { class: "row", style: "gap:8px" }, surl),
      el("div", { class: "row", style: "gap:8px" }, sbk, ssk, ssave, smig))));

  /* Deployment */
  if (SETTINGS && SETTINGS.deploy_url) {
    const dep = el("button", { class: "btn btn-secondary btn-sm" }, "Update to the latest version");
    dep.onclick = async () => {
      await withLoading(dep, async () => {
        try { const d = await api("/api/deploy", { body: {} }); toast(d.message || "Updated."); }
        catch (e) { toast(e.message, { type: "error" }); }
      });
    };
    col.append(acc("Deployment", "Hosted", "zap", () => el("div", { style: "padding-top:12px" }, dep)));
  }

  /* Danger zone */
  col.append(dangerZone());
}
function acc(title, chip, chipIcon, bodyFactory) {
  const item = el("div", { class: "acc-item" });
  const head = el("button", { class: "acc-head", type: "button", "aria-expanded": "false" },
    el("span", {}, title),
    el("span", { class: "chip" }, chip),
    icon("chevron-down", "i i-16 chev"));
  const body = el("div", { class: "acc-body" });
  head.onclick = () => {
    const open = item.classList.toggle("is-open");
    head.setAttribute("aria-expanded", String(open));
    if (open && !body.dataset.built) {
      body.dataset.built = "1";
      body.append(bodyFactory());
    }
  };
  item.append(head, body);
  return item;
}
function dangerZone() {
  const btn = el("button", { class: "btn btn-danger btn-sm" }, "Empty all emails");
  btn.onclick = async () => {
    const n = await api("/api/emails?sort=time&dir=desc").then((d) => d.total).catch(() => 0);
    const ok = await confirmTyped({
      title: "Empty all emails?",
      body: "This deletes every email in every campaign. Templates and contact lists stay. Type the number to confirm.",
      expect: String(n),
      actionLabel: "Empty " + fmtInt(n) + " " + (n === 1 ? "email" : "emails"),
    });
    if (!ok) return;
    try {
      const d = await api("/api/emails?sort=time&dir=desc");
      const ids = d.rows.map((r) => r.id);
      for (let i = 0; i < ids.length; i += 500) {
        await api("/api/emails/delete", { body: { ids: ids.slice(i, i + 500) } });
      }
      toast("All emails removed.");
    } catch (e) { toast(e.message, { type: "error" }); }
  };
  const item = el("div", { class: "acc-item danger" });
  const head = el("button", { class: "acc-head", type: "button", "aria-expanded": "false" },
    el("span", {}, "Danger zone"),
    el("span", { class: "chip" }, "Use with care"));
  const body = el("div", { class: "acc-body" },
    el("div", { style: "padding-top:12px;display:flex;flex-direction:column;gap:10px" },
      el("div", { class: "set-row-help", style: "margin:0" }, "Removes every email. Drafts in Gmail are not touched - clean those up there too."),
      btn));
  head.onclick = () => head.setAttribute("aria-expanded", String(item.classList.toggle("is-open")));
  item.append(head, body);
  return item;
}

init();
