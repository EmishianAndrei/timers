"use strict";
/* Таймеры: секундомер и обратный отсчёт (45/60/90 мин), сессии, итоги дня и 7 дней. */

const timersList = () => all("timers").filter(t => !t.archived).sort(byOrder);
const timerMode = () => setting("timerMode", "single");          // по одному / параллельно
/** быстрые таймеры (минуты), общие для всех карточек; меняются в настройках карточки (⋯) */
const cdPresets = () => String(setting("cdPresets", "5,15,45,60,90")).split(/[\s,;]+/).map(Number).filter(n => n > 0 && n <= 1440).slice(0, 8);
const presetLabel = m => m < 60 ? m + "м" : Math.floor(m / 60) + "ч" + (m % 60 ? pad(m % 60) : "");

function addSessions(t, s, e) {
  let cur = s;
  while (cur < e) {
    const k = dkey(new Date(cur)), end = Math.min(e, dayEnd(k));
    if (end - cur >= 1000) put("sessions", {id: uid(), timerId: t.id, date: k, start: cur, end, minutes: Math.round((end - cur) / 600) / 100});
    cur = end;
  }
}
function stopTimer(t, now) {
  if (!t.runningSince) return;
  addSessions(t, t.runningSince, now);
  const p = {runningSince: null};
  if (t.cdMin) p.cdAcc = (t.cdAcc || 0) + (now - t.runningSince);
  patch("timers", t.id, p);
}
/** how: "sw" — секундомер, число — новый отсчёт на столько минут, "resume" — продолжить текущий отсчёт */
function startTimer(t, now, how) {
  const p = {runningSince: now};
  if (typeof how === "number") Object.assign(p, {cdMin: how, cdAcc: 0, cdRang: false});
  else if (how !== "resume") Object.assign(p, {cdMin: null, cdAcc: null, cdRang: false});
  patch("timers", t.id, p);
}
function toggleTimer(id, how = "sw") {
  const now = Date.now();
  if (how !== "sw") { ensureAudio(); askNotify(); }
  batch(() => {
    const t = get("timers", id);
    if (t.runningSince) stopTimer(t, now);
    else {
      if (timerMode() === "single") for (const o of all("timers")) if (o.id !== id && o.runningSince) stopTimer(o, now);
      startTimer(get("timers", id), now, how);
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
/** минуты таймеров за день (для строк трекера) */
function timerMinutes(k, timerIds, now = Date.now()) {
  let ms = 0;
  for (const s of all("sessions")) if (s.date === k && timerIds.has(s.timerId)) ms += (s.end - s.start);
  for (const id of timerIds) { const t = get("timers", id); if (t && t.runningSince) { const a = Math.max(t.runningSince, dayStart(k)), b = Math.min(now, dayEnd(k)); if (b > a) ms += b - a; } }
  return ms / 60000;
}

// ---------- обратный отсчёт ----------
const cdRemaining = (t, now = Date.now()) => t.cdMin ? t.cdMin * 60000 - (t.cdAcc || 0) - (t.runningSince ? now - t.runningSince : 0) : null;
const fmtCd = ms => { const s = Math.floor(Math.abs(ms) / 1000), h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60); return (h ? h + ":" + pad(m) : m) + ":" + pad(s % 60); };
let audioCtx = null;
function ensureAudio() { try { audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)(); if (audioCtx.state === "suspended") audioCtx.resume(); } catch (e) {} }
function askNotify() { try { if ("Notification" in window && Notification.permission === "default") Notification.requestPermission(); } catch (e) {} }
function beep() {
  if (!audioCtx) return;
  const t0 = audioCtx.currentTime;
  for (let i = 0; i < 3; i++) {
    const o = audioCtx.createOscillator(), g = audioCtx.createGain(), t = t0 + i * 0.45;
    o.frequency.value = 880; o.connect(g); g.connect(audioCtx.destination);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.35, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
    o.start(t); o.stop(t + 0.37);
  }
}
function ring(id) {
  const t = get("timers", id); if (!t || !t.cdMin || t.cdRang) return;
  beep();
  try { if ("Notification" in window && Notification.permission === "granted") new Notification("Время вышло: " + t.name, {body: t.cdMin + " мин прошло. Таймер считает дальше.", icon: "icon-192.png", tag: "cd-" + t.id}); } catch (e) {}
  toast("⏰ " + t.name + ": " + t.cdMin + " мин прошло", 8000);
  patch("timers", t.id, {cdRang: true});
}
const ringT = {};
function scheduleRings() {
  for (const k in ringT) { clearTimeout(ringT[k]); delete ringT[k]; }
  const now = Date.now();
  for (const t of all("timers")) {
    if (!t.runningSince || !t.cdMin || t.cdRang) continue;
    const r = cdRemaining(t, now);
    ringT[t.id] = setTimeout(() => ring(t.id), Math.max(0, r) + 30);
  }
}
afterRender.push(scheduleRings);

// ---------- вид ----------
VIEWS.timers = () => {
  const now = Date.now(), sp = spentDay(today(), now), list = timersList();
  const durItems = items().filter(i => i.type === "duration");
  const groups = [...new Set(list.map(t => t.group || ""))];
  const groupNames = [...new Set(all("timers").map(t => t.group).filter(Boolean))];
  const card = t => {
    const run = !!t.runningSince, link = t.itemId && get("items", t.itemId), editing = U.editTimer === t.id;
    const rem = cdRemaining(t, now);
    return `<article class="card${run ? " run" : ""}" style="--c:${t.color}">
      <div class="head"><span class="dot"></span><span class="name" title="${esc(t.name)}">${esc(t.name)}</span>
      <button type="button" class="icon" data-act="editTimer" data-id="${t.id}" aria-label="Настроить">⋯</button></div>
      <div class="time${rem != null && rem < 0 ? " over" : ""}" data-live="${t.id}">${timeText(t, sp, now)}</div>
      <div class="foot"><span class="small muted" data-livesub="${t.id}">${subText(t, sp, now)}${link ? " · → " + esc(link.name) : ""}</span>
      ${run ? `<button type="button" class="go" data-act="toggleTimer" data-id="${t.id}">Пауза</button>`
        : t.cdMin ? `<span class="row" style="gap:6px;flex-wrap:nowrap"><button type="button" class="go" data-act="cdResume" data-id="${t.id}">Продолжить</button><button type="button" class="go ghost" data-act="cdReset" data-id="${t.id}" data-tip="Убрать отсчёт. Отработанное время уже записано">Сбросить</button></span>`
        : `<button type="button" class="go" data-act="toggleTimer" data-id="${t.id}" data-tip="Секундомер">Старт</button>`}</div>
      ${!run && !t.cdMin ? `<div class="presets" aria-label="Быстрый таймер">${cdPresets().map(m => `<button type="button" class="preset" data-act="cdStart" data-id="${t.id}" data-m="${m}" data-tip="Таймер на ${fmtMin(m)}">${presetLabel(m)}</button>`).join("")}</div>` : ""}
      ${editing ? `<div class="edit">
        <label>Название<input type="text" data-chg="timer" data-id="${t.id}" data-f="name" value="${esc(t.name)}" maxlength="60"></label>
        <label>Группа (необязательно)<input type="text" list="tgroups" data-chg="timer" data-id="${t.id}" data-f="group" value="${esc(t.group)}" placeholder="например, Личное"></label>
        <label>Записывать время в строку трекера<select data-chg="timer" data-id="${t.id}" data-f="itemId">${opt("", "— не записывать —", !t.itemId)}${durItems.map(i => opt(i.id, (get("sections", i.sectionId)?.name || "") + " · " + i.name, t.itemId === i.id)).join("")}</select></label>
        <label>Быстрые таймеры, минуты (для всех карточек)<input type="text" data-chg="cdPresets" value="${esc(cdPresets().join(", "))}" placeholder="5, 15, 45, 60, 90"></label>
        <div class="row"><span class="muted">Цвет</span>${PALETTE.map(c => `<button type="button" class="swatch" style="--c:${c};${c === t.color ? "outline:2px solid var(--fg);outline-offset:2px" : ""}" data-act="timerColor" data-id="${t.id}" data-c="${c}" aria-label="Цвет"></button>`).join("")}</div>
        <div class="row"><button type="button" class="btn btn-sm" data-act="moveTimer" data-id="${t.id}" data-n="-1">← Раньше</button><button type="button" class="btn btn-sm" data-act="moveTimer" data-id="${t.id}" data-n="1">Позже →</button>
        ${U.delTimer === t.id ? `<span>Удалить? Время в итогах останется.</span><button type="button" class="btn btn-sm btn-danger" data-act="delTimerYes" data-id="${t.id}">Удалить</button><button type="button" class="btn btn-sm" data-act="delTimerNo">Отмена</button>`
          : `<button type="button" class="btn btn-sm btn-danger" data-act="delTimer" data-id="${t.id}">Удалить</button>`}
        <button type="button" class="btn btn-sm" data-act="editTimer" data-id="">Готово</button></div></div>` : ""}
    </article>`;
  };
  const blocks = groups.length > 1 || groups[0]
    ? groups.sort((a, b) => (a === "") - (b === "") || a.localeCompare(b, "ru")).map(g => {
        const ts = list.filter(t => (t.group || "") === g), tot = ts.reduce((a, t) => a + (sp[t.id] || 0), 0);
        return `<div class="grouphead"><h3>${esc(g || "Без группы")}</h3><span class="muted small num" data-livegroup="${esc(g)}">${fmt(tot)}</span></div><div class="tgrid">${ts.map(card).join("")}</div>`;
      }).join("")
    : `<div class="tgrid">${list.map(card).join("")}</div>`;
  const mode = timerMode();
  return `
  <div class="bar"><h2>Таймеры</h2>
    <div class="row">
      <div class="seg" role="group" aria-label="Несколько таймеров">
        <button type="button" data-act="mode" data-v="single" aria-pressed="${mode !== "multi"}" data-tip="Запуск одного таймера ставит остальные на паузу">По одному</button>
        <button type="button" data-act="mode" data-v="multi" aria-pressed="${mode === "multi"}" data-tip="Таймеры идут независимо">Параллельно</button></div>
      ${anyRunning() ? `<button type="button" class="btn" data-act="pauseAll">Пауза для всех</button>` : ""}</div></div>
  <p class="muted small" style="margin:-8px 0 0">«Старт» — секундомер. Кнопки 5м, 15м… — таймер: когда время выйдет, прозвучит сигнал, а дальше считается переработка. Время в итогах записывается в обоих случаях.</p>
  <form class="form" data-form="addTimer" autocomplete="off">
    <input type="text" name="name" placeholder="Новое дело, например «Курсовая»" maxlength="60" style="flex:1 1 220px" aria-label="Название">
    <input type="text" name="group" list="tgroups" placeholder="Группа (необязательно)" style="flex:0 1 200px" aria-label="Группа">
    <button class="btn btn-primary" type="submit">Добавить</button>
  </form>
  <datalist id="tgroups">${groupNames.map(g => opt(g, g)).join("")}</datalist>
  ${list.length ? blocks : `<div class="panel"><b>Пока нет таймеров.</b><span class="muted">Добавьте дело выше. В настройках таймера (⋯) его можно связать со строкой трекера, тогда время будет попадать туда само.</span></div>`}
  ${timerStats()}`;
};
function timeText(t, sp, now) {
  const rem = cdRemaining(t, now);
  if (rem == null) return fmt(sp[t.id] || 0);
  return (rem < 0 ? "+" : "") + fmtCd(rem);
}
function subText(t, sp, now) {
  const rem = cdRemaining(t, now), run = !!t.runningSince;
  if (rem == null) return (run ? "идёт" : "на паузе") + " · сегодня";
  return (rem >= 0 ? "осталось из " + t.cdMin + " мин" : "переработка после " + t.cdMin + " мин") + (run ? "" : " · пауза") + " · сегодня " + fmt(sp[t.id] || 0);
}
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
    body = `<div class="row" style="align-items:baseline;gap:4px 14px"><span class="num" style="font-size:28px;font-weight:600">${fmt(total)}</span><span class="muted">всего</span>
      ${gk.length > 1 || gk[0] ? gk.map(g => `<span class="chip">${esc(g || "Без группы")}: ${fmtH(groups[g])}</span>`).join("") : ""}</div>
      <div class="rows">${ids.map(id => `<div class="srow"><span class="n"><span class="dot" style="--c:${tm(id).color}"></span><span>${esc(tm(id).name)}</span></span>
        <span class="num">${fmt(sp[id])}</span><span class="p num">${Math.round(sp[id] / total * 100)}%</span>
        <span class="sbar"><i style="width:${(sp[id] / max * 100).toFixed(2)}%;background:${tm(id).color}"></i></span></div>`).join("")}</div>
      <div><span class="label">Когда работал</span>
      <div class="tl" style="margin-top:6px">${segs.map(s => `<i data-tip="${esc(tm(s.t).name)}\n${hmS(s.s)}–${hmS(s.e)} · ${fmtH(s.e - s.s)}" style="left:${((s.s - d0) / len * 100).toFixed(3)}%;width:${((s.e - s.s) / len * 100).toFixed(3)}%;background:${tm(s.t).color}"></i>`).join("")}</div>
      <div class="ticks">${[0, 3, 6, 9, 12, 15, 18, 21, 24].map(h => `<span style="left:${h / 24 * 100}%">${pad(h)}</span>`).join("")}</div></div>`;
  }
  // 7 дней
  const keys = []; for (let i = 6; i >= 0; i--) keys.push(shift(k, -i));
  const data = keys.map(d => { const s = spentDay(d, now); const ids = Object.keys(s).filter(id => s[id] > 0).sort((a, b) => s[b] - s[a]); return {d, s, ids, total: ids.reduce((a, id) => a + s[id], 0)}; });
  const maxT = Math.max(...data.map(d => d.total)), hours = Math.max(1, Math.ceil(maxT / 3600000));
  const step = hours <= 4 ? 1 : hours <= 8 ? 2 : hours <= 12 ? 3 : Math.ceil(hours / 4), top = Math.ceil(hours / step) * step;
  const ticks = []; for (let h = 0; h <= top; h += step) ticks.push(h);
  const wt = data.reduce((a, d) => a + d.total, 0);
  const wk = {}; data.forEach(d => d.ids.forEach(id => wk[id] = (wk[id] || 0) + d.s[id]));
  const legend = Object.keys(wk).sort((a, b) => wk[b] - wk[a]);
  return `<section class="panel"><div class="bar"><h2>Итоги дня</h2><div class="row">${dnav("tmDay", k === t0 ? "Сегодня" : human(k), k < t0)}${k !== t0 ? `<button type="button" class="btn btn-sm" data-act="tmToday">Сегодня</button>` : ""}</div></div>
    <div id="tmStats">${body}</div></section>
    <section class="panel"><div class="bar"><h2>7 дней</h2><span class="muted small">${wt ? "всего " + fmtH(wt) : ""}</span></div>
    <div class="week"><div class="yax">${ticks.map(h => `<span style="bottom:${h / top * 100}%">${h} ч</span>`).join("")}</div>
    <div class="plot">${ticks.slice(1).map(h => `<div class="gl" style="bottom:${h / top * 100}%"></div>`).join("")}
    <div class="cols">${data.map(d => `<div class="col${d.d === k ? " sel" : ""}" style="height:${(d.total / (top * 3600000) * 100).toFixed(2)}%">${d.ids.map(id => `<i style="height:${(d.s[id] / d.total * 100).toFixed(2)}%;background:${tm(id).color}" data-tip="${esc(tm(id).name)}\n${short(d.d)} · ${fmtH(d.s[id])}"></i>`).join("")}</div>`).join("")}</div></div>
    <div class="xax">${data.map(d => `<button type="button" data-act="tmPick" data-d="${d.d}"><b>${WD[dateOf(d.d).getDay()]}</b>${parts(d.d)[2]}.${pad(parts(d.d)[1])}<br><span class="num">${d.total ? fmtH(d.total).replace(" мин", "м").replace(" ч", "ч") : "—"}</span></button>`).join("")}</div></div>
    ${legend.length ? `<div class="legend">${legend.map(id => `<span class="lg" data-tip="${esc(tm(id).name)} · ${fmtH(wk[id])} за 7 дней"><span class="dot" style="--c:${tm(id).color}"></span>${esc(tm(id).name)} <span class="muted num">${fmtH(wk[id])}</span></span>`).join("")}</div>` : ""}
    </section>`;
}

