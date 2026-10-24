"use strict";
/* Трекер: таймеры, трекер привычек, задачи, финансы, цели.
   Данные лежат в браузере (localStorage) и синхронизируются с Google-таблицей через Apps Script. */

// ---------- схема (совпадает с apps-script/Code.gs) ----------
const SCHEMA = {
  settings:   ["id","value","updated"],
  timers:     ["id","name","group","color","order","itemId","archived","runningSince","created","updated"],
  sessions:   ["id","timerId","date","start","end","minutes","updated"],
  sections:   ["id","name","order","total","updated"],
  items:      ["id","sectionId","name","type","options","role","order","from","to","updated"],
  entries:    ["id","date","itemId","value","updated"],
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
  tasks:      ["id","listId","title","notes","due","done","doneAt","starred","order","updated"],
};
const BOOLF = new Set(["total","archived","done","inTotal","starred"]);
const NUMF = new Set(["order","runningSince","created","updated","start","end","minutes","base","amount"]);
const PALETTE = ["#3a74d6","#e0782f","#2a9a6a","#c2417a","#7a5ad6","#b8921c","#2398ae","#d24e4e","#5b8a2f","#9a5b2e"];
const PAIR_MIN = 90; // 1 пара = 1,5 часа
const SKILL_CATS = ["необходимо","хочу","хочу, но вряд ли пригодится","слишком долгие что бы начать"];
const ITEM_TYPES = {check:"Галочка",pairs:"Пары (часы ÷ 1,5)",number:"Число",choice:"Выбор из списка",time:"Время",text:"Текст",computed:"Длительность сна (авто)"};

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
const WD = ["вс","пн","вт","ср","чт","пт","сб"];
const WDL = ["воскресенье","понедельник","вторник","среда","четверг","пятница","суббота"];
const human = k => { const [, m, d] = parts(k); return d + " " + MONTHS_G[m - 1] + ", " + WDL[dateOf(k).getDay()]; };
const short = k => { const [, m, d] = parts(k); return d + " " + MONTHS_G[m - 1]; };
const monthName = mk => { const [y, m] = mk.split("-").map(Number); return MONTHS[m - 1][0].toUpperCase() + MONTHS[m - 1].slice(1) + " " + y; };
const fmt = ms => { const s = Math.max(0, Math.floor(ms / 1000)); return Math.floor(s / 3600) + ":" + pad(Math.floor(s % 3600 / 60)) + ":" + pad(s % 60); };
const fmtH = ms => { const m = Math.floor(ms / 60000); if (m < 1) return ms > 0 ? "< 1 мин" : "0 мин"; const h = Math.floor(m / 60), r = m % 60; return h ? h + " ч" + (r ? " " + r + " мин" : "") : r + " мин"; };
const fnum = (x, d = 2) => (x == null || isNaN(x)) ? "" : Number(x).toLocaleString("ru-RU", {maximumFractionDigits: d});
const money = x => (x > 0 ? "+" : x < 0 ? "−" : "") + Math.abs(Math.round(x)).toLocaleString("ru-RU") + " ₽";
const toNum = v => { if (v === "" || v == null) return null; const n = Number(String(v).replace(",", ".").replace(/\s/g, "")); return isNaN(n) ? null : n; };
const byOrder = (a, b) => (a.order ?? 0) - (b.order ?? 0) || String(a.name || a.title || "").localeCompare(String(b.name || b.title || ""), "ru");
const hm2min = t => { const m = /^(\d{1,2}):(\d{2})$/.exec(t || ""); return m ? +m[1] * 60 + +m[2] : null; };
const min2hm = m => Math.floor(m / 60) + ":" + pad(Math.round(m % 60));
function toast(msg, ms = 3500) { const t = $("#toast"); t.textContent = msg; t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => t.hidden = true, ms); }

// ---------- хранилище ----------
const LSKEY = "tracker-v2", UIKEY = "tracker-ui";
let S = {cols: {}, outbox: [], cfg: {url: "", key: ""}, lastSync: 0, seq: 0};
let U = {tab: "timers", trView: "day", trDate: today(), trMonth: mkey(today()), tmDate: today(), finMonth: mkey(today()), goalMonth: mkey(today()), list: "", showDone: false, taskSort: "my"};

function load() {
  try { const v = JSON.parse(localStorage.getItem(LSKEY) || "null"); if (v && v.cols) S = Object.assign(S, v); } catch (e) {}
  try { Object.assign(U, JSON.parse(localStorage.getItem(UIKEY) || "{}")); } catch (e) {}
  for (const c in SCHEMA) S.cols[c] = S.cols[c] || {};
  U.trDate = U.trDate || today(); U.tmDate = today();
}
let saveT = null;
function save() { clearTimeout(saveT); saveT = setTimeout(saveNow, 200); }
function saveNow() {
  clearTimeout(saveT);
  try { localStorage.setItem(LSKEY, JSON.stringify(S)); } catch (e) { toast("Браузер не дал сохранить данные: " + e.message); }
}
function saveUI() { try { localStorage.setItem(UIKEY, JSON.stringify(U)); } catch (e) {} }
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
const all = c => Object.values(S.cols[c]);
const get = (c, id) => S.cols[c][id];
let hold = 0, pend = false;
function batch(fn) { hold++; try { fn(); } finally { hold--; if (!hold && pend) { pend = false; changed(); } } }
function queue(op) {
  const id = op.r ? op.r.id : op.id;
  S.outbox = S.outbox.filter(o => !(o.c === op.c && (o.r ? o.r.id : o.id) === id));
  op.seq = ++S.seq; S.outbox.push(op);
}
function put(c, r) { r = norm(Object.assign({}, r, {updated: Date.now()})); S.cols[c][r.id] = r; queue({c, op: "put", r}); changed(); return r; }
function patch(c, id, p) { const cur = get(c, id); if (cur) put(c, Object.assign({}, cur, p)); }
function del(c, id) { if (!S.cols[c][id]) return; delete S.cols[c][id]; queue({c, op: "del", id}); changed(); }
function changed() { if (hold) { pend = true; return; } save(); render(); scheduleSync(); }
function setting(id, def) { const r = get("settings", id); return r ? r.value : def; }

// ---------- синхронизация ----------
let syncing = false, syncT = null, syncState = "off", syncMsg = "";
function setSync(st, msg) {
  syncState = st || (S.cfg.url ? "ok" : "off"); syncMsg = msg || "";
  const el = $("#syncChip"); el.className = "sync " + syncState;
  const pending = S.outbox.length;
  el.querySelector("span").textContent =
    syncState === "off" ? "Не подключено" :
    syncState === "busy" ? "Синхронизация…" :
    syncState === "err" ? "Ошибка связи" + (pending ? " · " + pending + " в очереди" : "") :
    pending ? pending + " в очереди" : "Синхронизировано";
  el.title = syncMsg;
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
    if (!Array.isArray(data[c])) continue;
    const next = {};
    for (const r of data[c]) { const n = norm(r); if (n.id) next[n.id] = n; }
    const p = pending[c];
    if (p) for (const id of p) { if (S.cols[c][id]) next[id] = S.cols[c][id]; else delete next[id]; }
    S.cols[c] = next;
  }
  softRender();
}
function isEditing() { const a = document.activeElement; return a && $("#main").contains(a) && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) && a.type !== "checkbox"; }
let deferred = false;
function softRender() { if (isEditing()) { deferred = true; return; } render(); }
document.addEventListener("focusout", () => setTimeout(() => { if (deferred && !isEditing()) { deferred = false; render(); } }, 0));

// ---------- данные трекера ----------
const sections = () => all("sections").sort(byOrder);
const items = () => all("items").sort(byOrder);
const active = (it, k) => (!it.from || k >= it.from) && (!it.to || k <= it.to);
const entry = (k, itemId) => get("entries", k + "|" + itemId);
const val = (k, itemId) => { const e = entry(k, itemId); return e ? e.value : ""; };
function setVal(k, itemId, v) {
  const id = k + "|" + itemId;
  if (v === "" || v == null || v === false) del("entries", id);
  else put("entries", {id, date: k, itemId, value: v === true ? "TRUE" : String(v)});
}
function timerMinutes(k, timerIds, now = Date.now()) {
  let ms = 0;
  for (const s of all("sessions")) if (s.date === k && timerIds.has(s.timerId)) ms += (s.end - s.start);
  for (const id of timerIds) { const t = get("timers", id); if (t && t.runningSince) { const a = Math.max(t.runningSince, dayStart(k)), b = Math.min(now, dayEnd(k)); if (b > a) ms += b - a; } }
  return ms / 60000;
}
function autoPairs(k, itemId) {
  const ids = new Set(all("timers").filter(t => t.itemId === itemId).map(t => t.id));
  if (!ids.size) return 0;
  return Math.round(timerMinutes(k, ids) / PAIR_MIN * 10) / 10;
}
function pairsVal(k, it) { const v = toNum(val(k, it.id)); return v != null ? v : autoPairs(k, it.id); }
function sleepMin(k) {
  const bedIt = all("items").find(i => i.role === "bed"), wakeIt = all("items").find(i => i.role === "wake");
  if (!bedIt || !wakeIt) return null;
  const b = hm2min(val(k, bedIt.id)), w = hm2min(val(k, wakeIt.id));
  if (b == null || w == null) return null;
  let d = w - b; if (d < 0) d += 1440; return d;
}
const isOn = (k, id) => val(k, id) === "TRUE";

// ---------- таймеры ----------
const timersList = () => all("timers").filter(t => !t.archived).sort(byOrder);
const timerMode = () => setting("timerMode", "single");
function addSessions(t, s, e) {
  let cur = s;
  while (cur < e) {
    const k = dkey(new Date(cur)), end = Math.min(e, dayEnd(k));
    if (end - cur >= 1000) put("sessions", {id: uid(), timerId: t.id, date: k, start: cur, end, minutes: Math.round((end - cur) / 600) / 100});
    cur = end;
  }
}
function stopTimer(t, now) { if (!t.runningSince) return; addSessions(t, t.runningSince, now); patch("timers", t.id, {runningSince: null}); }
function toggleTimer(id) {
  const now = Date.now();
  batch(() => {
    const t = get("timers", id);
    if (t.runningSince) stopTimer(t, now);
    else {
      if (timerMode() === "single") for (const o of all("timers")) if (o.id !== id && o.runningSince) stopTimer(o, now);
      patch("timers", id, {runningSince: now});
    }
  });
}
function spentDay(k, now = Date.now()) {
  const m = {};
  for (const s of all("sessions")) if (s.date === k) m[s.timerId] = (m[s.timerId] || 0) + (s.end - s.start);
  for (const t of all("timers")) if (t.runningSince) { const a = Math.max(t.runningSince, dayStart(k)), b = Math.min(now, dayEnd(k)); if (b > a) m[t.id] = (m[t.id] || 0) + (b - a); }
  return m;
}
function segmentsDay(k, now = Date.now()) {
  const out = all("sessions").filter(s => s.date === k).map(s => ({t: s.timerId, s: s.start, e: s.end}));
  for (const t of all("timers")) if (t.runningSince) { const a = Math.max(t.runningSince, dayStart(k)), b = Math.min(now, dayEnd(k)); if (b > a) out.push({t: t.id, s: a, e: b}); }
  return out;
}
const anyRunning = () => all("timers").some(t => t.runningSince);

