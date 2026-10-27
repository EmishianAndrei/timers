"use strict";
/* Трекер: общее ядро — схема, утилиты, хранилище, синхронизация с Google-таблицей, отрисовка.
   Данные лежат в браузере (localStorage) и синхронизируются через Apps Script (apps-script/Code.gs). */

// ---------- схема (совпадает с apps-script/Code.gs) ----------
const SCHEMA = {
  settings:   ["id","value","updated"],
  timers:     ["id","name","group","color","order","itemId","archived","runningSince","created","cdMin","cdAcc","cdRang","updated"],
  sessions:   ["id","timerId","date","start","end","minutes","updated"],
  sections:   ["id","name","order","total","updated"],
  items:      ["id","sectionId","name","type","options","role","order","from","to","updated"],
  entries:    ["id","date","itemId","value","updated"],
  recipes:    ["id","kind","num","name","short","cat","unit","pack","kcal","prot","fat","carb","sugar","extra","ingredients","steps","notes","order","updated"],
  weekly:     ["id","name","order","archived","updated"],
  weeklyDone: ["id","week","itemId","done","updated"],
  goals:      ["id","month","section","name","target","progress","source","done","order","updated"],
  triggers:   ["id","trigger","action","done","order","updated"],
  skills:     ["id","category","name","order","updated"],
  wishes:     ["id","person","name","done","order","updated"],
  finCats:    ["id","group","name","kind","inTotal","order","archived","updated"],
  finOps:     ["id","date","catId","amount","note","updated"],
  debts:      ["id","name","base","order","archived","updated"],
  debtOps:    ["id","debtId","date","amount","note","updated"],
  lists:      ["id","name","group","order","updated"],
  tasks:      ["id","listId","parent","title","notes","due","done","doneAt","starred","order","updated"],
};
const BOOLF = new Set(["total","archived","done","inTotal","starred","cdRang"]);
const NUMF = new Set(["order","runningSince","created","updated","start","end","minutes","base","amount","cdMin","cdAcc","num"]);
const PALETTE = ["#3a74d6","#e0782f","#2a9a6a","#c2417a","#7a5ad6","#b8921c","#2398ae","#d24e4e","#5b8a2f","#9a5b2e"];
const ACT = {}, CHG = {}, FORM = {}, VIEWS = {};

