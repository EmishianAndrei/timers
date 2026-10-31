"use strict";
/*
 * Напоминания. У строки трекера можно задать время («remind»: "ЧЧ:ММ").
 * Android-приложение «Трекер» в это время показывает уведомление, если строка за сегодня ещё не заполнена.
 * Строки с одинаковым временем приходят одним уведомлением, галочки можно отметить прямо из него.
 * Сайт передаёт приложению расписание и то, что уже отмечено, а забирает отметки, сделанные из уведомлений.
 */
const NATIVE = window.TrackerAndroid || null;
const remindOf = it => { const t = String(it.remind || "").trim(); return /^\d{1,2}:\d\d$/.test(t) ? t.padStart(5, "0") : ""; };
const canRemind = it => it.type !== "computed";
/** заполнена ли строка за день: галочка стоит / есть значение */
const filledVal = (k, it) => it.type === "check" ? isOn(k, it.id) : it.type === "duration" ? durVal(k, it) > 0 : !!val(k, it.id);

function reminderSlots() {
  const by = {};
  for (const it of items()) {
    const t = remindOf(it);
    if (!t || !canRemind(it) || isHidden(it) || (it.from && it.from > today())) continue;
    (by[t] = by[t] || []).push({id: it.id, name: it.name, type: it.type});
  }
  return Object.keys(by).sort().map(time => ({time, items: by[time]}));
}
/** рекомендуемое время: сон и утро — после подъёма, кофеин и энергетики — вечером, вечерние дела — перед сном */
function suggestTime(it) {
  if (!canRemind(it) || ["duration", "meal", "text"].includes(it.type)) return "";
  const sec = (get("sections", it.sectionId)?.name || "").toLowerCase();
  if (it.role === "bed" || it.role === "wake") return "12:30";
  if (/сон/.test(sec)) return "";
  if (it.type === "time" || it.type === "product") return "19:00";
  if (/утр/.test(sec)) return "12:30";
  if (/веч/.test(sec) || it.type === "number") return "23:30";
  return "";
}

let nativeT = null;
function pushNative() {
  if (!NATIVE) return;
  clearTimeout(nativeT);
  nativeT = setTimeout(() => {
    try {
      NATIVE.setConfig(JSON.stringify({url: S.cfg.url || "", key: S.cfg.key || ""}));
      NATIVE.setSchedule(JSON.stringify({slots: reminderSlots()}));
      const k = today(), ids = items().filter(it => remindOf(it) && filledVal(k, it)).map(it => it.id);
      NATIVE.setDone(JSON.stringify({date: k, ids}));
    } catch (e) {}
  }, 600);
}
/** отметки, сделанные кнопкой ✓ в уведомлении */
function takeNativePending() {
  if (!NATIVE || !NATIVE.takePending) return;
  let arr = [];
  try { arr = JSON.parse(NATIVE.takePending() || "[]"); } catch (e) {}
  if (!arr.length) return;
  batch(() => arr.forEach(p => { if (p && p.date && get("items", p.itemId) && val(p.date, p.itemId) !== p.value) setVal(p.date, p.itemId, p.value); }));
}
const notifState = () => { try { return NATIVE ? NATIVE.notifStatus() : "none"; } catch (e) { return "none"; } };
window.onNativePerm = () => { if (U.tab === "settings" || U.tab === "today") softRender(); };
window.onNativeResume = () => { takeNativePending(); };

afterRender.push(pushNative);
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") takeNativePending(); });

/** плашка на «Сегодня», если напоминания настроены, а уведомления не разрешены */
function remindBanner() {
  if (!NATIVE || notifState() === "granted" || !reminderSlots().length) return "";
  return `<div class="panel warn"><b>Напоминания настроены, но уведомления выключены.</b><div class="row"><span>Разрешите приложению показывать уведомления.</span><button type="button" class="btn btn-primary btn-sm" data-act="askNotif">Разрешить</button></div></div>`;
}

/** раздел «Напоминания» в настройках */
function remindersHtml() {
  const st = notifState();
  const its = items().filter(it => canRemind(it) && !isHidden(it));
  const secs = sections();
  const status = !NATIVE
    ? `<p class="small muted">Уведомления приходят в Android-приложении «Трекер». Время можно настроить здесь — приложение подхватит его при синхронизации. <a href="https://github.com/EmishianAndrei/timers/releases/latest/download/tracker.apk">Скачать приложение</a></p>`
    : st === "granted"
      ? `<div class="row small"><span class="chip tag-good">Уведомления включены</span><button type="button" class="btn btn-sm" data-act="testNotif">Проверить</button></div>`
      : `<div class="row small"><span class="chip">Уведомления выключены</span><button type="button" class="btn btn-primary btn-sm" data-act="askNotif">Разрешить уведомления</button></div>`;
  const row = it => { const t = remindOf(it);
    return `<div class="item"><span class="lbl">${esc(it.name)} <span class="small muted">· ${TYPE_SHORT[it.type] || ""}</span></span><span class="ctl">
      <input type="time" data-chg="item" data-id="${it.id}" data-f="remind" value="${esc(t)}" aria-label="Напомнить: ${esc(it.name)}">
      ${t ? `<button type="button" class="icon sm" data-act="clearRemind" data-id="${it.id}" aria-label="Убрать напоминание">×</button>` : `<span class="icon sm"></span>`}</span></div>`; };
  const slots = reminderSlots();
  return `<section class="panel"><div class="bar"><h3>Напоминания</h3><button type="button" class="btn btn-sm" data-act="suggestRemind" data-tip="Заполнит время у строк, где его ещё нет">Рекомендуемое время</button></div>
    ${status}
    <p class="small muted">Уведомление приходит, только если строка за сегодня ещё не заполнена. Строки с одинаковым временем приходят одним уведомлением, галочки можно отметить прямо из него.</p>
    ${slots.length ? `<div class="chips">${slots.map(s => `<span class="chip" data-tip="${esc(s.items.map(i => i.name).join(", "))}">🔔 ${s.time} · ${s.items.length}</span>`).join("")}</div>` : ""}
    <details class="remind-list" ${U.remindOpen ? "open" : ""}><summary class="small" data-act="remindToggle">Время по строкам</summary>
      ${secs.map(s => { const l = its.filter(i => i.sectionId === s.id); return l.length ? `<div class="label" style="margin-top:10px">${esc(s.name)}</div>${l.map(row).join("")}` : ""; }).join("")}
    </details></section>`;
}

Object.assign(ACT, {
  askNotif: () => { try { NATIVE.requestNotif(); } catch (e) {} },
  testNotif: () => { try { NATIVE.testNotif(); toast("Тестовое уведомление отправлено"); } catch (e) {} },
  clearRemind: el => patch("items", el.dataset.id, {remind: ""}),
  suggestRemind: () => {
    let n = 0;
    batch(() => items().forEach(it => { if (!remindOf(it) && !isHidden(it)) { const t = suggestTime(it); if (t) { patch("items", it.id, {remind: t}); n++; } } }));
    U.remindOpen = true;
    toast(n ? "Добавлено напоминаний: " + n + ". Время можно поменять ниже." : "Всем подходящим строкам время уже задано");
  },
  remindToggle: el => { const d = el.parentElement; U.remindOpen = !d.open; d.open = U.remindOpen; },
});
