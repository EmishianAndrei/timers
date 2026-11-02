"use strict";
/*
 * Строки дел (тип «время») берутся из столбца B таблицы «Расписание <месяц>»: каждая строка внутри раздела
 * (раздел — название в столбце A), кроме галочек, формул, строк «Всего …» и строк, которые на сайте записаны
 * иначе (отбой, кофеин, энергетики, шаги, приёмы пищи…).
 * Добавил строку в таблицу — она появляется на сайте (в трекере и в списке «Записывать время в строку трекера»);
 * убрал — строка на сайте скрывается с сегодняшнего дня (записи остаются); порядок — как в таблице.
 */
let schedAt = 0;
const wantSchedule = force => !!(S.cfg.url && setting("scheduleSheets", "") && (force || Date.now() - schedAt > 10 * 60000));
const nm = s => String(s || "").toLowerCase().replace(/\s+/g, " ").trim();

/** разделы и строки дел из раскладки листа */
function sheetSections(sch) {
  if (Array.isArray(sch.sections)) return sch.sections; // скрипт версии 6
  const other = new Set(items().filter(i => i.type !== "duration").map(i => nm(i.name)));
  const out = [], seen = new Set();
  let cur = null;
  for (const r of sch.rows || []) {
    if (r.a) { cur = {name: r.a, rows: []}; out.push(cur); }
    if (!cur || !r.b) continue;
    const k = nm(r.b);
    if (/^всего/.test(k) || r.check || r.formula || other.has(k) || seen.has(k)) continue; // одно дело — одна строка (первая)
    seen.add(k); cur.rows.push(r.b);
  }
  return out.filter(s => s.rows.length);
}

function applySchedule(sch) {
  schedAt = Date.now();
  if (!sch) return;
  sch = Object.assign({}, sch, {sections: sheetSections(sch)});
  const t0 = today(), covers = (!sch.from || sch.from <= t0) && (!sch.to || t0 <= sch.to);
  const durs = () => items().filter(i => i.type === "duration");
  let changed = 0;
  batch(() => {
    let prevSec = null;
    for (const sec of sch.sections) {
      let s = sections().find(x => nm(x.name) === nm(sec.name));
      if (!s) { s = put("sections", {id: uid(), name: sec.name, order: prevSec ? (prevSec.order ?? 0) + 0.5 : nextOrder(all("sections")), total: true}); changed++; }
      prevSec = s;
      const names = new Set(sec.rows.map(nm));
      for (const label of sec.rows) {
        const ex = durs().find(i => nm(i.name) === nm(label));
        if (!ex) { put("items", {id: uid(), sectionId: s.id, name: label, type: "duration", options: "", role: "", order: nextOrder(all("items")), from: "", to: ""}); changed++; }
        else {
          const p = {};
          if (isHidden(ex) || (ex.to && ex.to < t0)) p.to = "";
          if (ex.sectionId !== s.id) p.sectionId = s.id;
          if (Object.keys(p).length) { patch("items", ex.id, p); changed++; }
        }
      }
      // убранные из таблицы — скрыть с сегодняшнего дня (только если таблица про текущие дни)
      if (covers) for (const i of durs()) if (i.sectionId === s.id && !names.has(nm(i.name)) && !isHidden(i)) { patch("items", i.id, {to: shift(t0, -1)}); changed++; }
      // порядок как в таблице
      const list = sec.rows.map(l => durs().find(i => nm(i.name) === nm(l))).filter(Boolean);
      const ords = list.map(i => i.order ?? 0).sort((a, b) => a - b);
      list.forEach((i, k) => { if (i.order !== ords[k]) { patch("items", i.id, {order: ords[k]}); } });
    }
  });
  if (changed) toast("Строки дел обновлены по таблице расписания", 4000);
}
