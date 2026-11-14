/* CampusMail AI interaction toolkit: api, toasts, modals, drawers, menus,
   confirmation tiers, undoable (deferred commit), hold-to-confirm. */
import { STATUS, MSG, statusOf } from "./copy.js";

/* ---------------- API ---------------- */
let _sessionShown = false;
export async function api(url, opts = {}) {
  const init = { method: opts.method || (opts.body ? "POST" : "GET"), headers: {} };
  if (opts.body !== undefined) {
    init.body = typeof opts.body === "string" ? opts.body : JSON.stringify(opts.body);
    init.headers["Content-Type"] = "application/json";
  }
  if (opts.signal) init.signal = opts.signal;
  const res = await fetch(url, init);
  if (res.status === 401) {
    if (!_sessionShown) {
      _sessionShown = true;
      setTimeout(() => (_sessionShown = false), 4000);
      toast(MSG.sessionExpired(), { type: "error" });
      setTimeout(() => { location.href = "/login?next=" + encodeURIComponent(location.pathname + location.search); }, 800);
    }
    throw new Error("Not signed in");
  }
  let data = null;
  try { data = await res.json(); } catch { /* no body */ }
  if (!res.ok) {
    const err = new Error((data && (data.error || data.message)) || `Request failed (${res.status})`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

export function esc(s) {
  const AMP = String.fromCharCode(38);
  const map = {
    [AMP]: AMP + "amp;",
    "<": AMP + "lt;",
    ">": AMP + "gt;",
    '"': AMP + "quot;",
    "'": AMP + "#39;"
  };
  return String(s ?? "").replace(/[&<>"']/g, function (c) { return map[c]; });
}

export function el(tag, attrs = {}, ...children) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === "class") n.className = v;
    else if (k === "html") n.innerHTML = v;
    else if (k === "dataset") Object.assign(n.dataset, v);
    else if (k.startsWith("on") && typeof v === "function") n.addEventListener(k.slice(2), v);
    else if (v === true) n.setAttribute(k, "");
    else n.setAttribute(k, v);
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    n.append(c.nodeType ? c : document.createTextNode(c));
  }
  return n;
}

export function icon(name, cls = "i") {
  const s = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  s.setAttribute("class", cls);
  s.setAttribute("aria-hidden", "true");
  const u = document.createElementNS("http://www.w3.org/2000/svg", "use");
  u.setAttribute("href", "/static/icons/sprite.svg#" + name);
  s.append(u);
  return s;
}

/* ---------------- Toasts ---------------- */
const TOAST_ICONS = { success: "check-circle-2", error: "alert-triangle", info: "info" };
export function toast(message, { type = "success", action, actionLabel = "Undo", duration } = {}) {
  let root = document.querySelector(".toast-root");
  if (!root) { root = el("div", { class: "toast-root", role: "status", "aria-live": "polite" }); document.body.append(root); }
  while (root.children.length >= 3) root.firstChild.remove();
  const t = el("div", { class: `toast toast-${type}` },
    icon(TOAST_ICONS[type] || "info"),
    el("div", { class: "toast-msg" }, message),
  );
  let timer;
  const dismiss = () => {
    clearTimeout(timer);
    t.classList.add("out");
    setTimeout(() => t.remove(), 220);
  };
  if (action) {
    const b = el("button", { class: "toast-action", onclick: () => { action(); dismiss(); } }, actionLabel);
    t.append(b);
  }
  t.addEventListener("mouseenter", () => clearTimeout(timer));
  t.addEventListener("mouseleave", () => { timer = setTimeout(dismiss, 800); });
  root.append(t);
  timer = setTimeout(dismiss, duration ?? (action ? 10000 : 6000));
  return { dismiss };
}

/* ---------------- Modal ---------------- */
let _modalStack = [];
export function modal({ title, sub, wide = false, body, foot, onClose, closable = true }) {
  const scrim = el("div", { class: "modal-scrim" });
  const box = el("div", { class: "modal" + (wide ? " modal-wide" : ""), role: "dialog", "aria-modal": "true", "aria-label": title },
    el("div", { class: "modal-head" },
      el("div", { class: "modal-title" }, title),
      sub ? el("div", { class: "modal-sub" }, sub) : null,
    ),
    el("div", { class: "modal-body" }, ...(body ? [body] : [])),
    foot ? el("div", { class: "modal-foot" }, ...(Array.isArray(foot) ? foot : [foot])) : null,
  );
  scrim.append(box);
  document.body.append(scrim);
  const prevFocus = document.activeElement;
  requestAnimationFrame(() => scrim.classList.add("open"));
  const focusables = () => [...box.querySelectorAll("button, [href], input, select, textarea")].filter((x) => !x.disabled);
  const first = focusables()[0];
  if (first) first.focus();
  const close = () => {
    if (closing) return;
    closing = true;
    scrim.classList.remove("open");
    setTimeout(() => scrim.remove(), 220);
    document.removeEventListener("keydown", onKey, true);
    if (prevFocus && prevFocus.focus) prevFocus.focus();
    if (onClose) onClose();
  };
  let closing = false;
  const onKey = (e) => {
    if (e.key === "Escape" && closable) { e.stopPropagation(); close(); }
    if (e.key === "Tab") {
      const f = focusables();
      if (!f.length) return;
      const i = f.indexOf(document.activeElement);
      if (e.shiftKey && (i <= 0)) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); }
    }
  };
  document.addEventListener("keydown", onKey, true);
  scrim.addEventListener("mousedown", (e) => { if (e.target === scrim && closable) close(); });
  _modalStack.push(close);
  return { close, box, body: box.querySelector(".modal-body"), foot: box.querySelector(".modal-foot") };
}