// ---------- отрисовка ----------
const VIEWS = {};
function render() {
  document.querySelectorAll("#tabs button").forEach(b => b.setAttribute("aria-current", b.dataset.tab === U.tab ? "page" : "false"));
  const fn = VIEWS[U.tab] || VIEWS.timers;
  const y = window.scrollY;
  $("#main").innerHTML = `<div class="view">${fn()}</div>`;
  window.scrollTo(0, y);
  setSyncChipOnly();
}
function setSyncChipOnly() {
  const el = $("#syncChip"); el.className = "sync " + syncState;
  const pending = S.outbox.length;
  el.querySelector("span").textContent = syncState === "off" ? "Не подключено" : syncState === "busy" ? "Синхронизация…" :
    syncState === "err" ? "Ошибка связи" : pending ? pending + " в очереди" : "Синхронизировано";
}
const dnav = (act, label, canNext = true) => `<div class="datenav"><button type="button" class="icon" data-act="${act}" data-n="-1" aria-label="Назад">‹</button><span class="d">${label}</span><button type="button" class="icon" data-act="${act}" data-n="1" aria-label="Вперёд" ${canNext ? "" : "disabled"}>›</button></div>`;
const opt = (v, label, sel) => `<option value="${esc(v)}" ${sel ? "selected" : ""}>${esc(label)}</option>`;

/* ===== Таймеры ===== */
VIEWS.timers = () => {
  const now = Date.now(), t0 = today(), sp = spentDay(t0, now), list = timersList();
  const pairsItems = items().filter(i => i.type === "pairs");
  const groups = [...new Set(list.map(t => t.group || ""))];
  const groupNames = [...new Set(all("timers").map(t => t.group).filter(Boolean))];
  const card = t => {
    const run = !!t.runningSince, link = t.itemId && get("items", t.itemId);
    const editing = U.editTimer === t.id;
    return `<article class="card${run ? " run" : ""}" style="--c:${t.color}">
      <div class="head"><span class="dot"></span><span class="name" title="${esc(t.name)}">${esc(t.name)}</span>
      <button type="button" class="icon" data-act="editTimer" data-id="${t.id}" aria-label="Настроить">⋯</button></div>
      <div class="time" data-live="${t.id}">${fmt(sp[t.id] || 0)}</div>
      <div class="foot"><span class="small muted">${run ? "идёт" : "на паузе"} · сегодня${link ? " · → " + esc(link.name) : ""}</span>
      <button type="button" class="go" data-act="toggleTimer" data-id="${t.id}">${run ? "Пауза" : "Старт"}</button></div>
      ${editing ? `<div class="edit">
        <label>Название<input type="text" data-chg="timer" data-id="${t.id}" data-f="name" value="${esc(t.name)}" maxlength="60"></label>
        <label>Группа (необязательно)<input type="text" list="tgroups" data-chg="timer" data-id="${t.id}" data-f="group" value="${esc(t.group)}" placeholder="например, Личное"></label>
        <label>Записывать время в строку трекера<select data-chg="timer" data-id="${t.id}" data-f="itemId">${opt("", "— не записывать —", !t.itemId)}${pairsItems.map(i => opt(i.id, (get("sections", i.sectionId)?.name || "") + " · " + i.name, t.itemId === i.id)).join("")}</select></label>
        <div class="row"><span class="muted">Цвет</span>${PALETTE.map(c => `<button type="button" class="dot" style="--c:${c};width:20px;height:20px;${c === t.color ? "outline:2px solid var(--fg);outline-offset:2px" : ""}" data-act="timerColor" data-id="${t.id}" data-c="${c}" aria-label="Цвет"></button>`).join("")}</div>
        <div class="row"><button type="button" class="btn btn-sm" data-act="moveTimer" data-id="${t.id}" data-n="-1">← Раньше</button><button type="button" class="btn btn-sm" data-act="moveTimer" data-id="${t.id}" data-n="1">Позже →</button>
        ${U.delTimer === t.id ? `<span>Удалить? Время в итогах останется.</span><button type="button" class="btn btn-sm btn-danger" data-act="delTimerYes" data-id="${t.id}">Удалить</button><button type="button" class="btn btn-sm" data-act="delTimerNo">Отмена</button>`
          : `<button type="button" class="btn btn-sm btn-danger" data-act="delTimer" data-id="${t.id}">Удалить</button>`}
        <button type="button" class="btn btn-sm" data-act="editTimer" data-id="">Готово</button></div></div>` : ""}
    </article>`;
  };
  const mode = timerMode();
  const blocks = groups.length > 1 || groups[0]
    ? groups.sort((a, b) => (a === "") - (b === "") || a.localeCompare(b, "ru")).map(g => {
        const ts = list.filter(t => (t.group || "") === g), tot = ts.reduce((a, t) => a + (sp[t.id] || 0), 0);
        return `<div class="grouphead"><h3>${esc(g || "Без группы")}</h3><span class="muted small num" data-livegroup="${esc(g)}">${fmt(tot)}</span></div><div class="tgrid">${ts.map(card).join("")}</div>`;
      }).join("")
    : `<div class="tgrid">${list.map(card).join("")}</div>`;
  return `
  <div class="bar"><h2>Таймеры</h2>
    <div class="row"><div class="seg" role="group" aria-label="Режим">
      <button type="button" data-act="mode" data-v="single" aria-pressed="${mode !== "multi"}" title="Запуск одного таймера ставит остальные на паузу">По одному</button>
      <button type="button" data-act="mode" data-v="multi" aria-pressed="${mode === "multi"}" title="Таймеры идут независимо">Параллельно</button></div>
      ${anyRunning() ? `<button type="button" class="btn" data-act="pauseAll">Пауза для всех</button>` : ""}</div></div>
  <form class="form" data-form="addTimer" autocomplete="off">
    <input type="text" name="name" placeholder="Новое дело, например «Курсовая»" maxlength="60" style="flex:1 1 220px" aria-label="Название">
    <input type="text" name="group" list="tgroups" placeholder="Группа (необязательно)" style="flex:0 1 200px" aria-label="Группа">
    <button class="btn btn-primary" type="submit">Добавить</button>
  </form>
  <datalist id="tgroups">${groupNames.map(g => opt(g, g)).join("")}</datalist>
  ${list.length ? blocks : `<div class="panel"><b>Пока нет таймеров.</b><span class="muted">Добавьте дело выше. В настройках таймера (⋯) его можно связать со строкой трекера, тогда часы будут попадать туда сами.</span></div>`}
  ${timerStats()}`;
};
function timerStats() {
  const now = Date.now(), k = U.tmDate, t0 = today(), sp = spentDay(k, now);
  const ids = Object.keys(sp).filter(id => sp[id] > 0).sort((a, b) => sp[b] - sp[a]);
  const total = ids.reduce((a, id) => a + sp[id], 0);
  const tm = id => get("timers", id) || {name: "Удалённый таймер", color: "#888"};
  const hmS = t => { const d = new Date(t); return pad(d.getHours()) + ":" + pad(d.getMinutes()); };
  let body;
  if (!ids.length) body = `<p class="empty">${k === t0 ? "Сегодня ещё ничего не засекали." : "В этот день ничего не засекали."}</p>`;
  else {
    const max = sp[ids[0]], d0 = dayStart(k), len = dayEnd(k) - d0, segs = segmentsDay(k, now);
    const groups = {}; ids.forEach(id => { const g = tm(id).group || ""; groups[g] = (groups[g] || 0) + sp[id]; });
    const gk = Object.keys(groups);
    body = `<div class="row" style="align-items:baseline;gap:4px 14px"><span class="num" style="font-size:28px;font-weight:600">${fmt(total)}</span><span class="muted">всего · ${fnum(total / 60000 / PAIR_MIN, 1)} пар</span>
      ${gk.length > 1 || gk[0] ? gk.map(g => `<span class="chip">${esc(g || "Без группы")}: ${fmtH(groups[g])}</span>`).join("") : ""}</div>
      <div class="rows">${ids.map(id => `<div class="srow"><span class="n"><span class="dot" style="--c:${tm(id).color}"></span><span>${esc(tm(id).name)}</span></span>
        <span class="num">${fmt(sp[id])}</span><span class="p num">${Math.round(sp[id] / total * 100)}%</span>
        <span class="sbar"><i style="width:${(sp[id] / max * 100).toFixed(2)}%;background:${tm(id).color}"></i></span></div>`).join("")}</div>
      <div><span class="label">Когда работал</span>
      <div class="tl" style="margin-top:6px">${segs.map(s => `<i title="${esc(tm(s.t).name)}: ${hmS(s.s)}–${hmS(s.e)}" style="left:${((s.s - d0) / len * 100).toFixed(3)}%;width:${((s.e - s.s) / len * 100).toFixed(3)}%;background:${tm(s.t).color}"></i>`).join("")}</div>
      <div class="ticks">${[0, 3, 6, 9, 12, 15, 18, 21, 24].map(h => `<span style="left:${h / 24 * 100}%">${pad(h)}</span>`).join("")}</div></div>`;
  }
  // неделя
  const keys = []; for (let i = 6; i >= 0; i--) keys.push(shift(k, -i));
  const data = keys.map(d => { const s = spentDay(d, now); const ids = Object.keys(s).filter(id => s[id] > 0).sort((a, b) => s[b] - s[a]); return {d, s, ids, total: ids.reduce((a, id) => a + s[id], 0)}; });
  const maxT = Math.max(...data.map(d => d.total)), hours = Math.max(1, Math.ceil(maxT / 3600000));
  const step = hours <= 4 ? 1 : hours <= 8 ? 2 : hours <= 12 ? 3 : Math.ceil(hours / 4), top = Math.ceil(hours / step) * step;
  const ticks = []; for (let h = 0; h <= top; h += step) ticks.push(h);
  const wt = data.reduce((a, d) => a + d.total, 0);
  return `<section class="panel"><div class="bar"><h2>Итоги дня</h2><div class="row">${dnav("tmDay", k === t0 ? "Сегодня" : human(k), k < t0)}${k !== t0 ? `<button type="button" class="btn btn-sm" data-act="tmToday">Сегодня</button>` : ""}</div></div>
    <div id="tmStats">${body}</div></section>
    <section class="panel"><div class="bar"><h2>7 дней</h2><span class="muted small">${wt ? "всего " + fmtH(wt) : ""}</span></div>
    <div class="week"><div class="yax">${ticks.map(h => `<span style="bottom:${h / top * 100}%">${h} ч</span>`).join("")}</div>
    <div class="plot">${ticks.slice(1).map(h => `<div class="gl" style="bottom:${h / top * 100}%"></div>`).join("")}
    <div class="cols">${data.map(d => `<div class="col${d.d === k ? " sel" : ""}" style="height:${(d.total / (top * 3600000) * 100).toFixed(2)}%">${d.ids.map(id => `<i style="height:${(d.s[id] / d.total * 100).toFixed(2)}%;background:${tm(id).color}" title="${esc(tm(id).name)}: ${fmtH(d.s[id])}"></i>`).join("")}</div>`).join("")}</div></div>
    <div class="xax">${data.map(d => `<button type="button" data-act="tmPick" data-d="${d.d}"><b>${WD[dateOf(d.d).getDay()]}</b>${parts(d.d)[2]}.${pad(parts(d.d)[1])}<br><span class="num">${d.total ? fmtH(d.total).replace(" мин", "м").replace(" ч", "ч") : "—"}</span></button>`).join("")}</div></div></section>`;
}

