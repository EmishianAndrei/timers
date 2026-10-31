"use strict";
/* Запуск: обработчики событий, вкладки, ежесекундный тик. */

Object.assign(ACT, {
  sideOpen: () => { document.body.classList.add("side-open"); $("#sideBg").hidden = false; $("#side .side-nav [aria-current=page]")?.focus(); },
  sideClose: () => { document.body.classList.remove("side-open"); $("#sideBg").hidden = true; },
  tab: el => { ACT.sideClose(); U.tab = el.dataset.tab; U.menu = null; U.modal = null; saveUI(); history.replaceState(null, "", "#" + U.tab); render(); window.scrollTo(0, 0); },
});

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
  if (e.key === "Escape" && document.body.classList.contains("side-open")) { ACT.sideClose(); return; }
  if (e.key === "Enter" && e.target.matches("input[data-chg]") && e.target.type !== "checkbox" && !e.target.closest(".gt")) e.target.blur();
});

function tick() {
  if (tick.day && tick.day !== today()) { // наступила полночь: переходим на новый день, если смотрели «сегодня»
    const prev = tick.day; tick.day = today(); U.tmDate = today();
    if (U.trDate === prev) U.trDate = today();
    if (U.trWeek === weekStart(prev)) U.trWeek = weekStart(today());
    if (U.trMonth === mkey(prev)) U.trMonth = mkey(today());
    saveUI(); softRender(); return;
  }
  tick.day = today();
  tickTimers();
  if (!anyRunning()) return;
  if ((U.tab === "timers" || U.tab === "today") && Date.now() % 10000 < 1000 && !isEditing() && U.tmDate === today()) render();
  else if (U.tab === "tracker" && Date.now() % 60000 < 1000) softRender();
}

// перенос данных из самой первой версии сайта (только таймеры)
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

load();
U.tab = "today"; // при открытии — экран «Сегодня»
const h0 = location.hash.slice(1); if (VIEWS[h0]) U.tab = h0;
migrateV1();
takeNativePending();
render();
setSync(S.cfg.url ? "ok" : "off");
if (S.cfg.url) sync(false, true);
setInterval(tick, 1000);
setInterval(() => { if (document.visibilityState === "visible") sync(); }, 60000);
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") { sync(false, Date.now() - S.lastPull > 15000); tick(); } });
window.addEventListener("online", () => sync(false, true));
window.addEventListener("hashchange", () => { const t = location.hash.slice(1); if (VIEWS[t] && t !== U.tab) { U.tab = t; render(); } });
if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("sw.js").catch(() => {});