/* ---------------- Drawer ---------------- */
export function drawer({ title, sub, body, foot, onClose }) {
  const scrim = el("div", { class: "drawer-scrim" });
  const d = el("div", { class: "drawer", role: "dialog", "aria-modal": "true", "aria-label": String(title).slice(0, 60) },
    el("div", { class: "drawer-head" },
      el("div", { style: "min-width:0" },
        el("div", { class: "t-card truncate" }, title),
        sub ? el("div", { class: "t-caption t-faint mt-2" }, sub) : null,
      ),
      el("button", { class: "btn btn-icon push", "aria-label": "Close", onclick: () => close() }, icon("x")),
    ),
    el("div", { class: "drawer-body" }, ...(body ? [body] : [])),
    foot ? el("div", { class: "drawer-foot" }, ...(Array.isArray(foot) ? foot : [foot])) : null,
  );
  document.body.append(scrim, d);
  requestAnimationFrame(() => { scrim.classList.add("open"); d.classList.add("open"); });
  const prevFocus = document.activeElement;
  const x = d.querySelector("button[aria-label=Close]");
  if (x) x.focus();
  let closing = false;
  const close = () => {
    if (closing) return;
    closing = true;
    scrim.classList.remove("open");
    d.classList.remove("open");
    setTimeout(() => { scrim.remove(); d.remove(); }, 300);
    if (prevFocus && prevFocus.focus) prevFocus.focus();
    if (onClose) onClose();
  };
  const onKey = (e) => { if (e.key === "Escape") { e.stopPropagation(); close(); } };
  document.addEventListener("keydown", onKey, true);
  scrim.addEventListener("mousedown", close);
  return { close, body: d.querySelector(".drawer-body"), foot: d.querySelector(".drawer-foot") };
}