/* ===== Трекер ===== */
VIEWS.tracker = () => {
  const v = U.trView;
  const head = `<div class="bar"><h2>Трекер</h2><div class="seg" role="group" aria-label="Вид">
    <button type="button" data-act="trView" data-v="day" aria-pressed="${v === "day"}">День</button>
    <button type="button" data-act="trView" data-v="month" aria-pressed="${v === "month"}">Месяц</button>
    <button type="button" data-act="trView" data-v="setup" aria-pressed="${v === "setup"}">Строки</button></div></div>`;
  return head + (v === "month" ? trackerMonth() : v === "setup" ? trackerSetup() : trackerDay());
};
function control(k, it) {
  const v = val(k, it.id), a = `data-chg="entry" data-d="${k}" data-id="${it.id}"`;
  switch (it.type) {
    case "check": return `<input type="checkbox" ${a} ${v === "TRUE" ? "checked" : ""} aria-label="${esc(it.name)}">`;
    case "pairs": {
      const man = toNum(v), auto = autoPairs(k, it.id), shown = man != null ? man : auto;
      return `${man == null && auto > 0 ? `<span class="auto">авто</span>` : man != null && auto > 0 ? `<button type="button" class="auto" data-act="resetAuto" data-d="${k}" data-id="${it.id}" title="Вернуть значение из таймера (${fnum(auto, 1)})">таймер: ${fnum(auto, 1)} ↺</button>` : ""}
        <span class="step"><button type="button" data-act="pairs" data-d="${k}" data-id="${it.id}" data-n="-0.5" aria-label="Меньше">−</button><span>${shown ? fnum(shown, 1) : "—"}</span><button type="button" data-act="pairs" data-d="${k}" data-id="${it.id}" data-n="0.5" aria-label="Больше">+</button></span>`;
    }
    case "number": return `<input type="number" inputmode="decimal" step="any" ${a} value="${esc(v)}" aria-label="${esc(it.name)}">`;
    case "choice": return `<select ${a} aria-label="${esc(it.name)}">${opt("", "—", !v)}${String(it.options || "").split("|").filter(x => x !== "").map(o => opt(o, fnum(toNum(o), 3) || o, String(toNum(v)) === String(toNum(o)) && v !== "")).join("")}</select>`;
    case "time": return `<input type="time" ${a} value="${esc(v)}" aria-label="${esc(it.name)}">`;
    case "computed": { const m = sleepMin(k); return `<span class="num">${m == null ? "—" : min2hm(m)}</span>`; }
    default: return `<input type="text" ${a} value="${esc(v)}" style="width:12em" aria-label="${esc(it.name)}">`;
  }
}
function trackerDay() {
  const k = U.trDate, t0 = today(), its = items().filter(i => active(i, k));
  let pairsTotal = 0;
  const secs = sections().map(s => {
    const list = its.filter(i => i.sectionId === s.id);
    if (!list.length) return "";
    const tot = list.filter(i => i.type === "pairs").reduce((a, i) => a + pairsVal(k, i), 0);
    pairsTotal += tot;
    return `<section class="panel sec"><div class="sec-h"><h3>${esc(s.name)}</h3>${s.total ? `<span class="num">${fnum(tot, 1)} пар</span>` : ""}</div>
      ${list.map(i => `<div class="item"><span class="lbl">${esc(i.name)}</span><span class="ctl">${control(k, i)}</span></div>`).join("")}</section>`;
  }).join("");
  const orphan = its.filter(i => !get("sections", i.sectionId));
  return `<div class="bar">${dnav("trDay", k === t0 ? "Сегодня, " + short(k) : human(k))}${k !== t0 ? `<button type="button" class="btn btn-sm" data-act="trToday">Сегодня</button>` : ""}</div>
    <div class="grid2">${secs}${orphan.length ? `<section class="panel sec"><div class="sec-h"><h3>Без раздела</h3></div>${orphan.map(i => `<div class="item"><span class="lbl">${esc(i.name)}</span><span class="ctl">${control(k, i)}</span></div>`).join("")}</section>` : ""}</div>
    <section class="panel"><div class="sum"><span>Сумма пар</span><span class="num">${fnum(pairsTotal, 1)}</span></div><div class="sum"><span>Сумма часов</span><span class="num">${fnum(pairsTotal * 1.5, 1)}</span></div></section>`;
}
function cellText(k, it) {
  const v = val(k, it.id);
  switch (it.type) {
    case "check": return v === "TRUE" ? `<span class="on">✓</span>` : "";
    case "pairs": { const man = toNum(v); if (man != null) return fnum(man, 1); const a = autoPairs(k, it.id); return a ? `<span class="av">${fnum(a, 1)}</span>` : ""; }
    case "number": { const n = toNum(v); return n == null ? "" : n >= 10000 ? fnum(n / 1000, 1) + "к" : fnum(n, 2); }
    case "choice": { const n = toNum(v); return n == null ? esc(v) : fnum(n, 3); }
    case "time": return esc(v);
    case "computed": { const m = sleepMin(k); return m == null ? "" : min2hm(m); }
    default: return v ? `<span title="${esc(v)}">•</span>` : "";
  }
}
function aggText(days, it) {
  const ds = days.filter(d => active(it, d));
  switch (it.type) {
    case "check": { const n = ds.filter(d => isOn(d, it.id)).length; return n ? n + "/" + ds.length : ""; }
    case "pairs": { const s = ds.reduce((a, d) => a + pairsVal(d, it), 0); return s ? fnum(s, 1) : ""; }
    case "number": { const v = ds.map(d => toNum(val(d, it.id))).filter(x => x != null); return v.length ? "ср " + fnum(v.reduce((a, b) => a + b, 0) / v.length, 0) : ""; }
    case "computed": { const v = ds.map(sleepMin).filter(x => x != null); return v.length ? "ср " + min2hm(v.reduce((a, b) => a + b, 0) / v.length) : ""; }
    default: return "";
  }
}
function trackerMonth() {
  const mk = U.trMonth, days = monthDays(mk), t0 = today();
  const its = items().filter(i => days.some(d => active(i, d)));
  const th = days.map(d => { const wd = dateOf(d).getDay(); return `<th class="${wd === 0 || wd === 6 ? "we" : ""}${d === t0 ? " today" : ""}">${parts(d)[2]}<br>${WD[wd]}</th>`; }).join("");
  const rowFor = it => `<tr><td class="first" title="${esc(it.name)}">${esc(it.name)}</td>${days.map(d => {
    const wd = dateOf(d).getDay(), cls = "cell" + (wd === 0 || wd === 6 ? " we" : "") + (d === t0 ? " today" : "");
    return active(it, d) ? `<td class="${cls}" data-act="cell" data-d="${d}" data-id="${it.id}" data-t="${it.type}">${cellText(d, it)}</td>` : `<td class="${cls}"></td>`;
  }).join("")}<td class="agg">${aggText(days, it)}</td></tr>`;
  let body = "";
  const pairsTot = d => its.filter(i => i.type === "pairs" && active(i, d)).reduce((a, i) => a + pairsVal(d, i), 0);
  for (const s of sections()) {
    const list = its.filter(i => i.sectionId === s.id); if (!list.length) continue;
    body += `<tr class="sh"><td class="first">${esc(s.name)}</td><td colspan="${days.length + 1}"></td></tr>` + list.map(rowFor).join("");
    if (s.total) {
      const per = d => list.filter(i => i.type === "pairs" && active(i, d)).reduce((a, i) => a + pairsVal(d, i), 0);
      const tot = days.reduce((a, d) => a + per(d), 0);
      body += `<tr class="tot"><td class="first">Всего ${esc(s.name)}</td>${days.map(d => `<td class="num">${per(d) ? fnum(per(d), 1) : ""}</td>`).join("")}<td class="agg">${tot ? fnum(tot, 1) : ""}</td></tr>`;
    }
  }
  const orphans = its.filter(i => !get("sections", i.sectionId)); if (orphans.length) body += `<tr class="sh"><td class="first">Без раздела</td><td colspan="${days.length + 1}"></td></tr>` + orphans.map(rowFor).join("");
  const allP = days.reduce((a, d) => a + pairsTot(d), 0);
  body += `<tr class="sh"><td class="first">Итого</td><td colspan="${days.length + 1}"></td></tr>
    <tr class="tot"><td class="first">Сумма пар</td>${days.map(d => `<td class="num">${pairsTot(d) ? fnum(pairsTot(d), 1) : ""}</td>`).join("")}<td class="agg">${allP ? fnum(allP, 1) : ""}</td></tr>
    <tr class="tot"><td class="first">Сумма часов</td>${days.map(d => `<td class="num">${pairsTot(d) ? fnum(pairsTot(d) * 1.5, 1) : ""}</td>`).join("")}<td class="agg">${allP ? fnum(allP * 1.5, 1) : ""}</td></tr>`;
  return `<div class="bar">${dnav("trMonth", monthName(mk))}<span class="muted small">Галочки ставятся нажатием на клетку, остальное открывает день. <span class="av">Синим</span> — время из таймеров.</span></div>
    <div class="tbl-wrap"><table class="m"><thead><tr><th class="first">${monthName(mk)}</th>${th}<th>Итог</th></tr></thead><tbody>${body}</tbody></table></div>`;
}
function trackerSetup() {
  const timersBy = {}; all("timers").forEach(t => { if (t.itemId) (timersBy[t.itemId] = timersBy[t.itemId] || []).push(t.name); });
  const secs = sections();
  const itemRow = (i, list, idx) => `<div class="panel" style="padding:12px;gap:8px">
    <div class="row"><input type="text" data-chg="item" data-id="${i.id}" data-f="name" value="${esc(i.name)}" style="flex:1 1 200px" aria-label="Название">
      <select data-chg="item" data-id="${i.id}" data-f="type" aria-label="Тип">${Object.entries(ITEM_TYPES).map(([k, l]) => opt(k, l, i.type === k)).join("")}</select>
      <select data-chg="item" data-id="${i.id}" data-f="sectionId" aria-label="Раздел">${secs.map(s => opt(s.id, s.name, s.id === i.sectionId)).join("")}</select>
      <button type="button" class="icon" data-act="moveItem" data-id="${i.id}" data-n="-1" ${idx === 0 ? "disabled" : ""} aria-label="Выше">↑</button>
      <button type="button" class="icon" data-act="moveItem" data-id="${i.id}" data-n="1" ${idx === list.length - 1 ? "disabled" : ""} aria-label="Ниже">↓</button></div>
    <div class="row small">
      ${i.type === "choice" ? `<label class="row">Варианты через |<input type="text" data-chg="item" data-id="${i.id}" data-f="options" value="${esc(i.options)}" style="width:14em"></label>` : ""}
      ${i.type === "time" ? `<label class="row">Роль<select data-chg="item" data-id="${i.id}" data-f="role">${opt("", "—", !i.role)}${opt("bed", "Отбой (для сна)", i.role === "bed")}${opt("wake", "Подъём (для сна)", i.role === "wake")}</select></label>` : ""}
      <label class="row">С<input type="date" data-chg="item" data-id="${i.id}" data-f="from" value="${esc(i.from)}"></label>
      <label class="row">По<input type="date" data-chg="item" data-id="${i.id}" data-f="to" value="${esc(i.to)}"></label>
      ${i.type === "pairs" ? `<span class="muted">Таймеры: ${timersBy[i.id] ? esc(timersBy[i.id].join(", ")) : "нет (связь задаётся в настройках таймера)"}</span>` : ""}
      ${U.delItem === i.id ? `<span>Удалить строку? Записи останутся в таблице.</span><button type="button" class="btn btn-sm btn-danger" data-act="delItemYes" data-id="${i.id}">Удалить</button><button type="button" class="btn btn-sm" data-act="delItemNo">Отмена</button>`
        : `<button type="button" class="btn btn-sm" data-act="endItem" data-id="${i.id}" title="Строка перестанет показываться с завтрашнего дня, история сохранится">Закончить</button><button type="button" class="btn btn-sm btn-danger" data-act="delItem" data-id="${i.id}">Удалить</button>`}
    </div></div>`;
  return `<p class="muted small">Здесь настраиваются строки трекера. «Закончить» ставит дату окончания (как «КОНЕЦ» в таблице): строка пропадёт из новых дней, но останется в истории.</p>
    ${secs.map((s, si) => { const list = items().filter(i => i.sectionId === s.id); return `<section class="panel">
      <div class="row"><input type="text" data-chg="section" data-id="${s.id}" data-f="name" value="${esc(s.name)}" style="font-weight:600;flex:1 1 160px" aria-label="Раздел">
        <label class="row small"><input type="checkbox" data-chg="section" data-id="${s.id}" data-f="total" ${s.total ? "checked" : ""}> считать «Всего» по парам</label>
        <button type="button" class="icon" data-act="moveSection" data-id="${s.id}" data-n="-1" ${si === 0 ? "disabled" : ""} aria-label="Выше">↑</button>
        <button type="button" class="icon" data-act="moveSection" data-id="${s.id}" data-n="1" ${si === secs.length - 1 ? "disabled" : ""} aria-label="Ниже">↓</button>
        ${list.length ? "" : `<button type="button" class="btn btn-sm btn-danger" data-act="delSection" data-id="${s.id}">Удалить раздел</button>`}</div>
      ${list.map((i, idx) => itemRow(i, list, idx)).join("")}
      <form class="form" data-form="addItem" data-sec="${s.id}"><input type="text" name="name" placeholder="Новая строка" style="flex:1 1 200px" aria-label="Новая строка">
        <select name="type" aria-label="Тип">${Object.entries(ITEM_TYPES).map(([k, l]) => opt(k, l, k === "check")).join("")}</select><button class="btn" type="submit">Добавить</button></form>
    </section>`; }).join("")}
    <form class="form panel" data-form="addSection"><input type="text" name="name" placeholder="Новый раздел" style="flex:1" aria-label="Новый раздел"><button class="btn btn-primary" type="submit">Добавить раздел</button></form>`;
}