// ---------- действия ----------
Object.assign(ACT, {
  mode: el => { setSetting("timerMode", el.dataset.v); if (el.dataset.v === "single") { const run = all("timers").filter(t => t.runningSince).sort((a, b) => b.runningSince - a.runningSince); if (run.length > 1) { const now = Date.now(); batch(() => run.slice(1).forEach(t => stopTimer(t, now))); } } },
  cdStart: el => toggleTimer(el.dataset.id, Number(el.dataset.m)),
  cdResume: el => toggleTimer(el.dataset.id, "resume"),
  cdReset: el => patch("timers", el.dataset.id, {cdMin: null, cdAcc: null, cdRang: false}),
  pauseAll: () => { const now = Date.now(); batch(() => all("timers").forEach(t => stopTimer(t, now))); },
  toggleTimer: el => toggleTimer(el.dataset.id),
  editTimer: el => { U.editTimer = el.dataset.id; U.delTimer = null; render(); },
  timerColor: el => patch("timers", el.dataset.id, {color: el.dataset.c}),
  moveTimer: el => moveIn("timers", timersList(), el.dataset.id, +el.dataset.n),
  delTimer: el => { U.delTimer = el.dataset.id; render(); },
  delTimerNo: () => { U.delTimer = null; render(); },
  delTimerYes: el => { const t = get("timers", el.dataset.id); batch(() => { stopTimer(t, Date.now()); patch("timers", t.id, {archived: true}); }); U.editTimer = null; },
  tmDay: el => { U.tmDate = shift(U.tmDate, +el.dataset.n); if (U.tmDate > today()) U.tmDate = today(); render(); },
  tmToday: () => { U.tmDate = today(); render(); },
  tmPick: el => { U.tmDate = el.dataset.d; render(); },
});
Object.assign(CHG, {
  timer: el => patch("timers", el.dataset.id, {[el.dataset.f]: el.value.trim()}),
  cdPresets: el => { const v = el.value.split(/[\s,;]+/).map(Number).filter(n => n > 0 && n <= 1440); if (!v.length) { toast("Впишите минуты через запятую, например 5, 15, 45"); return render(); } setSetting("cdPresets", v.slice(0, 8).join(",")); },
});
Object.assign(FORM, {
  addTimer: f => {
    const name = fv(f, "name").trim(); if (!name) return;
    const used = new Set(timersList().map(t => t.color));
    put("timers", {id: uid(), name, group: fv(f, "group").trim(), color: PALETTE.find(c => !used.has(c)) || PALETTE[all("timers").length % PALETTE.length], order: nextOrder(all("timers")), itemId: "", archived: false, runningSince: null, created: Date.now()});
  },
});