/* ---------------- Menu (popover) ---------------- */
export function menu(anchor, items, { align = "end" } = {}) {
  closeAllMenus();
  const m = el("div", { class: "menu", role: "menu" });
  for (const it of items) {
    if (it === "-") { m.append(el("div", { class: "menu-sep" })); continue; }
    m.append(el("button", {
      class: "menu-item" + (it.danger ? " danger" : ""),
      role: "menuitem",
      onclick: () => { m.remove(); it.action && it.action(); },
    }, it.icon ? icon(it.icon, "i i-16") : null, it.label ?? it.text));
  }
  document.body.append(m);
  const r = anchor.getBoundingClientRect();
  const mw = m.offsetWidth;
  m.style.top = (r.bottom + 6 + window.scrollY) + "px";
  if (align === "end") m.style.left = Math.max(8, r.right - mw + window.scrollX) + "px";
  else m.style.left = (r.left + window.scrollX) + "px";
  const onDown = (e) => { if (!m.contains(e.target) && e.target !== anchor) { m.remove(); document.removeEventListener("mousedown", onDown, true); } };
  const onKey = (e) => { if (e.key === "Escape") { m.remove(); document.removeEventListener("keydown", onKey, true); } };
  setTimeout(() => {
    document.addEventListener("mousedown", onDown, true);
    document.addEventListener("keydown", onKey, true);
  }, 0);
  const first = m.querySelector(".menu-item");
  if (first) first.focus();
  return m;
}
export function closeAllMenus() {
  document.querySelectorAll(".menu").forEach((m) => m.remove());
}

/* ---------------- Confirmation tiers (5.7) ----------------
   tier 0: do it + Undo toast (undoable helper)
   tier 1: small confirm modal
   tier 2: caller builds the review sheet (see send flow)
   tier 3: review sheet + hold-to-confirm + 10s cancel (see send flow)
   tier 4: typed confirmation (number or word) */
export function confirmSimple({ title, body, actionLabel, danger = true, onAction }) {
  return new Promise((resolve) => {
    let settled = false;
    const settle = (v) => { if (!settled) { settled = true; resolve(v); } };
    const btn = el("button", { class: "btn " + (danger ? "btn-danger" : "btn-primary") }, actionLabel);
    const m = modal({
      title, sub: body,
      foot: [
        el("button", { class: "btn btn-ghost", onclick: () => { m.close(); settle(false); } }, "Cancel"),
        btn,
      ],
      onClose: () => settle(false),
    });
    btn.addEventListener("click", async () => {
      btn.classList.add("is-loading"); btn.disabled = true;
      settle(true);
      m.close();
      try { if (onAction) await onAction(); } catch (e) { /* caller handles */ }
    });
  });
}

export function confirmTyped({ title, body, expect, actionLabel }) {
  return new Promise((resolve) => {
    const input = el("input", { class: "input", placeholder: String(expect), "aria-label": "Type to confirm" });
    const btn = el("button", { class: "btn btn-danger", disabled: true }, actionLabel);
    input.addEventListener("input", () => { btn.disabled = input.value.trim() !== String(expect); });
    const m = modal({
      title, sub: body,
      body: el("div", { class: "field" },
        el("label", { class: "field-label", for: "" }, `Type ${expect} to confirm`),
        input,
      ),
      foot: [
        el("button", { class: "btn btn-ghost", onclick: () => { m.close(); resolve(false); } }, "Cancel"),
        btn,
      ],
      onClose: () => resolve(false),
    });
    btn.addEventListener("click", async () => {
      btn.classList.add("is-loading"); btn.disabled = true;
      resolve(true);
      m.close();
    });
    input.focus();
  });
}

/* Deferred commit: optimistic UI, Undo toast, commit after 6 s. Flush on pagehide. */
const _pending = [];
export function undoable(label, commitFn, rollbackFn) {
  let done = false;
  const t = el("div"); // anchor to keep a reference
  const entry = { committed: false, commitFn };
  _pending.push(entry);
  const timer = setTimeout(async () => {
    entry.committed = true;
    try { await commitFn(); }
    catch (e) {
      try { rollbackFn && rollbackFn(); } catch { /* best effort */ }
      toast("Could not save. Check your connection and try again.", { type: "error", action: async () => { await commitFn().catch(() => {}); }, actionLabel: "Retry" });
    }
    _pending.splice(_pending.indexOf(entry), 1);
    done = true;
  }, 6000);
  const t2 = toast(label, {
    type: "success",
    action: () => {
      if (done) return;
      clearTimeout(timer);
      _pending.splice(_pending.indexOf(entry), 1);
      rollbackFn && rollbackFn();
    },
  });
  return { cancel: () => { if (!done) { clearTimeout(timer); _pending.splice(_pending.indexOf(entry), 1); } } };
}
window.addEventListener("pagehide", () => {
  for (const e of [..._pending]) {
    if (e.committed) continue;
    try { e.commitFn && e.commitFn(); } catch { /* best effort */ }
  }
});