/* ===== Задачи ===== */
VIEWS.tasks = () => {
  const lists = all("lists").sort(byOrder);
  if (!lists.find(l => l.id === U.list)) U.list = lists[0]?.id || "";
  const cur = get("lists", U.list);
  const groups = [...new Set(lists.map(l => l.group || ""))].sort((a, b) => (a === "") - (b === "") || a.localeCompare(b, "ru"));
  const open = l => all("tasks").filter(t => t.listId === l.id && !t.done).length;
  const side = groups.map(g => `${g ? `<div class="g label">${esc(g)}</div>` : ""}${lists.filter(l => (l.group || "") === g).map(l => `<button type="button" class="l" data-act="pickList" data-id="${l.id}" aria-current="${l.id === U.list}"><span>${esc(l.name)}</span><span class="muted small">${open(l) || ""}</span></button>`).join("")}`).join("");
  const t0 = today();
  let main;
  if (!cur) main = `<section class="panel"><b>Списков пока нет.</b><span class="muted">Добавьте задачу, и появится список «Мои задачи». Свои списки с группами создаются в списке разделов.</span>
    <form class="form" data-form="addTask" autocomplete="off"><input type="text" name="title" placeholder="Добавить задачу" style="flex:1 1 220px" aria-label="Новая задача"><input type="date" name="due" aria-label="Срок"><button class="btn btn-primary" type="submit">Добавить</button></form></section>`;
  else {
    let ts = all("tasks").filter(t => t.listId === cur.id);
    const open = ts.filter(t => !t.done), done = ts.filter(t => t.done).sort((a, b) => (b.doneAt || "").localeCompare(a.doneAt || ""));
    if (U.taskSort === "due") open.sort((a, b) => (a.due || "9999").localeCompare(b.due || "9999") || byOrder(a, b));
    else open.sort((a, b) => (b.starred - a.starred) || byOrder(a, b));
    const row = t => {
      const ed = U.openTask === t.id;
      return `<div class="task${t.done ? " done" : ""}">
        <input type="checkbox" data-chg="taskDone" data-id="${t.id}" ${t.done ? "checked" : ""} aria-label="Выполнено" style="margin-top:2px">
        <div class="t" ${ed ? "" : `data-act="openTask" data-id="${t.id}"`}>
          ${ed ? `<div class="edit" style="border:0;padding:0">
            <input type="text" data-chg="task" data-id="${t.id}" data-f="title" value="${esc(t.title)}" aria-label="Задача">
            <textarea data-chg="task" data-id="${t.id}" data-f="notes" placeholder="Описание" aria-label="Описание">${esc(t.notes)}</textarea>
            <div class="row"><label class="row">Срок<input type="date" data-chg="task" data-id="${t.id}" data-f="due" value="${esc(t.due)}"></label>
            <label class="row">Список<select data-chg="task" data-id="${t.id}" data-f="listId">${lists.map(l => opt(l.id, l.name, l.id === t.listId)).join("")}</select></label></div>
            <div class="row"><button type="button" class="btn btn-sm" data-act="moveTask" data-id="${t.id}" data-n="-1">↑ Выше</button><button type="button" class="btn btn-sm" data-act="moveTask" data-id="${t.id}" data-n="1">↓ Ниже</button>
            <button type="button" class="btn btn-sm btn-danger" data-act="delTask" data-id="${t.id}">Удалить</button><button type="button" class="btn btn-sm" data-act="openTask" data-id="">Готово</button></div></div>`
          : `<div class="tt">${esc(t.title)}</div>${t.notes || t.due ? `<div class="meta">${t.due ? `<span class="${!t.done && t.due < t0 ? "over" : ""}">${t.due === t0 ? "сегодня" : short(t.due)}</span>` : ""}${t.notes ? `<span>${esc(t.notes.split("\n")[0].slice(0, 80))}</span>` : ""}</div>` : ""}`}
        </div>
        <button type="button" class="icon star${t.starred ? " on" : ""}" data-act="starTask" data-id="${t.id}" aria-label="Пометить">${t.starred ? "★" : "☆"}</button></div>`;
    };
    main = `<section class="panel">
      <div class="bar"><input type="text" data-chg="list" data-id="${cur.id}" data-f="name" value="${esc(cur.name)}" style="font-weight:600;font-size:17px;flex:1 1 180px" aria-label="Название списка">
        <input type="text" list="lgroups" data-chg="list" data-id="${cur.id}" data-f="group" value="${esc(cur.group)}" placeholder="Группа" style="width:10em" aria-label="Группа списка">
        <div class="seg"><button type="button" data-act="taskSort" data-v="my" aria-pressed="${U.taskSort !== "due"}">Мой порядок</button><button type="button" data-act="taskSort" data-v="due" aria-pressed="${U.taskSort === "due"}">По сроку</button></div>
        ${U.delList === cur.id ? `<span class="small">Удалить список и все его задачи?</span><button type="button" class="btn btn-sm btn-danger" data-act="delListYes" data-id="${cur.id}">Удалить</button><button type="button" class="btn btn-sm" data-act="delListNo">Отмена</button>` : `<button type="button" class="btn btn-sm btn-danger" data-act="delList" data-id="${cur.id}">Удалить список</button>`}</div>
      <form class="form" data-form="addTask" autocomplete="off"><input type="text" name="title" placeholder="Добавить задачу" style="flex:1 1 220px" aria-label="Новая задача"><input type="date" name="due" aria-label="Срок"><button class="btn btn-primary" type="submit">Добавить</button></form>
      <div>${open.length ? open.map(row).join("") : `<p class="empty">Задач нет.</p>`}</div>
      ${done.length ? `<button type="button" class="btn btn-sm" data-act="showDone">${U.showDone ? "Скрыть" : "Показать"} выполненные (${done.length})</button>${U.showDone ? `<div>${done.map(row).join("")}</div>` : ""}` : ""}
    </section>`;
  }
  const lgroups = [...new Set(lists.map(l => l.group).filter(Boolean))];
  const addList = `<form class="form" data-form="addList" autocomplete="off" style="margin-top:10px"><input type="text" name="name" placeholder="Новый список" style="flex:1 1 120px" aria-label="Новый список"><input type="text" name="group" list="lgroups" placeholder="Группа" style="flex:1 1 90px" aria-label="Группа"><button class="btn btn-sm" type="submit">+</button></form>`;
  return `<div class="bar"><h2>Задачи</h2></div><datalist id="lgroups">${lgroups.map(g => opt(g, g)).join("")}</datalist>
    <div class="listsel row"><select data-chg="pickList" aria-label="Список" style="flex:1">${lists.map(l => opt(l.id, (l.group ? l.group + " · " : "") + l.name, l.id === U.list)).join("")}</select></div>
    <div class="tasks"><aside><div class="lists">${side}</div>${addList}</aside>${main}</div>`;
};