// ---------- утилиты ----------
const $ = s => document.querySelector(s);
const pad = n => String(n).padStart(2, "0");
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const dkey = d => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
const parts = k => k.split("-").map(Number);
const dateOf = k => { const [y, m, d] = parts(k); return new Date(y, m - 1, d); };
const shift = (k, n) => { const d = dateOf(k); d.setDate(d.getDate() + n); return dkey(d); };
const dayStart = k => dateOf(k).getTime();
const dayEnd = k => { const d = dateOf(k); d.setDate(d.getDate() + 1); return d.getTime(); };
const today = () => dkey(new Date());
const mkey = k => k.slice(0, 7);
const shiftMonth = (mk, n) => { const [y, m] = mk.split("-").map(Number); const d = new Date(y, m - 1 + n, 1); return d.getFullYear() + "-" + pad(d.getMonth() + 1); };
const monthDays = mk => { const [y, m] = mk.split("-").map(Number); const n = new Date(y, m, 0).getDate(); return Array.from({length: n}, (_, i) => mk + "-" + pad(i + 1)); };
const weekStart = k => { const d = dateOf(k); const wd = (d.getDay() + 6) % 7; d.setDate(d.getDate() - wd); return dkey(d); };
const MONTHS = ["январь","февраль","март","апрель","май","июнь","июль","август","сентябрь","октябрь","ноябрь","декабрь"];
const MONTHS_G = ["января","февраля","марта","апреля","мая","июня","июля","августа","сентября","октября","ноября","декабря"];
const MONTHS_S = ["янв","фев","мар","апр","мая","июн","июл","авг","сен","окт","ноя","дек"];
const WD = ["вс","пн","вт","ср","чт","пт","сб"];
const WDL = ["воскресенье","понедельник","вторник","среда","четверг","пятница","суббота"];
const human = k => { const [, m, d] = parts(k); return d + " " + MONTHS_G[m - 1] + ", " + WDL[dateOf(k).getDay()]; };
const short = k => { const [, m, d] = parts(k); return d + " " + MONTHS_G[m - 1]; };
const monthName = mk => { const [y, m] = mk.split("-").map(Number); return MONTHS[m - 1][0].toUpperCase() + MONTHS[m - 1].slice(1) + " " + y; };
const fmt = ms => { const s = Math.max(0, Math.floor(ms / 1000)); return Math.floor(s / 3600) + ":" + pad(Math.floor(s % 3600 / 60)) + ":" + pad(s % 60); };
const fmtH = ms => { const m = Math.floor(ms / 60000); if (m < 1) return ms > 0 ? "< 1 мин" : "0 мин"; const h = Math.floor(m / 60), r = m % 60; return h ? h + " ч" + (r ? " " + r + " мин" : "") : r + " мин"; };
/** минуты → «ч:мм» */
const fmtMin = m => { if (m == null || isNaN(m)) return ""; m = Math.round(m); const s = m < 0 ? "−" : ""; m = Math.abs(m); return s + Math.floor(m / 60) + ":" + pad(m % 60); };
/** «1:30», «90», «1.5ч», «45м» → минуты */
function parseDur(s) {
  s = String(s ?? "").trim().replace(",", ".").toLowerCase(); if (!s) return null;
  let m = /^(\d+):(\d{1,2})$/.exec(s); if (m) return +m[1] * 60 + +m[2];
  m = /^(\d+(?:\.\d+)?)\s*(ч|h)$/.exec(s); if (m) return Math.round(+m[1] * 60);
  m = /^(\d+(?:\.\d+)?)\s*(м|мин|m|min)?$/.exec(s); if (m) return Math.round(+m[1]);
  return null;
}
const fnum = (x, d = 2) => (x == null || isNaN(x)) ? "" : Number(x).toLocaleString("ru-RU", {maximumFractionDigits: d});
const money = x => (x > 0 ? "+" : x < 0 ? "−" : "") + Math.abs(Math.round(x)).toLocaleString("ru-RU") + " ₽";
const toNum = v => { if (v === "" || v == null) return null; const n = Number(String(v).replace(",", ".").replace(/\s/g, "")); return isNaN(n) ? null : n; };
const byOrder = (a, b) => (a.order ?? 0) - (b.order ?? 0) || String(a.name || a.title || "").localeCompare(String(b.name || b.title || ""), "ru");
const hm2min = t => { const m = /^(\d{1,2}):(\d{2})$/.exec(t || ""); return m ? +m[1] * 60 + +m[2] : null; };
const min2hm = m => Math.floor(m / 60) + ":" + pad(Math.round(m % 60));
const fv = (f, n) => (f.elements.namedItem(n)?.value ?? "");
const nextOrder = list => list.reduce((m, x) => Math.max(m, x.order ?? 0), -1) + 1;
const opt = (v, label, sel) => `<option value="${esc(v)}" ${sel ? "selected" : ""}>${esc(label)}</option>`;
const dnav = (act, label, canNext = true) => `<div class="datenav"><button type="button" class="icon" data-act="${act}" data-n="-1" aria-label="Назад">‹</button><span class="d">${label}</span><button type="button" class="icon" data-act="${act}" data-n="1" aria-label="Вперёд" ${canNext ? "" : "disabled"}>›</button></div>`;

/** Всплывающее сообщение; action = {label, fn} добавляет кнопку (например «Отменить»). */
function toast(msg, ms = 3500, action) {
  const t = $("#toast");
  t.innerHTML = `<span>${esc(msg)}</span>${action ? `<button type="button" class="toast-btn">${esc(action.label)}</button>` : ""}`;
  t.hidden = false;
  if (action) t.querySelector("button").onclick = () => { t.hidden = true; action.fn(); };
  clearTimeout(toast.t); toast.t = setTimeout(() => t.hidden = true, ms);
}

// ---------- подсказки при наведении (data-tip) ----------
const tipEl = document.createElement("div"); tipEl.className = "tip"; tipEl.hidden = true; document.body.appendChild(tipEl);
function posTip(e) {
  const p = 14, w = tipEl.offsetWidth, h = tipEl.offsetHeight;
  let x = e.clientX + p, y = e.clientY + p;
  if (x + w > innerWidth - 8) x = e.clientX - w - p;
  if (y + h > innerHeight - 8) y = e.clientY - h - p;
  tipEl.style.transform = `translate(${Math.max(8, x)}px,${Math.max(8, y)}px)`;
}
document.addEventListener("pointerover", e => {
  const t = e.target.closest && e.target.closest("[data-tip]");
  if (!t) { tipEl.hidden = true; return; }
  tipEl.textContent = t.dataset.tip; tipEl.hidden = false; posTip(e);
});
document.addEventListener("pointermove", e => { if (!tipEl.hidden) posTip(e); });
window.addEventListener("scroll", () => tipEl.hidden = true, {passive: true});