/** каждую секунду: живые цифры на карточках и заголовок вкладки */
function tickTimers() {
  const now = Date.now(), running = all("timers").filter(t => t.runningSince);
  const cd = running.find(t => t.cdMin);
  document.title = cd ? (cdRemaining(cd, now) < 0 ? "+" : "") + fmtCd(cdRemaining(cd, now)) + " · " + cd.name : running[0] ? fmt(now - running[0].runningSince) + " · " + running[0].name : "Трекер";
  if (!running.length || U.tab !== "timers") return;
  const sp = spentDay(today(), now);
  for (const t of all("timers")) {
    const el = document.querySelector(`[data-live="${t.id}"]`); if (!el) continue;
    el.textContent = timeText(t, sp, now);
    el.classList.toggle("over", t.cdMin != null && cdRemaining(t, now) < 0);
    const sub = document.querySelector(`[data-livesub="${t.id}"]`);
    if (sub) { const link = t.itemId && get("items", t.itemId); sub.textContent = subText(t, sp, now) + (link ? " · → " + link.name : ""); }
  }
  document.querySelectorAll("[data-livegroup]").forEach(el => { const g = el.dataset.livegroup; el.textContent = fmt(timersList().filter(t => (t.group || "") === g).reduce((a, t) => a + (sp[t.id] || 0), 0)); });
}