/* ===== Финансы ===== */
const debtBalance = d => (d.base || 0) + all("debtOps").filter(o => o.debtId === d.id).reduce((a, o) => a + (o.amount || 0), 0);
VIEWS.finance = () => {
  const mk = U.finMonth, cats = all("finCats").sort(byOrder), catOf = id => get("finCats", id);
  const ops = all("finOps").filter(o => mkey(o.date) === mk).sort((a, b) => b.date.localeCompare(a.date) || (b.updated - a.updated));
  const inc = ops.filter(o => o.amount > 0).reduce((a, o) => a + o.amount, 0);
  const exp = ops.filter(o => o.amount < 0).reduce((a, o) => a + o.amount, 0);
  const mine = ops.filter(o => o.amount < 0 && catOf(o.catId)?.inTotal).reduce((a, o) => a + o.amount, 0);
  const debts = all("debts").filter(d => !d.archived).sort(byOrder);
  const dTot = debts.reduce((a, d) => a + debtBalance(d), 0);
  const activeCats = cats.filter(c => !c.archived), groups = [...new Set(activeCats.map(c => c.group))];
  const curCat = get("finCats", U.finCat) || activeCats[0];
  const sign = U.finSign ?? (curCat?.kind === "income" ? 1 : -1);
  // разбивка
  const byCat = {}; ops.forEach(o => byCat[o.catId] = (byCat[o.catId] || 0) + o.amount);
  const gsum = {}; Object.keys(byCat).forEach(id => { const g = catOf(id)?.group || "Без группы"; (gsum[g] = gsum[g] || []).push(id); });
  const breakdown = Object.keys(gsum).map(g => { const t = gsum[g].reduce((a, id) => a + byCat[id], 0); return `<span class="gname">${esc(g)} <span class="num ${t >= 0 ? "pos" : "neg"}">${money(t)}</span></span>${gsum[g].sort((a, b) => byCat[a] - byCat[b]).map(id => `<span>${esc(catOf(id)?.name || "?")}</span><span class="num ${byCat[id] >= 0 ? "pos" : "neg"}">${money(byCat[id])}</span>`).join("")}`; }).join("");
  // по дням
  let lastD = "", list = "";
  for (const o of ops) {
    if (o.date !== lastD) { lastD = o.date; const dt = ops.filter(x => x.date === o.date).reduce((a, x) => a + x.amount, 0); list += `<div class="day row" style="justify-content:space-between"><span>${human(o.date)}</span><span class="num muted">${money(dt)}</span></div>`; }
    list += `<div class="op"><span class="n">${esc(catOf(o.catId)?.name || "?")}${o.note ? ` <span class="muted small">· ${esc(o.note)}</span>` : ""}</span><span class="num ${o.amount >= 0 ? "pos" : "neg"}">${money(o.amount)}</span><button type="button" class="icon" data-act="delOp" data-id="${o.id}" aria-label="Удалить">×</button></div>`;
  }
  return `<div class="bar"><h2>Финансы</h2>${dnav("finMonth", monthName(mk))}</div>
  <div class="tiles">
    <div class="tile"><div class="label">Доходы</div><div class="v pos">${money(inc)}</div></div>
    <div class="tile"><div class="label">Все расходы</div><div class="v neg">${money(exp)}</div></div>
    <div class="tile"><div class="label">Мои расходы</div><div class="v neg">${money(mine)}</div><div class="small muted">категории с отметкой «в итоге»</div></div>
    <div class="tile"><div class="label">Баланс месяца</div><div class="v ${inc + exp >= 0 ? "pos" : "neg"}">${money(inc + exp)}</div></div>
    <div class="tile"><div class="label">Долги</div><div class="v ${dTot >= 0 ? "pos" : "neg"}">${money(dTot)}</div></div>
  </div>
  <section class="panel"><h3>Добавить операцию</h3>
    <form class="form" data-form="addOp" autocomplete="off">
      <input type="date" name="date" value="${today()}" aria-label="Дата">
      <select name="cat" data-chg="finCatPick" aria-label="Категория">${groups.map(g => `<optgroup label="${esc(g)}">${activeCats.filter(c => c.group === g).map(c => opt(c.id, c.name, curCat && c.id === curCat.id)).join("")}</optgroup>`).join("")}</select>
      <button type="button" class="btn ${sign > 0 ? "pos" : "neg"}" data-act="finSign" title="Поменять знак">${sign > 0 ? "+ доход" : "− расход"}</button>
      <input type="number" name="amount" inputmode="decimal" step="any" min="0" placeholder="Сумма" required aria-label="Сумма" style="width:8em">
      <input type="text" name="note" placeholder="Комментарий" style="flex:1 1 140px" aria-label="Комментарий">
      <button class="btn btn-primary" type="submit">Добавить</button>
    </form></section>
  <div class="grid2">
    <section class="panel"><h3>По категориям</h3>${breakdown ? `<div class="gcat">${breakdown}</div>` : `<p class="empty">В этом месяце операций нет.</p>`}</section>
    <section class="panel"><h3>Долги</h3>${debts.map(d => { const b = debtBalance(d), hist = all("debtOps").filter(o => o.debtId === d.id).sort((a, b) => b.date.localeCompare(a.date)); return `<div>
      <div class="li"><b>${esc(d.name)}</b><span class="num ${b >= 0 ? "pos" : "neg"}">${money(b)}</span></div>
      ${U.openDebt === d.id ? `<div class="edit"><span class="muted">Начальный долг: ${money(d.base || 0)}. Плюс уменьшает долг, минус увеличивает.</span>
        <form class="form" data-form="addDebtOp" data-id="${d.id}"><input type="date" name="date" value="${today()}" aria-label="Дата"><input type="number" name="amount" step="any" placeholder="+5000 или -2000" required style="width:10em" aria-label="Сумма"><input type="text" name="note" placeholder="Комментарий" style="flex:1 1 100px" aria-label="Комментарий"><button class="btn btn-sm btn-primary" type="submit">Добавить</button></form>
        ${hist.map(o => `<div class="li small"><span>${short(o.date)}${o.note ? " · " + esc(o.note) : ""}</span><span class="row"><span class="num ${o.amount >= 0 ? "pos" : "neg"}">${money(o.amount)}</span><button type="button" class="icon" data-act="delDebtOp" data-id="${o.id}" aria-label="Удалить">×</button></span></div>`).join("")}
        <div class="row"><button type="button" class="btn btn-sm" data-act="archDebt" data-id="${d.id}">Скрыть долг</button><button type="button" class="btn btn-sm" data-act="openDebt" data-id="">Готово</button></div></div>`
      : `<button type="button" class="btn btn-sm" data-act="openDebt" data-id="${d.id}">Операции</button>`}</div>`; }).join("")}
      <form class="form" data-form="addDebt"><input type="text" name="name" placeholder="Кому / кто" required style="flex:1 1 120px" aria-label="Имя"><input type="number" name="base" step="any" placeholder="Сумма (−, если я должен)" required style="width:13em" aria-label="Сумма"><button class="btn btn-sm" type="submit">Добавить долг</button></form>
    </section></div>
  <section class="panel"><h3>Операции за месяц</h3><div class="ops">${list || `<p class="empty">Пусто.</p>`}</div></section>
  <section class="panel"><div class="bar"><h3>Категории</h3><button type="button" class="btn btn-sm" data-act="toggle" data-k="showCats">${U.showCats ? "Свернуть" : "Изменить"}</button></div>
    ${U.showCats ? `${cats.map(c => `<div class="row small"><input type="text" data-chg="cat" data-id="${c.id}" data-f="group" value="${esc(c.group)}" style="width:9em" aria-label="Группа"><input type="text" data-chg="cat" data-id="${c.id}" data-f="name" value="${esc(c.name)}" style="flex:1 1 120px" aria-label="Название">
        <select data-chg="cat" data-id="${c.id}" data-f="kind" aria-label="Тип">${opt("expense", "расход", c.kind !== "income")}${opt("income", "доход", c.kind === "income")}</select>
        <label class="row"><input type="checkbox" data-chg="cat" data-id="${c.id}" data-f="inTotal" ${c.inTotal ? "checked" : ""}>в итоге</label>
        <label class="row"><input type="checkbox" data-chg="cat" data-id="${c.id}" data-f="archived" ${c.archived ? "checked" : ""}>скрыта</label></div>`).join("")}
      <form class="form" data-form="addCat"><input type="text" name="group" placeholder="Группа" style="width:9em" required aria-label="Группа"><input type="text" name="name" placeholder="Категория" required style="flex:1 1 120px" aria-label="Категория"><select name="kind" aria-label="Тип">${opt("expense", "расход", true)}${opt("income", "доход")}</select><button class="btn btn-sm" type="submit">Добавить</button></form>` : `<p class="muted small">${activeCats.length} категорий в ${groups.length} группах.</p>`}
  </section>`;
};