// ---------- хранилище ----------
const LSKEY = "tracker-v2", UIKEY = "tracker-ui";
let S = {cols: {}, outbox: [], cfg: {url: "", key: ""}, lastSync: 0, seq: 0};
let U = {tab: "timers", trView: "day", trDate: today(), trMonth: mkey(today()), tmDate: today(), finMonth: mkey(today()), goalMonth: mkey(today()), list: "", showDone: false, taskSort: "my"};

function load() {
  try { const v = JSON.parse(localStorage.getItem(LSKEY) || "null"); if (v && v.cols) S = Object.assign(S, v); } catch (e) {}
  try { Object.assign(U, JSON.parse(localStorage.getItem(UIKEY) || "{}")); } catch (e) {}
  for (const c in SCHEMA) S.cols[c] = S.cols[c] || {};
  U.trDate = U.trDate || today(); U.tmDate = today();
  U.menu = null; U.modal = null; U.adding = null; U.openTask = null;
}
let saveT = null;
function save() { clearTimeout(saveT); saveT = setTimeout(saveNow, 200); }
function saveNow() {
  clearTimeout(saveT);
  try { localStorage.setItem(LSKEY, JSON.stringify(S)); } catch (e) { toast("Браузер не дал сохранить данные: " + e.message); }
}
function saveUI() {
  const {menu, modal, adding, openTask, ...keep} = U;
  try { localStorage.setItem(UIKEY, JSON.stringify(keep)); } catch (e) {}
}
function norm(r) {
  const o = {};
  for (const k in r) {
    const v = r[k];
    if (BOOLF.has(k)) o[k] = v === true || v === "TRUE" || v === "true";
    else if (NUMF.has(k)) o[k] = (v === "" || v == null || isNaN(Number(v))) ? null : Number(v);
    else o[k] = v == null ? "" : String(v);
  }
  return o;
}
const all = c => Object.values(S.cols[c] || {});
const get = (c, id) => (S.cols[c] || {})[id];
let hold = 0, pend = false;
function batch(fn) { hold++; try { fn(); } finally { hold--; if (!hold && pend) { pend = false; changed(); } } }
function queue(op) {
  const id = op.r ? op.r.id : op.id;
  S.outbox = S.outbox.filter(o => !(o.c === op.c && (o.r ? o.r.id : o.id) === id));
  op.seq = ++S.seq; S.outbox.push(op);
}
function put(c, r) { r = norm(Object.assign({}, r, {updated: Date.now()})); (S.cols[c] = S.cols[c] || {})[r.id] = r; queue({c, op: "put", r}); changed(); return r; }
function patch(c, id, p) { const cur = get(c, id); if (cur) return put(c, Object.assign({}, cur, p)); }
function del(c, id) { if (!get(c, id)) return; delete S.cols[c][id]; queue({c, op: "del", id}); changed(); }
function changed() { if (hold) { pend = true; return; } save(); requestRender(); scheduleSync(); }
function setting(id, def) { const r = get("settings", id); return r ? r.value : def; }
function setSetting(id, value) { put("settings", {id, value: String(value)}); }
function moveIn(c, list, id, n) {
  const i = list.findIndex(x => x.id === id), j = i + n;
  if (i < 0 || j < 0 || j >= list.length) return;
  const arr = list.slice(); [arr[i], arr[j]] = [arr[j], arr[i]];
  batch(() => arr.forEach((x, k) => { if (x.order !== k) patch(c, x.id, {order: k}); }));
}