/* ---------------- Hold-to-confirm button ---------------- */
export function holdToConfirm(button, { onConfirm, duration = 1200, label = "Hold to confirm" }) {
  let raf = null, start = 0, active = false;
  const fill = el("span", { class: "hold-fill" });
  const lbl = el("span", { class: "hold-label" }, label);
  button.classList.add("btn-hold");
  button.append(fill, lbl);
  const step = (ts) => {
    if (!active) return;
    const p = Math.min(1, (ts - start) / duration);
    fill.style.transform = `scaleX(${p})`;
    lbl.lastChild.textContent = ` ${Math.round(p * 100)}%`;
    if (p >= 1) { stop(true); return; }
    raf = requestAnimationFrame(step);
  };
  const startHold = (e) => {
    if (active || button.disabled) return;
    active = true; start = performance.now();
    raf = requestAnimationFrame(step);
  };
  const stop = (fired) => {
    if (!active) return;
    active = false;
    cancelAnimationFrame(raf);
    fill.style.transform = "scaleX(0)";
    lbl.lastChild.textContent = "";
    if (fired) onConfirm();
  };
  button.addEventListener("mousedown", startHold);
  button.addEventListener("touchstart", (e) => { e.preventDefault(); startHold(e); }, { passive: false });
  button.addEventListener("mouseup", () => stop(false));
  button.addEventListener("mouseleave", () => stop(false));
  button.addEventListener("touchend", () => stop(false));
  button.addEventListener("keydown", (e) => {
    if ((e.key === " " || e.key === "Enter") && !e.repeat) { e.preventDefault(); startHold(); }
  });
  button.addEventListener("keyup", (e) => { if (e.key === " " || e.key === "Enter") stop(false); });
}

/* ---------------- Status badge ----------------
   One component for everything (5.6).
   statusBadge(email)        -> effective email status (replies/bounces aware)
   statusBadge(contact, { contact: true, status }) -> contact vocabulary */
export function statusBadge(status, opts = {}) {
  if (opts.contact) {
    const s = String(status || "new");
    if (s === "new") return badge("Not contacted", "neutral", "circle-dashed");
    const info = STATUS[s] || { label: s, cls: "neutral", icon: "circle-dashed" };
    return badge(info.label, info.cls, info.icon);
  }
  const key = statusOf(status || {});
  const info = STATUS[key] || { label: key, cls: "neutral", icon: "circle-dashed" };
  return badge(info.label, info.cls, info.icon);
}

export function badge(label, cls = "neutral", iconName) {
  return el("span", { class: `badge ${cls}` }, iconName ? icon(iconName, "i i-14") : null, label);
}

/* ---------------- Four states helpers ---------------- */
export function errorCard(message, { onRetry, detail } = {}) {
  return el("div", { class: "banner banner-danger", role: "alert" },
    icon("alert-triangle"),
    el("div", { style: "flex:1" }, message,
      detail ? el("details", { style: "margin-top:6px" },
        el("summary", { style: "cursor:pointer;font-weight:600" }, "Details"),
        el("div", { class: "t-mono t-faint", style: "margin-top:4px;max-width:68ch" }, detail)) : null),
    onRetry ? el("button", { class: "btn btn-sm push", onclick: onRetry }, "Retry") : null,
  );
}