/* ===== Цели ===== */
function goalProgress(g) {
  const src = g.source || "";
  if (src.startsWith("count:")) { const id = src.slice(6); return monthDays(g.month).filter(d => isOn(d, id)).length; }
  if (src.startsWith("pairs:")) { const it = get("items", src.slice(6)); return it ? Math.round(monthDays(g.month).reduce((a, d) => a + pairsVal(d, it), 0) * 10) / 10 : 0; }
  if (src.startsWith("fin:")) { const ids = new Set(src.slice(4).split(",")); return all("finOps").filter(o => mkey(o.date) === g.month && ids.has(o.catId)).reduce((a, o) => a + o.amount, 0); }
  return g.progress;
}
// Как в условном форматировании таблицы: число сравнивается с числом из цели, любой текст = выполнено.
function goalOk(g, p) {
  if (g.done) return true;
  const digits = String(g.target).replace(/[^0-9]/g, "");
  const n = typeof p === "number" ? p : toNum(p);
  if (n != null && String(p).trim() !== "") return digits ? n >= Number(digits) : false;
  return String(p ?? "").trim() !== "";
}
VIEWS.goals = () => {
  const mk = U.goalMonth, gs = all("goals").filter(g => g.month === mk).sort(byOrder);
  const secs = [...new Set(gs.map(g => g.section || ""))];
  const its = items(), cats = all("finCats").sort(byOrder);
  const goalRow = g => {
    const p = goalProgress(g), ok = goalOk(g, p), auto = !!g.source, ed = U.editGoal === g.id;
    const srcType = (g.source || "").split(":")[0];
    return `<div class="goal${ok ? " ok" : ""}">
      <input type="checkbox" data-chg="goal" data-id="${g.id}" data-f="done" ${g.done ? "checked" : ""} aria-label="Выполнено">
      <div style="min-width:0"><div class="gn">${esc(g.name)}</div><div class="gt">${esc(g.target)}</div></div>
      <div class="row" style="justify-content:flex-end">${auto ? `<span class="gp" title="Считается автоматически">${typeof p === "number" ? (srcType === "fin" ? money(p) : fnum(p, 1)) : esc(p)}</span>` : `<input type="text" data-chg="goal" data-id="${g.id}" data-f="progress" value="${esc(g.progress)}" placeholder="прогресс" style="width:8em" aria-label="Прогресс">`}
        <button type="button" class="icon" data-act="editGoal" data-id="${ed ? "" : g.id}" aria-label="Настроить">⋯</button></div>
      ${ed ? `<div class="edit" style="grid-column:1/-1">
        <div class="row"><input type="text" data-chg="goal" data-id="${g.id}" data-f="name" value="${esc(g.name)}" style="flex:1 1 160px" aria-label="Название"><input type="text" data-chg="goal" data-id="${g.id}" data-f="target" value="${esc(g.target)}" style="flex:1 1 160px" placeholder="Цель" aria-label="Цель"><input type="text" list="gsecs" data-chg="goal" data-id="${g.id}" data-f="section" value="${esc(g.section)}" style="width:10em" placeholder="Раздел" aria-label="Раздел"></div>
        <label>Прогресс<select data-chg="goalSrcType" data-id="${g.id}">${opt("", "вручную", !srcType)}${opt("count", "дни с галочкой в строке трекера", srcType === "count")}${opt("pairs", "сумма пар по строке трекера", srcType === "pairs")}${opt("fin", "сумма по категориям финансов", srcType === "fin")}</select></label>
        ${srcType === "count" || srcType === "pairs" ? `<select data-chg="goalSrc" data-id="${g.id}" data-t="${srcType}">${its.filter(i => srcType === "count" ? i.type === "check" : i.type === "pairs").map(i => opt(i.id, i.name, g.source === srcType + ":" + i.id)).join("")}</select>` : ""}
        ${srcType === "fin" ? `<div class="row small">${cats.map(c => `<label class="row"><input type="checkbox" data-chg="goalFinCat" data-id="${g.id}" data-c="${c.id}" ${g.source.slice(4).split(",").includes(c.id) ? "checked" : ""}>${esc(c.name)}</label>`).join("")}</div>` : ""}
        <div class="row"><button type="button" class="btn btn-sm btn-danger" data-act="delGoal" data-id="${g.id}">Удалить цель</button><button type="button" class="btn btn-sm" data-act="editGoal" data-id="">Готово</button></div></div>` : ""}
    </div>`;
  };
  // недели месяца
  const days = monthDays(mk), weeks = [...new Set(days.map(weekStart))];
  const wItems = all("weekly").filter(w => !w.archived).sort(byOrder);
  const wDone = (w, i) => get("weeklyDone", w + "|" + i)?.done;
  const prevHas = all("goals").some(g => g.month === shiftMonth(mk, -1));
  const trig = all("triggers").sort(byOrder), sk = all("skills").sort(byOrder), wi = all("wishes").sort(byOrder);
  const persons = [...new Set(wi.map(w => w.person))];
  const doneCount = gs.filter(g => goalOk(g, goalProgress(g))).length;
  return `<div class="bar"><h2>Цели</h2>${dnav("goalMonth", monthName(mk))}</div>
  <datalist id="gsecs">${[...new Set(all("goals").map(g => g.section).filter(Boolean))].map(s => opt(s, s)).join("")}</datalist>
  <section class="panel"><div class="bar"><h3>Цели на месяц</h3><span class="chip ${doneCount && doneCount === gs.length ? "tag-good" : ""}">${doneCount} из ${gs.length}</span></div>
    ${gs.length ? secs.map(s => `<div><div class="label" style="margin-top:6px">${esc(s || "Без раздела")}</div>${gs.filter(g => (g.section || "") === s).map(goalRow).join("")}</div>`).join("")
      : `<p class="empty">Целей на этот месяц нет.${prevHas ? "" : ""}</p>${prevHas ? `<div><button type="button" class="btn" data-act="copyGoals">Скопировать цели с прошлого месяца</button></div>` : ""}`}
    <form class="form" data-form="addGoal" autocomplete="off"><input type="text" name="section" list="gsecs" placeholder="Раздел" style="width:9em" aria-label="Раздел"><input type="text" name="name" placeholder="Цель" required style="flex:1 1 140px" aria-label="Цель"><input type="text" name="target" placeholder="Сколько / что сделать" style="flex:1 1 140px" aria-label="Цель"><button class="btn btn-primary" type="submit">Добавить</button></form>
  </section>
  <section class="panel"><h3>Еженедельные дела</h3>
    <div style="overflow-x:auto"><table class="wk"><thead><tr><th></th>${weeks.map((w, i) => `<th>${i + 1} неделя<br><span class="muted small">${parts(w)[2]}.${pad(parts(w)[1])}–${parts(shift(w, 6))[2]}.${pad(parts(shift(w, 6))[1])}</span></th>`).join("")}<th></th></tr></thead>
    <tbody>${wItems.map(it => `<tr><td>${esc(it.name)}</td>${weeks.map(w => `<td class="${wDone(w, it.id) ? "ok" : ""}"><input type="checkbox" data-chg="weekly" data-w="${w}" data-id="${it.id}" ${wDone(w, it.id) ? "checked" : ""} aria-label="${esc(it.name)}"></td>`).join("")}<td><button type="button" class="icon" data-act="archWeekly" data-id="${it.id}" aria-label="Убрать" title="Убрать из списка">×</button></td></tr>`).join("")}</tbody></table></div>
    <form class="form" data-form="addWeekly"><input type="text" name="name" placeholder="Новое еженедельное дело" required style="flex:1" aria-label="Еженедельное дело"><button class="btn" type="submit">Добавить</button></form>
  </section>
  <div class="grid2">
    <section class="panel"><h3>Триггеры</h3><p class="muted small">Если случится одно — сделаю другое.</p>
      ${trig.map(t => `<div class="li${t.done ? " done" : ""}"><label class="row" style="flex:1"><input type="checkbox" data-chg="trig" data-id="${t.id}" ${t.done ? "checked" : ""}><span><b>${esc(t.trigger)}</b> → ${esc(t.action)}</span></label><button type="button" class="icon" data-act="delRec" data-c="triggers" data-id="${t.id}" aria-label="Удалить">×</button></div>`).join("") || `<p class="empty">Пусто.</p>`}
      <form class="form" data-form="addTrig"><input type="text" name="trigger" placeholder="Когда…" required style="flex:1 1 120px" aria-label="Триггер"><input type="text" name="action" placeholder="…то я" required style="flex:1 1 140px" aria-label="Действие"><button class="btn btn-sm" type="submit">Добавить</button></form></section>
    <section class="panel"><h3>Хотелки и подарки</h3>
      ${persons.map(p => `<div><div class="label">${esc(p)}</div>${wi.filter(w => w.person === p).map(w => `<div class="li${w.done ? " done" : ""}"><label class="row"><input type="checkbox" data-chg="wish" data-id="${w.id}" ${w.done ? "checked" : ""}><span>${esc(w.name)}</span></label><button type="button" class="icon" data-act="delRec" data-c="wishes" data-id="${w.id}" aria-label="Удалить">×</button></div>`).join("")}</div>`).join("") || `<p class="empty">Пусто.</p>`}
      <form class="form" data-form="addWish"><input type="text" name="person" list="wpersons" placeholder="Кому" required style="width:8em" aria-label="Кому"><input type="text" name="name" placeholder="Что" required style="flex:1 1 120px" aria-label="Что"><button class="btn btn-sm" type="submit">Добавить</button></form>
      <datalist id="wpersons">${persons.map(p => opt(p, p)).join("")}</datalist></section>
  </div>
  <section class="panel"><h3>Долгосрочные цели: навыки</h3>
    <div class="kanban">${SKILL_CATS.concat([...new Set(sk.map(s => s.category))].filter(c => !SKILL_CATS.includes(c))).map(c => `<div class="kcol"><div class="label">${esc(c)}</div>
      ${sk.filter(s => s.category === c).map(s => `<div class="li"><span>${esc(s.name)}</span><button type="button" class="icon" data-act="delRec" data-c="skills" data-id="${s.id}" aria-label="Удалить">×</button></div>`).join("")}
      <form class="form" data-form="addSkill" data-cat="${esc(c)}"><input type="text" name="name" placeholder="Навык" required style="flex:1;width:100%" aria-label="Навык"></form></div>`).join("")}</div>
  </section>`;
};