// ---------- синхронизация ----------
const NEED_SCRIPT = 3; let scriptVersion = 0;
let syncing = false, syncT = null, syncState = "off", syncMsg = "";
function syncLabel() {
  const pending = S.outbox.length;
  return syncState === "off" ? "Не подключено" : syncState === "busy" ? "Синхронизация…" :
    syncState === "err" ? "Ошибка связи" + (pending ? " · " + pending + " в очереди" : "") :
    pending ? pending + " в очереди" : "Синхронизировано";
}
function paintSync() { const el = $("#syncChip"); el.className = "sync " + syncState; el.querySelector("span").textContent = syncLabel(); el.title = syncMsg; }
function setSync(st, msg) {
  syncState = st || (S.cfg.url ? "ok" : "off"); syncMsg = msg || "";
  paintSync();
  if (U.tab === "settings" && !isEditing()) render();
}
function scheduleSync(ms = 1500) {
  if (!S.cfg.url || !S.cfg.key) { setSync("off"); return; }
  clearTimeout(syncT); syncT = setTimeout(sync, ms);
}
function errText(j) {
  return ({no_secret: "В скрипте не задан ключ (SECRET).", bad_key: "Ключ на сайте не совпадает с ключом в скрипте.",
    busy: "База занята другим устройством, повторю позже.", bad_json: "Скрипт не понял запрос."})[j.error] || ("Ошибка скрипта: " + (j.message || j.error));
}
async function sync(manual) {
  if (!S.cfg.url || !S.cfg.key) { setSync("off"); return; }
  if (syncing) { scheduleSync(2000); return; }
  syncing = true; setSync("busy");
  const ops = S.outbox.slice(0, 300);
  const sent = new Set(ops.map(o => o.seq));
  try {
    const res = await fetch(S.cfg.url, {method: "POST", body: JSON.stringify({key: S.cfg.key, ops: ops.map(({seq, ...o}) => o), pull: true})});
    const txt = await res.text();
    let j; try { j = JSON.parse(txt); } catch (e) { throw new Error("Скрипт вернул не JSON. Проверьте, что развёрнуто веб-приложение с доступом «Все»."); }
    if (!j.ok) throw new Error(errText(j));
    S.outbox = S.outbox.filter(o => !sent.has(o.seq));
    if (j.data) merge(j.data);
    scriptVersion = Number(j.version) || 1;
    if (String(setting("scriptVersion", "")) !== String(scriptVersion)) setSetting("scriptVersion", scriptVersion); // видно в таблице на листе settings
    S.lastSync = Date.now(); saveNow();
    setSync("ok");
    if (manual) toast("Синхронизировано");
    if (S.outbox.length) setTimeout(() => sync(), 300);
  } catch (e) {
    const msg = e instanceof TypeError ? "Нет связи с базой. Проверьте интернет и адрес скрипта." : (e.message || String(e));
    setSync("err", msg);
    if (manual) toast(msg, 6000);
  } finally { syncing = false; }
}
function merge(data) {
  const pending = {};
  for (const o of S.outbox) (pending[o.c] = pending[o.c] || new Set()).add(o.r ? o.r.id : o.id);
  for (const c in SCHEMA) {
    if (!Array.isArray(data[c])) continue; // лист не пришёл (старая версия скрипта) — оставляем локальные данные
    const next = {};
    for (const r of data[c]) { const n = norm(r); if (n.id) next[n.id] = n; }
    const p = pending[c];
    if (p) for (const id of p) { if (S.cols[c][id]) next[id] = S.cols[c][id]; else delete next[id]; }
    S.cols[c] = next;
  }
  softRender();
}

// ---------- отрисовка ----------
function isEditing() { const a = document.activeElement; return a && $("#main").contains(a) && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) && a.type !== "checkbox"; }
let deferred = false;
function softRender() { if (isEditing() || U.dragging) { deferred = true; return; } render(); }
document.addEventListener("focusout", () => setTimeout(() => { if (deferred && !isEditing()) { deferred = false; render(); } }, 0));
// Пока нажата кнопка мыши, перерисовку откладываем до конца клика, иначе клик «теряется».
let ptrDown = false, pendRender = false;
document.addEventListener("pointerdown", () => { ptrDown = true; }, true);
document.addEventListener("pointerup", () => { ptrDown = false; setTimeout(() => { if (pendRender) { pendRender = false; render(); } }, 0); }, true);
function requestRender() { if (ptrDown) { pendRender = true; return; } render(); }

/** предупреждение, если в таблице работает старая версия скрипта */
const scriptBanner = () => scriptVersion && scriptVersion < NEED_SCRIPT ? `<div class="panel warn"><b>Скрипт базы устарел, поэтому рецепты и продукты из таблицы не доходят до сайта.</b>
  <span>Обновите его один раз: Apps Script → вставьте новый код Code.gs → Ctrl+S → Deploy → Manage deployments → ✎ → Version: <b>New version</b> → Deploy. Потом здесь нажмите «Синхронизировать сейчас» в Настройках.</span></div>` : "";
const afterRender = [];
function render() {
  pendRender = false;
  document.querySelectorAll("#tabs button").forEach(b => b.setAttribute("aria-current", b.dataset.tab === U.tab ? "page" : "false"));
  const fn = VIEWS[U.tab] || VIEWS.timers;
  const y = window.scrollY;
  $("#main").innerHTML = `<div class="view">${fn()}</div>`;
  window.scrollTo(0, y);
  tipEl.hidden = true;
  paintSync();
  afterRender.forEach(f => f());
}