export function emptyState({ icon: ic = "inbox", title, text, primary, secondary }) {
  return el("div", { class: "empty" },
    el("div", { class: "empty-illust", html: spotIllust(ic) }),
    el("div", { class: "empty-title" }, title),
    text ? el("p", { class: "empty-text" }, text) : null,
    primary || null,
    secondary || null,
  );
}

/* Spot illustrations: simple geometric two-tone marks from the brand palette. */
export function spotIllust(kind) {
  const p = { fill: "none", stroke: "var(--primary-500)", "stroke-width": 2.4, "stroke-linecap": "round", "stroke-linejoin": "round" };
  const light = { fill: "var(--primary-100)", stroke: "none" };
  let shapes = "";
  if (kind === "replies") shapes = `
    <rect x="20" y="30" width="56" height="40" rx="8" fill="var(--primary-100)" stroke="none" />
    <path d="M20 38l28 20 28-20" ${p} />
    <circle cx="64" cy="60" r="14" fill="var(--surface)" stroke="var(--primary-500)" stroke-width="2.4" />
    <path d="M64 52v9l6 4" ${p} />`;
  if (kind === "campaigns") shapes = `
    <path d="M18 74 L78 26" stroke="var(--primary-200)" stroke-width="2.4" stroke-dasharray="1 8" stroke-linecap="round"/>
    <path d="M14 78 L58 44 L52 66 L38 60 Z" ${lightFill()} />
    <path d="M58 44 L80 22 M58 44 l-4 16 M58 44 l16-6" ${p} />`;
  if (kind === "success") shapes = `
    <circle cx="48" cy="48" r="26" ${lightFill()} />
    <path d="M36 49l9 9 17-19" ${p} />`;
  if (kind === "wrong") shapes = `
    <rect x="22" y="38" width="34" height="22" rx="6" ${lightFill()} />
    <path d="M56 49h12M78 49h-8" ${p} />
    <path d="M74 43l8 12M82 43l-8 12" ${p} />`;
  if (kind === "contacts") shapes = `
    <rect x="24" y="34" width="48" height="14" rx="4" ${lightFill()} />
    <rect x="28" y="52" width="48" height="14" rx="4" ${lightFill()} />
    <rect x="20" y="50" width="52" height="18" rx="6" fill="var(--surface)" ${p} />
    <circle cx="34" cy="59" r="5" ${p} />
    <path d="M44 56h18M44 62h12" ${p} />`;
  if (kind === "hourglass") shapes = `
    <path d="M32 26h32M32 70h32" ${p} />
    <path d="M36 26c0 14 12 16 12 22s-12 8-12 22M60 26c0 14-12 16-12 22s12 8 12 22" ${p} />
    <path d="M40 62h16l-8-10z" fill="var(--primary-200)" stroke="none" />`;
  if (kind === "error") shapes = `
    <rect x="20" y="36" width="30" height="24" rx="6" ${lightFill()} />
    <path d="M50 48h10" ${p} />
    <path d="M70 42l8 12M78 42l-8 12" ${p} />`;
  if (kind === "send") shapes = `
    <path d="M16 60 L80 24 M16 60 l20 4 M16 60 l8-20" ${p} />
    <path d="M16 60 L80 24 M16 60 l20 4 M16 60 l8-20" fill="none" ${p} />`;
  shapes = shapes || `
    <rect x="22" y="32" width="52" height="36" rx="8" ${lightFill()} />
    <path d="M22 40l26 18 26-18" ${p} />`;
  function lightFill() { return `fill="var(--primary-100)" stroke="none"`; }
  return `<svg viewBox="0 0 96 96" width="96" height="96" aria-hidden="true">${shapes}</svg>`;
}

/* button with loading state helper */
export async function withLoading(btn, fn) {
  if (btn.disabled) return;
  const html = btn.innerHTML;
  btn.classList.add("is-loading");
  btn.disabled = true;
  try { return await fn(); }
  finally {
    btn.classList.remove("is-loading");
    btn.disabled = false;
    btn.innerHTML = html;
  }
}