/* ===== Настройки ===== */
VIEWS.settings = () => {
  const counts = Object.keys(SCHEMA).map(c => [c, Object.keys(S.cols[c]).length]);
  return `<div class="bar"><h2>Настройки и база</h2></div>
  <section class="panel"><h3>Подключение к Google-таблице</h3>
    <p class="muted small">Адрес веб-приложения Apps Script и ключ из переменной SECRET в скрипте. Инструкция по установке есть в README репозитория.</p>
    <form class="form" data-form="cfg" autocomplete="off" style="flex-direction:column;align-items:stretch">
      <label class="row" style="flex-direction:column;align-items:stretch;gap:4px"><span class="label">Адрес скрипта</span><input type="url" name="url" value="${esc(S.cfg.url)}" placeholder="https://script.google.com/macros/s/…/exec"></label>
      <label class="row" style="flex-direction:column;align-items:stretch;gap:4px"><span class="label">Ключ</span><input type="password" name="key" value="${esc(S.cfg.key)}" placeholder="тот же, что в SECRET"></label>
      <div class="row"><button class="btn btn-primary" type="submit">Сохранить и синхронизировать</button>${S.cfg.url ? `<button type="button" class="btn" data-act="syncNow">Синхронизировать сейчас</button>` : ""}</div>
    </form>
    <div class="small"><span class="chip ${syncState === "ok" ? "tag-good" : ""}">${esc($("#syncChip span")?.textContent || "")}</span>
      ${S.lastSync ? ` <span class="muted">последняя синхронизация: ${new Date(S.lastSync).toLocaleString("ru-RU")}</span>` : ""}
      ${syncMsg ? `<div class="neg" style="margin-top:6px">${esc(syncMsg)}</div>` : ""}
      ${S.outbox.length ? `<div class="muted" style="margin-top:6px">Изменений ждут отправки: ${S.outbox.length}. Они хранятся в браузере и уйдут при следующей связи.</div>` : ""}</div>
  </section>
  <section class="panel"><h3>Резервная копия</h3>
    <p class="muted small">Файл со всеми данными. Его можно хранить у себя на ноутбуке и восстановить отсюда же. Таблица дополнительно копируется скриптом в Google Диск каждый день.</p>
    <div class="row"><button type="button" class="btn" data-act="exportJson">Скачать копию (.json)</button>
      <label class="btn" style="cursor:pointer">Восстановить из файла<input type="file" accept=".json,application/json" data-chg="importJson" hidden></label></div>
    <details><summary class="muted small">Что хранится</summary><div class="small muted" style="margin-top:6px">${counts.map(([c, n]) => `${c}: ${n}`).join(" · ")}</div></details>
  </section>`;
};

// ---------- действия ----------
const ACT = {
  tab: el => { U.tab = el.dataset.tab; saveUI(); history.replaceState(null, "", "#" + U.tab); render(); window.scrollTo(0, 0); },
  mode: el => put("settings", {id: "timerMode", value: el.dataset.v}) && setMode(el.dataset.v),
  pauseAll: () => { const now = Date.now(); batch(() => all("timers").forEach(t => stopTimer(t, now))); },
  toggleTimer: el => toggleTimer(el.dataset.id),
  editTimer: el => { U.editTimer = el.dataset.id; U.delTimer = null; render(); },
  timerColor: el => patch("timers", el.dataset.id, {color: el.dataset.c}),
  moveTimer: el => moveIn("timers", timersList(), el.dataset.id, +el.dataset.n),
  delTimer: el => { U.delTimer = el.dataset.id; render(); },
  delTimerNo: () => { U.delTimer = null; render(); },
  delTimerYes: el => { const t = get("timers", el.dataset.id); batch(() => { stopTimer(t, Date.now()); patch("timers", t.id, {archived: true}); }); U.editTimer = null; },
  tmDay: el => { const n = U.tmDate > today() ? 0 : +el.dataset.n; U.tmDate = shift(U.tmDate, n); if (U.tmDate > today()) U.tmDate = today(); render(); },
  tmToday: () => { U.tmDate = today(); render(); },
  tmPick: el => { U.tmDate = el.dataset.d; render(); },
  trView: el => { U.trView = el.dataset.v; saveUI(); render(); },
  trDay: el => { U.trDate = shift(U.trDate, +el.dataset.n); saveUI(); render(); },
  trToday: () => { U.trDate = today(); saveUI(); render(); },
  trMonth: el => { U.trMonth = shiftMonth(U.trMonth, +el.dataset.n); saveUI(); render(); },
  cell: el => {
    const {d, id, t} = el.dataset;
    if (t === "check") setVal(d, id, isOn(d, id) ? "" : "TRUE");
    else if (t !== "computed") { U.trDate = d; U.trView = "day"; saveUI(); render(); window.scrollTo(0, 0); }
  },
  pairs: el => { const {d, id} = el.dataset, it = get("items", id); const v = Math.max(0, Math.round((pairsVal(d, it) + +el.dataset.n) * 2) / 2); setVal(d, id, v ? String(v) : (autoPairs(d, id) ? "0" : "")); },
  resetAuto: el => setVal(el.dataset.d, el.dataset.id, ""),
  moveItem: el => { const it = get("items", el.dataset.id); moveIn("items", items().filter(i => i.sectionId === it.sectionId), it.id, +el.dataset.n); },
  moveSection: el => moveIn("sections", sections(), el.dataset.id, +el.dataset.n),
  endItem: el => patch("items", el.dataset.id, {to: today()}),
  delItem: el => { U.delItem = el.dataset.id; render(); },
  delItemNo: () => { U.delItem = null; render(); },
  delItemYes: el => { U.delItem = null; del("items", el.dataset.id); },
  delSection: el => del("sections", el.dataset.id),
  pickList: el => { U.list = el.dataset.id; U.openTask = null; saveUI(); render(); },
  openTask: el => { U.openTask = el.dataset.id || null; render(); if (U.openTask) setTimeout(() => $(`[data-chg=task][data-id="${U.openTask}"][data-f=title]`)?.focus(), 0); },
  starTask: el => { const t = get("tasks", el.dataset.id); patch("tasks", t.id, {starred: !t.starred}); },
  moveTask: el => { const t = get("tasks", el.dataset.id); moveIn("tasks", all("tasks").filter(x => x.listId === t.listId && !x.done).sort((a, b) => (b.starred - a.starred) || byOrder(a, b)), t.id, +el.dataset.n); },
  delTask: el => { U.openTask = null; del("tasks", el.dataset.id); },
  taskSort: el => { U.taskSort = el.dataset.v; saveUI(); render(); },
  showDone: () => { U.showDone = !U.showDone; saveUI(); render(); },
  delList: el => { U.delList = el.dataset.id; render(); },
  delListNo: () => { U.delList = null; render(); },
  delListYes: el => { const id = el.dataset.id; U.delList = null; batch(() => { all("tasks").filter(t => t.listId === id).forEach(t => del("tasks", t.id)); del("lists", id); }); },
  finMonth: el => { U.finMonth = shiftMonth(U.finMonth, +el.dataset.n); saveUI(); render(); },
  finSign: () => { const c = get("finCats", U.finCat) || all("finCats").filter(c => !c.archived).sort(byOrder)[0]; const cur = U.finSign ?? (c?.kind === "income" ? 1 : -1); U.finSign = -cur; render(); },
  delOp: el => del("finOps", el.dataset.id),
  openDebt: el => { U.openDebt = el.dataset.id || null; render(); },
  delDebtOp: el => del("debtOps", el.dataset.id),
  archDebt: el => { U.openDebt = null; patch("debts", el.dataset.id, {archived: true}); },
  toggle: el => { U[el.dataset.k] = !U[el.dataset.k]; render(); },
  goalMonth: el => { U.goalMonth = shiftMonth(U.goalMonth, +el.dataset.n); saveUI(); render(); },
  editGoal: el => { U.editGoal = el.dataset.id || null; render(); },
  delGoal: el => { U.editGoal = null; del("goals", el.dataset.id); },
  copyGoals: () => { const prev = shiftMonth(U.goalMonth, -1); batch(() => all("goals").filter(g => g.month === prev).forEach(g => put("goals", Object.assign({}, g, {id: uid(), month: U.goalMonth, progress: "", done: false})))); },
  archWeekly: el => patch("weekly", el.dataset.id, {archived: true}),
  delRec: el => del(el.dataset.c, el.dataset.id),
  syncNow: () => sync(true),
  exportJson: () => {
    const data = {}; for (const c in SCHEMA) data[c] = all(c);
    const blob = new Blob([JSON.stringify({app: "tracker", version: 2, exported: new Date().toISOString(), data}, null, 1)], {type: "application/json"});
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "tracker-backup-" + today() + ".json"; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  },
};
function setMode(m) {
  if (m !== "single") return;
  const run = all("timers").filter(t => t.runningSince).sort((a, b) => b.runningSince - a.runningSince);
  if (run.length > 1) { const now = Date.now(); batch(() => run.slice(1).forEach(t => stopTimer(t, now))); }
}
function moveIn(c, list, id, n) {
  const i = list.findIndex(x => x.id === id), j = i + n;
  if (i < 0 || j < 0 || j >= list.length) return;
  const arr = list.slice(); [arr[i], arr[j]] = [arr[j], arr[i]];
  batch(() => arr.forEach((x, k) => { if (x.order !== k) patch(c, x.id, {order: k}); }));
}
const fv = (f, n) => (f.elements.namedItem(n)?.value ?? "");
const nextOrder = list => list.reduce((m, x) => Math.max(m, x.order ?? 0), -1) + 1;

const CHG = {
  timer: el => { const f = el.dataset.f; patch("timers", el.dataset.id, {[f]: el.value.trim()}); },
  entry: el => {
    const it = get("items", el.dataset.id);
    let v = el.type === "checkbox" ? (el.checked ? "TRUE" : "") : el.value.trim();
    if (it && (it.type === "number" || it.type === "choice") && v !== "") { const n = toNum(v); v = n == null ? v : String(n); }
    setVal(el.dataset.d, el.dataset.id, v);
  },
  item: el => { const f = el.dataset.f; patch("items", el.dataset.id, {[f]: el.value.trim()}); },
  section: el => { const f = el.dataset.f; patch("sections", el.dataset.id, {[f]: el.type === "checkbox" ? el.checked : el.value.trim()}); },
  pickList: el => { U.list = el.value; saveUI(); render(); },
  list: el => patch("lists", el.dataset.id, {[el.dataset.f]: el.value.trim()}),
  task: el => patch("tasks", el.dataset.id, {[el.dataset.f]: el.dataset.f === "notes" ? el.value : el.value.trim()}),
  taskDone: el => patch("tasks", el.dataset.id, {done: el.checked, doneAt: el.checked ? new Date().toISOString() : ""}),
  finCatPick: el => { U.finCat = el.value; U.finSign = null; const keep = $("[data-form=addOp]") ? Object.fromEntries(new FormData($("[data-form=addOp]"))) : {}; render(); const f = $("[data-form=addOp]"); if (f) { f.elements.date.value = keep.date || today(); f.elements.amount.value = keep.amount || ""; f.elements.note.value = keep.note || ""; } },
  cat: el => patch("finCats", el.dataset.id, {[el.dataset.f]: el.type === "checkbox" ? el.checked : el.value.trim()}),
  goal: el => patch("goals", el.dataset.id, {[el.dataset.f]: el.type === "checkbox" ? el.checked : el.value.trim()}),
  goalSrcType: el => {
    const t = el.value, g = get("goals", el.dataset.id);
    const first = t === "count" ? items().find(i => i.type === "check") : t === "pairs" ? items().find(i => i.type === "pairs") : null;
    patch("goals", g.id, {source: !t ? "" : t === "fin" ? "fin:" : t + ":" + (first?.id || "")});
  },
  goalSrc: el => patch("goals", el.dataset.id, {source: el.dataset.t + ":" + el.value}),
  goalFinCat: el => { const g = get("goals", el.dataset.id); const ids = new Set(g.source.slice(4).split(",").filter(Boolean)); el.checked ? ids.add(el.dataset.c) : ids.delete(el.dataset.c); patch("goals", g.id, {source: "fin:" + [...ids].join(",")}); },
  weekly: el => { const id = el.dataset.w + "|" + el.dataset.id; el.checked ? put("weeklyDone", {id, week: el.dataset.w, itemId: el.dataset.id, done: true}) : del("weeklyDone", id); },
  trig: el => patch("triggers", el.dataset.id, {done: el.checked}),
  wish: el => patch("wishes", el.dataset.id, {done: el.checked}),
  importJson: el => {
    const f = el.files[0]; if (!f) return;
    f.text().then(txt => {
      const j = JSON.parse(txt); if (!j || !j.data) throw new Error("Это не файл резервной копии трекера.");
      batch(() => { for (const c in SCHEMA) if (Array.isArray(j.data[c])) for (const r of j.data[c]) if (r && r.id) put(c, r); });
      toast("Данные восстановлены из файла");
    }).catch(e => toast("Не удалось прочитать файл: " + e.message, 6000));
  },
};

const FORM = {
  addTimer: f => {
    const name = fv(f, "name").trim(); if (!name) return;
    const used = new Set(timersList().map(t => t.color));
    put("timers", {id: uid(), name, group: fv(f, "group").trim(), color: PALETTE.find(c => !used.has(c)) || PALETTE[all("timers").length % PALETTE.length], order: nextOrder(all("timers")), itemId: "", archived: false, runningSince: null, created: Date.now()});
  },
  addItem: f => { const name = fv(f, "name").trim(); if (!name) return; const sec = f.dataset.sec; put("items", {id: uid(), sectionId: sec, name, type: fv(f, "type"), options: fv(f, "type") === "choice" ? "0|1|2|3" : "", role: "", order: nextOrder(all("items")), from: today(), to: ""}); },
  addSection: f => { const name = fv(f, "name").trim(); if (name) put("sections", {id: uid(), name, order: nextOrder(all("sections")), total: false}); },
  addList: f => { const name = fv(f, "name").trim(); if (!name) return; const r = put("lists", {id: uid(), name, group: fv(f, "group").trim(), order: nextOrder(all("lists"))}); U.list = r.id; saveUI(); render(); },
  addTask: f => {
    const title = fv(f, "title").trim(); if (!title) return;
    let listId = U.list;
    if (!get("lists", listId)) { listId = put("lists", {id: uid(), name: "Мои задачи", group: "", order: 0}).id; U.list = listId; }
    const min = all("tasks").filter(t => t.listId === listId).reduce((m, t) => Math.min(m, t.order ?? 0), 0);
    put("tasks", {id: uid(), listId, title, notes: "", due: fv(f, "due"), done: false, doneAt: "", starred: false, order: min - 1});
    setTimeout(() => $("[data-form=addTask] [name=title]")?.focus(), 0);
  },
  addOp: f => {
    const amt = toNum(fv(f, "amount")); if (!amt) return toast("Введите сумму");
    const c = get("finCats", fv(f, "cat")); const sign = U.finSign ?? (c?.kind === "income" ? 1 : -1);
    U.finCat = fv(f, "cat");
    put("finOps", {id: uid(), date: fv(f, "date") || today(), catId: fv(f, "cat"), amount: sign * Math.abs(amt), note: fv(f, "note").trim()});
    toast("Добавлено: " + (c?.name || "") + " " + money(sign * Math.abs(amt)));
  },
  addDebtOp: f => { const a = toNum(fv(f, "amount")); if (a == null) return; put("debtOps", {id: uid(), debtId: f.dataset.id, date: fv(f, "date") || today(), amount: a, note: fv(f, "note").trim()}); },
  addDebt: f => { const b = toNum(fv(f, "base")); put("debts", {id: uid(), name: fv(f, "name").trim(), base: b || 0, order: nextOrder(all("debts")), archived: false}); },
  addCat: f => put("finCats", {id: uid(), group: fv(f, "group").trim(), name: fv(f, "name").trim(), kind: fv(f, "kind"), inTotal: fv(f, "kind") !== "income", order: nextOrder(all("finCats")), archived: false}),
  addGoal: f => put("goals", {id: uid(), month: U.goalMonth, section: fv(f, "section").trim(), name: fv(f, "name").trim(), target: fv(f, "target").trim(), progress: "", source: "", done: false, order: nextOrder(all("goals"))}),
  addWeekly: f => put("weekly", {id: uid(), name: fv(f, "name").trim(), order: nextOrder(all("weekly")), archived: false}),
  addTrig: f => put("triggers", {id: uid(), trigger: fv(f, "trigger").trim(), action: fv(f, "action").trim(), done: false, order: nextOrder(all("triggers"))}),
  addWish: f => put("wishes", {id: uid(), person: fv(f, "person").trim(), name: fv(f, "name").trim(), done: false, order: nextOrder(all("wishes"))}),
  addSkill: f => { const n = fv(f, "name").trim(); if (n) put("skills", {id: uid(), category: f.dataset.cat, name: n, order: nextOrder(all("skills"))}); },
  cfg: f => {
    const url = fv(f, "url").trim(), key = fv(f, "key").trim();
    if (url && !/^https:\/\/script\.google(usercontent)?\.com\//.test(url)) return toast("Адрес должен начинаться с https://script.google.com/", 5000);
    S.cfg = {url, key}; saveNow();
    if (url && key) sync(true); else { setSync("off"); render(); }
  },
};

document.addEventListener("click", e => {
  const el = e.target.closest("[data-act]"); if (!el || el.disabled) return;
  const fn = ACT[el.dataset.act]; if (fn) { e.preventDefault(); fn(el, e); }
});
document.addEventListener("change", e => {
  const el = e.target.closest("[data-chg]"); if (!el) return;
  const fn = CHG[el.dataset.chg]; if (fn) fn(el, e);
});
document.addEventListener("submit", e => {
  const f = e.target.closest("[data-form]"); if (!f) return;
  e.preventDefault(); const fn = FORM[f.dataset.form]; if (fn) fn(f);
});
document.addEventListener("keydown", e => {
  if (e.key === "Enter" && e.target.matches("input[data-chg]") && e.target.type !== "checkbox") e.target.blur();
});

// ---------- тик ----------
function tick() {
  if (tick.day && tick.day !== today()) { tick.day = today(); U.tmDate = today(); render(); return; }
  tick.day = today();
  if (!anyRunning()) return;
  if (U.tab === "timers") {
    const sp = spentDay(today());
    document.querySelectorAll("[data-live]").forEach(el => el.textContent = fmt(sp[el.dataset.live] || 0));
    document.querySelectorAll("[data-livegroup]").forEach(el => { const g = el.dataset.livegroup; el.textContent = fmt(timersList().filter(t => (t.group || "") === g).reduce((a, t) => a + (sp[t.id] || 0), 0)); });
    if (Date.now() % 10000 < 1000 && !isEditing()) { const box = $("#tmStats"); if (box && U.tmDate === today()) render(); }
  } else if ((U.tab === "tracker") && Date.now() % 60000 < 1000) softRender();
}

// ---------- перенос старых данных (первая версия сайта) ----------
function migrateV1() {
  if (localStorage.getItem("tracker-v1-migrated")) return;
  try {
    const v = JSON.parse(localStorage.getItem("timers-v1") || "null");
    if (v && v.state && v.state.timers && v.state.timers.length) {
      batch(() => {
        v.state.timers.forEach((t, i) => put("timers", {id: t.id, name: t.name, group: "", color: t.color, order: i, itemId: "", archived: !!t.deleted, runningSince: t.runningSince || null, created: t.created || Date.now()}));
        for (const k in v.days || {}) (v.days[k].sessions || []).forEach(s => put("sessions", {id: uid(), timerId: s.t, date: k, start: s.s, end: s.e, minutes: Math.round((s.e - s.s) / 600) / 100}));
        if (v.state.mode) put("settings", {id: "timerMode", value: v.state.mode});
      });
    }
  } catch (e) {}
  try { localStorage.setItem("tracker-v1-migrated", "1"); } catch (e) {}
}

// ---------- старт ----------
load();
const h = location.hash.slice(1); if (VIEWS[h]) U.tab = h;
migrateV1();
render();
setSync(S.cfg.url ? "ok" : "off");
if (S.cfg.url) sync();
setInterval(tick, 1000);
setInterval(() => { if (document.visibilityState === "visible") sync(); }, 60000);
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") sync(); });
window.addEventListener("online", () => sync());
window.addEventListener("hashchange", () => { const t = location.hash.slice(1); if (VIEWS[t] && t !== U.tab) { U.tab = t; render(); } });
if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("sw.js").catch(() => {});
