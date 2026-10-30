"use strict";
/* Трекер привычек: день, месяц (таблица), графики, настройка строк. */

const ITEM_TYPES = {check: "Галочка", duration: "Время (ч:мм, можно из таймеров)", meal: "Приём пищи (№ блюда + время)", product: "Продукт из списка (№ + сокр. название)", number: "Число", choice: "Выбор из списка", time: "Время суток", text: "Текст", computed: "Длительность сна (авто)"};
const SEC_COLORS = ["#3a74d6", "#c2417a", "#2a9a6a", "#e0782f", "#7a5ad6", "#2398ae", "#b8921c"];

const sections = () => all("sections").sort(byOrder);
const items = () => all("items").sort(byOrder);
const active = (it, k) => (!it.from || k >= it.from) && (!it.to || k <= it.to);
const entry = (k, itemId) => get("entries", k + "|" + itemId);
const val = (k, itemId) => { const e = entry(k, itemId); return e ? e.value : ""; };
const isOn = (k, id) => val(k, id) === "TRUE";
function setVal(k, itemId, v) {
  const id = k + "|" + itemId;
  if (v === "" || v == null || v === false) del("entries", id);
  else put("entries", {id, date: k, itemId, value: v === true ? "TRUE" : String(v)});
}
// время: в записи хранятся минуты; если записи нет — берётся время связанных таймеров
function autoMin(k, itemId) {
  const ids = new Set(all("timers").filter(t => t.itemId === itemId).map(t => t.id));
  return ids.size ? Math.round(timerMinutes(k, ids)) : 0;
}
function durVal(k, it) { const v = toNum(val(k, it.id)); return v != null ? v : autoMin(k, it.id); }
function sleepMin(k) {
  const bedIt = all("items").find(i => i.role === "bed"), wakeIt = all("items").find(i => i.role === "wake");
  if (!bedIt || !wakeIt) return null;
  const b = hm2min(val(k, bedIt.id)), w = hm2min(val(k, wakeIt.id));
  if (b == null || w == null) return null;
  let d = w - b; if (d < 0) d += 1440; return d;
}
// приём пищи: «№|чч:мм»
// приём пищи: «№|чч:мм|кол-во» — кол-во: граммы для продукта, порции для рецепта
const mealParts = v => { const [num = "", time = "", amt = ""] = String(v || "").split("|"); return {num: num.trim(), time: time.trim(), amt: amt.trim()}; };
/** количество по умолчанию: продукт — вся упаковка (или 100), рецепт — 1 порция */
const defAmt = r => !r ? null : r.kind === "product" ? (toNum(r.pack) || 100) : 1;
const amtUnit = r => r && r.kind === "product" ? (r.unit || "г") : "порц.";
/** КБЖУ: у продукта — на 100 г/мл, у рецепта — на порцию */
const NUTRK = ["kcal", "prot", "fat", "carb"];
function nutrOf(r, amt) {
  if (!r) return null; const a = amt == null || amt === "" ? defAmt(r) : toNum(amt); if (a == null) return null;
  const f = r.kind === "product" ? a / 100 : a, o = {}; let any = false;
  for (const k of NUTRK) { const v = toNum(r[k]); o[k] = v == null ? 0 : v * f; if (v != null) any = true; }
  return any ? o : null;
}
/** строка «Продукт из списка» может хранить несколько продуктов через запятую: «П1,П1,П3» */
const prodList = v => String(v || "").split(",").map(x => x.trim()).filter(Boolean);
/** КБЖУ за день: все приёмы пищи + строки «Продукт из списка» (вся упаковка) */
function dayNutr(k) {
  const tot = {kcal: 0, prot: 0, fat: 0, carb: 0}, list = []; let missing = 0;
  for (const it of items()) {
    if (!active(it, k)) continue;
    const v = val(k, it.id); if (!v) continue;
    const pairs = [];
    if (it.type === "meal") { const p = mealParts(v); if (!p.num) continue; pairs.push([recipeByNum(p.num), p.amt]); }
    else if (it.type === "product") prodList(v).forEach(c => pairs.push([recipeByNum(c), null]));
    else continue;
    for (const [r, amt] of pairs) {
      const n = nutrOf(r, amt);
      if (!n) { missing++; continue; }
      NUTRK.forEach(x => tot[x] += n[x]);
      list.push({it, r, n, amt: amt || defAmt(r)});
    }
  }
  return {tot, list, missing};
}
// код блюда: «3» — рецепт №3, «П1» — продукт П1 (нумерация у рецептов и продуктов своя)
const foodCode = r => (r.kind === "product" ? "П" : "") + r.num;
function parseFoodCode(code) {
  const s = String(code || "").trim().replace(/\s+/g, ""); let m;
  if ((m = /^[пПpP](\d+)$/.exec(s))) return {kind: "product", num: +m[1], code: "П" + m[1]};
  if ((m = /^\d+$/.exec(s))) return {kind: "", num: +s, code: s};
  return null;
}
function recipeByNum(code) {
  const p = parseFoodCode(code); if (!p) return null;
  return all("recipes").find(r => (r.kind === "product") === (p.kind === "product") && r.num === p.num) || null;
}
/** продукты для строки трекера типа «Продукт»: по категории из настроек строки (пусто — все) */
/** тип: «еда» или «напиток». У рецептов по умолчанию — еда */
const foodType = r => String(r.ftype || "еда").trim().toLowerCase();
const lc = s => String(s || "").trim().toLowerCase();
/** фильтр строки трекера: совпадение с категорией (энергетик…) или типом (еда / напиток) */
const matchFood = (r, f) => !f || lc(r.cat) === f || foodType(r) === f;
const productsFor = it => {
  const f = lc(it.options), prods = all("recipes").filter(r => r.kind === "product").sort((a, b) => (a.num ?? 0) - (b.num ?? 0));
  const inCat = prods.filter(r => matchFood(r, f));
  return inCat.length ? inCat : prods; // если в категории пусто — показываем все продукты
};
/** для «Приёма пищи»: рецепты и продукты с типом из настроек строки (по умолчанию «еда») */
const mealFoods = it => { const f = lc(it.options) || "еда", by = (a, b) => (a.num ?? 0) - (b.num ?? 0); return {recipes: all("recipes").filter(r => r.kind !== "product" && matchFood(r, f)).sort(by), products: all("recipes").filter(r => r.kind === "product" && matchFood(r, f)).sort(by)}; };
const foodLabel = r => "№" + r.num + " " + (r.short || r.name);
const recipesSorted = () => all("recipes").sort((a, b) => ((a.kind === "product") - (b.kind === "product")) || (a.num ?? 1e9) - (b.num ?? 1e9));

VIEWS.tracker = () => {
  const v = U.trView;
  const head = `<div class="bar"><h2>Трекер</h2><div class="seg" role="group" aria-label="Вид">
    <button type="button" data-act="trView" data-v="day" aria-pressed="${v === "day"}">День</button>
    <button type="button" data-act="trView" data-v="month" aria-pressed="${v === "month"}">Месяц</button>
    <button type="button" data-act="trView" data-v="charts" aria-pressed="${v === "charts"}">Графики</button>
    <button type="button" data-act="trView" data-v="setup" aria-pressed="${v === "setup"}">Строки</button></div></div>`;
  return head + (v === "month" ? trackerMonth() : v === "charts" ? trackerCharts() : v === "setup" ? trackerSetup() : trackerDay());
};

// ---------- День ----------
function control(k, it) {
  const v = val(k, it.id), a = `data-chg="entry" data-d="${k}" data-id="${it.id}"`;
  switch (it.type) {
    case "check": return `<input type="checkbox" ${a} ${v === "TRUE" ? "checked" : ""} aria-label="${esc(it.name)}">`;
    case "duration": {
      const man = toNum(v), auto = autoMin(k, it.id), shown = man != null ? man : auto;
      const badge = man == null && auto > 0 ? `<span class="auto" data-tip="Время из таймеров">таймер</span>`
        : man != null && auto > 0 && man !== auto ? `<button type="button" class="auto" data-act="resetAuto" data-d="${k}" data-id="${it.id}" data-tip="Вернуть время из таймеров">таймер ${fmtMin(auto)} ↺</button>` : "";
      return `${badge}<span class="step"><button type="button" data-act="dur" data-d="${k}" data-id="${it.id}" data-n="-15" aria-label="Минус 15 минут">−</button><input type="text" class="dur num" inputmode="numeric" data-chg="dur" data-d="${k}" data-id="${it.id}" value="${shown ? fmtMin(shown) : ""}" placeholder="0:00" aria-label="${esc(it.name)}, ч:мм"><button type="button" data-act="dur" data-d="${k}" data-id="${it.id}" data-n="15" aria-label="Плюс 15 минут">+</button></span>`;
    }
    case "meal": {
      const {num, time, amt} = mealParts(v);
      const {recipes, products} = mealFoods(it), cur = recipeByNum(num);
      const og = (label, list) => list.length ? `<optgroup label="${label}">${list.map(r => opt(foodCode(r), foodLabel(r), cur && cur.id === r.id)).join("")}</optgroup>` : "";
      return `<span class="meal"><select class="mnum" data-chg="meal" data-d="${k}" data-id="${it.id}" data-part="num" aria-label="Блюдо или продукт" style="max-width:13em">${opt("", "—", !num)}${og("Рецепты", recipes)}${og("Продукты", products)}${num && !cur ? opt(num, num + " (нет в списке)", true) : ""}</select>${cur ? `<span class="amt"><input type="text" inputmode="decimal" class="num" data-chg="meal" data-d="${k}" data-id="${it.id}" data-part="amt" value="${esc(amt)}" placeholder="${fnum(defAmt(cur))}" aria-label="Количество" data-tip="Сколько съели: ${amtUnit(cur)}"><i>${amtUnit(cur)}</i></span>` : ""}<input type="time" data-chg="meal" data-d="${k}" data-id="${it.id}" data-part="time" value="${esc(time)}" aria-label="Время приёма"></span>`;
    }
    case "number": return `<input type="number" inputmode="decimal" step="any" ${a} value="${esc(v)}" aria-label="${esc(it.name)}">`;
    case "product": {
      const codes = prodList(v), list = productsFor(it), adding = U.addProd === k + "|" + it.id;
      const chips = codes.map((c, i) => { const r = recipeByNum(c); return `<span class="pchip" data-tip="${esc(r ? r.name : "старая запись")}">${r ? "№" + r.num + " " + esc(r.short || r.name) : (toNum(c) != null ? fnum(toNum(c), 3) : esc(c))}<button type="button" data-act="prodDel" data-d="${k}" data-id="${it.id}" data-i="${i}" aria-label="Убрать">×</button></span>`; }).join("");
      const picker = adding ? `<select data-chg="prodAdd" data-d="${k}" data-id="${it.id}" aria-label="Выберите" data-autofocus>${opt("", "Выберите…", true)}${list.map(r => opt(foodCode(r), "№" + r.num + " " + (r.short || r.name))).join("")}</select><button type="button" class="icon" data-act="prodAddCancel" aria-label="Отмена">×</button>`
        : `<button type="button" class="btn btn-sm addp" data-act="prodAddOpen" data-d="${k}" data-id="${it.id}">+ ${codes.length ? "ещё" : "Добавить"}</button>`;
      return `<span class="prods">${chips}${list.length ? picker : `<span class="muted small">нет продуктов в категории «${esc(it.options || "")}»</span>`}</span>`;
    }
    case "choice": return `<select ${a} aria-label="${esc(it.name)}">${opt("", "—", !v)}${String(it.options || "").split("|").filter(x => x !== "").map(o => opt(o, fnum(toNum(o), 3) || o, String(toNum(v)) === String(toNum(o)) && v !== "")).join("")}</select>`;
    case "time": return `<input type="time" ${a} value="${esc(v)}" aria-label="${esc(it.name)}">`;
    case "computed": { const m = sleepMin(k); return `<span class="num">${m == null ? "—" : min2hm(m)}</span>`; }
    default: return `<input type="text" ${a} value="${esc(v)}" style="width:12em" aria-label="${esc(it.name)}">`;
  }
}
function itemLabel(k, it) {
  if (it.type !== "meal") return esc(it.name);
  const {num, amt} = mealParts(val(k, it.id)), r = recipeByNum(num), n = nutrOf(r, amt);
  return `${esc(it.name)}${num ? `<div class="small ${r ? "muted" : ""}">${r ? [r.short ? esc(r.name) : "", n ? `<span class="num">${Math.round(n.kcal)} ккал</span>` : ""].filter(Boolean).join(" · ") : `<button type="button" class="linkbtn" data-act="newRecipe" data-num="${esc(num)}">Нет ${parseFoodCode(num)?.kind === "product" ? "продукта" : "блюда"} ${esc(num)}, добавить</button>`}</div>` : ""}`;
}
function nutrSummary(k) {
  const {tot, list, missing} = dayNutr(k);
  if (!list.length && !missing) return "";
  return `<div class="sum"><span>Питание</span><span class="num">${Math.round(tot.kcal)} ккал</span></div>
    <div class="macros">${[["prot", "Белки"], ["fat", "Жиры"], ["carb", "Углеводы"]].map(([x, l]) => `<span><b class="num">${fnum(tot[x], 0)}</b> г <i>${l}</i></span>`).join("")}</div>
    ${missing ? `<p class="muted small">У ${missing} записей нет КБЖУ. Впишите их в карточке рецепта или продукта.</p>` : ""}`;
}
function trackerDay() {
  const k = U.trDate, t0 = today(), its = items().filter(i => active(i, k));
  let durTotal = 0;
  const secHtml = (name, list, total) => `<section class="panel sec"><div class="sec-h"><h3>${esc(name)}</h3>${total != null ? `<span class="num">${fmtMin(total)}</span>` : ""}</div>
      ${list.map(i => `<div class="item"><span class="lbl">${itemLabel(k, i)}</span><span class="ctl">${control(k, i)}</span></div>`).join("")}</section>`;
  const secs = sections().map(s => {
    const list = its.filter(i => i.sectionId === s.id); if (!list.length) return "";
    const tot = list.filter(i => i.type === "duration").reduce((a, i) => a + durVal(k, i), 0);
    durTotal += tot;
    return secHtml(s.name, list, s.total ? tot : null);
  }).join("");
  const orphan = its.filter(i => !get("sections", i.sectionId));
  return `<div class="bar">${dnav("trDay", k === t0 ? "Сегодня, " + short(k) : human(k))}${k !== t0 ? `<button type="button" class="btn btn-sm" data-act="trToday">Сегодня</button>` : ""}</div>
    <datalist id="recipeNums">${recipesSorted().map(r => `<option value="${esc(foodCode(r))}">${esc(r.name)}</option>`).join("")}</datalist>
    <div class="grid2">${secs}${orphan.length ? secHtml("Без раздела", orphan, null) : ""}</div>
    <section class="panel"><div class="sum"><span>Всего времени за день</span><span class="num">${fmtMin(durTotal)}</span></div>${nutrSummary(k)}</section>`;
}

// ---------- Месяц (таблица) ----------
function cellText(k, it) {
  const v = val(k, it.id);
  switch (it.type) {
    case "check": return v === "TRUE" ? `<span class="on">✓</span>` : "";
    case "duration": { const man = toNum(v); if (man != null) return man ? fmtMin(man) : ""; const a = autoMin(k, it.id); return a ? `<span class="av">${fmtMin(a)}</span>` : ""; }
    case "meal": { const {num, time, amt} = mealParts(v); if (!num && !time) return ""; const r = recipeByNum(num), n = nutrOf(r, amt); return `<span data-tip="${esc((r ? r.name : num ? num + " (нет в рецептах и продуктах)" : "без блюда") + (r ? "\n" + fnum(toNum(amt) ?? defAmt(r)) + " " + amtUnit(r) : "") + (n ? " · " + Math.round(n.kcal) + " ккал" : "") + (time ? "\n" + time : ""))}">${r ? "№" + esc(r.num) : num ? esc(num) : "•"}</span>`; }
    case "number": { const n = toNum(v); return n == null ? "" : n >= 10000 ? fnum(n / 1000, 1) + "к" : fnum(n, 2); }
    case "product": { const cs = prodList(v); if (!cs.length) return ""; const rs = cs.map(recipeByNum); if (rs.every(r => !r)) return `<span data-tip="старая запись">${toNum(v) != null ? fnum(toNum(v), 3) : esc(v)}</span>`; return `<span data-tip="${esc(rs.map((r, i) => r ? r.name : cs[i]).join("\n"))}">${cs.length > 1 ? "×" + cs.length : "№" + esc(rs[0]?.num ?? cs[0])}</span>`; }
    case "choice": { const n = toNum(v); return n == null ? esc(v) : fnum(n, 3); }
    case "time": return esc(v);
    case "computed": { const m = sleepMin(k); return m == null ? "" : min2hm(m); }
    default: return v ? `<span data-tip="${esc(v)}">•</span>` : "";
  }
}
function aggText(days, it) {
  const ds = days.filter(d => active(it, d));
  switch (it.type) {
    case "check": { const n = ds.filter(d => isOn(d, it.id)).length; return n ? n + "/" + ds.length : ""; }
    case "duration": { const s = ds.reduce((a, d) => a + durVal(d, it), 0); return s ? fmtMin(s) : ""; }
    case "meal": case "product": { const n = ds.filter(d => val(d, it.id)).length; return n ? n + " дн" : ""; }
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
  const durOf = (list, d) => list.filter(i => i.type === "duration" && active(i, d)).reduce((a, i) => a + durVal(d, i), 0);
  let body = "";
  for (const s of sections()) {
    const list = its.filter(i => i.sectionId === s.id); if (!list.length) continue;
    body += `<tr class="sh"><td class="first">${esc(s.name)}</td><td colspan="${days.length + 1}"></td></tr>` + list.map(rowFor).join("");
    if (s.total) {
      const tot = days.reduce((a, d) => a + durOf(list, d), 0);
      body += `<tr class="tot"><td class="first">Всего ${esc(s.name)}</td>${days.map(d => `<td class="num">${durOf(list, d) ? fmtMin(durOf(list, d)) : ""}</td>`).join("")}<td class="agg">${tot ? fmtMin(tot) : ""}</td></tr>`;
    }
  }
  const orphans = its.filter(i => !get("sections", i.sectionId));
  if (orphans.length) body += `<tr class="sh"><td class="first">Без раздела</td><td colspan="${days.length + 1}"></td></tr>` + orphans.map(rowFor).join("");
  const allT = days.reduce((a, d) => a + durOf(its, d), 0);
  body += `<tr class="sh"><td class="first">Итого</td><td colspan="${days.length + 1}"></td></tr>
    <tr class="tot"><td class="first">Всего времени</td>${days.map(d => `<td class="num">${durOf(its, d) ? fmtMin(durOf(its, d)) : ""}</td>`).join("")}<td class="agg">${allT ? fmtMin(allT) : ""}</td></tr>`;
  return `<div class="bar">${dnav("trMonth", monthName(mk))}<span class="muted small">Галочки ставятся нажатием на клетку, остальное открывает день. <span class="av">Синим</span> — время из таймеров, формат ч:мм.</span></div>
    <div class="tbl-wrap"><table class="m"><thead><tr><th class="first">${monthName(mk)}</th>${th}<th>Итог</th></tr></thead><tbody>${body}</tbody></table></div>`;
}

// ---------- Графики (дашборд по типам) ----------
function trackerCharts() {
  const mk = U.trMonth, days = monthDays(mk), t0 = today(), N = days.length;
  const its = items().filter(i => days.some(d => active(i, d)));
  const secs = sections();
  const secColor = {}; secs.forEach((s, i) => secColor[s.id] = SEC_COLORS[i % SEC_COLORS.length]);
  const xLabels = `<div class="cx" style="grid-template-columns:repeat(${N},1fr)">${days.map(d => { const n = parts(d)[2], wd = dateOf(d).getDay(); return `<span class="${wd === 0 || wd === 6 ? "we" : ""}${d === t0 ? " today" : ""}">${n === 1 || n % 5 === 0 || d === t0 ? n : ""}</span>`; }).join("")}</div>`;
  const yScale = (maxH, unit = "ч") => { const hours = Math.max(1, Math.ceil(maxH)); const step = hours <= 4 ? 1 : hours <= 8 ? 2 : hours <= 12 ? 3 : Math.ceil(hours / 4); const top = Math.ceil(hours / step) * step; const t = []; for (let h = 0; h <= top; h += step) t.push(h); return {top, ticks: t, unit}; };
  const frame = (sc, inner, h = 180, fmtTick = x => x + " " + sc.unit) => `<div class="cframe"><div class="yax" style="height:${h}px">${sc.ticks.map(v => `<span style="bottom:${(v - (sc.lo || 0)) / (sc.top - (sc.lo || 0)) * 100}%">${fmtTick(v)}</span>`).join("")}</div>
    <div><div class="cplot" style="height:${h}px">${sc.ticks.slice(1).map(v => `<div class="gl" style="bottom:${(v - (sc.lo || 0)) / (sc.top - (sc.lo || 0)) * 100}%"></div>`).join("")}${inner}</div>${xLabels}</div></div>`;

  // 1) Время по разделам
  const durItems = its.filter(i => i.type === "duration");
  const tSecs = secs.filter(s => durItems.some(i => i.sectionId === s.id));
  const perDay = days.map(d => { const o = {}; let tot = 0; for (const s of tSecs) { const m = durItems.filter(i => i.sectionId === s.id && active(i, d)).reduce((a, i) => a + durVal(d, i), 0); o[s.id] = m; tot += m; } return {d, o, tot}; });
  const tMax = Math.max(...perDay.map(x => x.tot)) / 60;
  const sc1 = yScale(tMax);
  const monthBySec = {}; tSecs.forEach(s => monthBySec[s.id] = perDay.reduce((a, x) => a + x.o[s.id], 0));
  const allTime = perDay.reduce((a, x) => a + x.tot, 0), daysWith = perDay.filter(x => x.tot > 0).length;
  const timeChart = frame(sc1, `<div class="ccols" style="grid-template-columns:repeat(${N},1fr)">${perDay.map(x => `<div class="ccol" style="height:${(x.tot / 60 / sc1.top * 100).toFixed(2)}%">${tSecs.filter(s => x.o[s.id] > 0).map(s => `<i style="height:${(x.o[s.id] / x.tot * 100).toFixed(2)}%;background:${secColor[s.id]}" data-tip="${esc(s.name)} · ${fmtMin(x.o[s.id])}\n${human(x.d)}\nвсего за день ${fmtMin(x.tot)}"></i>`).join("")}</div>`).join("")}</div>`);
  const itemTotals = durItems.map(i => ({i, m: days.reduce((a, d) => a + (active(i, d) ? durVal(d, i) : 0), 0)})).filter(x => x.m > 0).sort((a, b) => b.m - a.m);
  const maxItem = itemTotals[0]?.m || 1;

  // 2) Сон
  const sleep = days.map(d => ({d, m: sleepMin(d)}));
  const sv = sleep.filter(x => x.m != null);
  const bedIt = all("items").find(i => i.role === "bed"), wakeIt = all("items").find(i => i.role === "wake");
  let sleepHtml = `<p class="empty">Нет данных о сне за этот месяц.</p>`;
  if (sv.length) {
    const lo = Math.max(0, Math.floor(Math.min(...sv.map(x => x.m)) / 60) - 1), hi = Math.ceil(Math.max(...sv.map(x => x.m)) / 60) + 1;
    const sc = {top: hi, lo, unit: "ч", ticks: Array.from({length: hi - lo + 1}, (_, i) => lo + i).filter((h, i, arr) => arr.length <= 8 || (h - lo) % 2 === 0)};
    const X = i => (i + 0.5) / N * 100, Y = m => (m / 60 - lo) / (hi - lo) * 100;
    const segs = []; let cur = [];
    sleep.forEach((x, i) => { if (x.m == null) { if (cur.length) segs.push(cur); cur = []; } else cur.push(`${X(i) * 10},${(100 - Y(x.m)) * 10}`); });
    if (cur.length) segs.push(cur);
    const avg = sv.reduce((a, x) => a + x.m, 0) / sv.length;
    const line = `<svg class="cline" viewBox="0 0 1000 1000" preserveAspectRatio="none" aria-hidden="true">${segs.map(p => `<polyline points="${p.join(" ")}" fill="none" stroke="var(--accent)" stroke-width="2.5" vector-effect="non-scaling-stroke"/>`).join("")}</svg>
      <div class="avgline" style="bottom:${Y(avg)}%" data-tip="Средняя длительность сна ${min2hm(avg)}"><span>ср ${min2hm(avg)}</span></div>
      ${sleep.map((x, i) => x.m == null ? "" : `<span class="cdot" style="left:${X(i)}%;bottom:${Y(x.m)}%" data-tip="${human(x.d)}\nсон ${min2hm(x.m)}\nотбой ${esc(val(x.d, bedIt.id))} → подъём ${esc(val(x.d, wakeIt.id))}"></span>`).join("")}`;
    // полоса «отбой → подъём»: шкала часов с 21:00 до 14:00
    const BASE = 21 * 60, SPAN = 17 * 60, pos = t => ((t - BASE + 1440) % 1440) / SPAN * 100;
    const bars = sleep.map((x, i) => {
      if (x.m == null) return "";
      const b = hm2min(val(x.d, bedIt.id)), top = pos(b), h = Math.min(100 - top, x.m / SPAN * 100);
      return `<i class="sbarv" style="left:calc(${i / N * 100}% + 1px);width:calc(${100 / N}% - 2px);top:${top}%;height:${h}%" data-tip="${human(x.d)}\n${esc(val(x.d, bedIt.id))} → ${esc(val(x.d, wakeIt.id))} · ${min2hm(x.m)}"></i>`;
    }).join("");
    const hTicks = [22, 0, 2, 4, 6, 8, 10, 12, 14];
    sleepHtml = `<div class="label">Длительность сна</div>${frame(sc, line, 150, v => v + " ч")}
      <div class="label" style="margin-top:12px">Когда спал: отбой → подъём</div>
      <div class="cframe"><div class="yax" style="height:170px">${hTicks.map(h => `<span style="bottom:${100 - pos(h * 60)}%">${pad(h)}:00</span>`).join("")}</div>
      <div><div class="cplot" style="height:170px">${hTicks.slice(1, -1).map(h => `<div class="gl" style="bottom:${100 - pos(h * 60)}%"></div>`).join("")}${bars}</div>${xLabels}</div></div>`;
  }

  // 3) Привычки (галочки) — клетка = день
  const checks = its.filter(i => i.type === "check");
  const strip = (it, cellFn, right) => `<div class="hrow"><span class="hname" title="${esc(it.name)}">${esc(it.name)}</span><div class="hcells" style="grid-template-columns:repeat(${N},1fr)">${days.map(cellFn).join("")}</div><span class="hval num">${right}</span></div>`;
  const habits = checks.map(it => {
    const act = days.filter(d => active(it, d) && d <= t0), n = act.filter(d => isOn(d, it.id)).length;
    return strip(it, d => !active(it, d) ? `<i class="hc na"></i>` : d > t0 ? `<i class="hc fut"></i>` : `<i class="hc${isOn(d, it.id) ? " ok" : ""}" data-tip="${esc(it.name)}\n${human(d)}\n${isOn(d, it.id) ? "✓ сделано" : "— не отмечено"}"></i>`, act.length ? n + "/" + act.length : "");
  }).join("");

  // 4) Числа и время суток
  const nums = its.filter(i => i.type === "number" || i.type === "choice");
  const numRows = nums.map(it => {
    const vals = days.map(d => active(it, d) ? toNum(val(d, it.id)) : null), vs = vals.filter(x => x != null);
    const mx = Math.max(...vs, 0) || 1, avg = vs.length ? vs.reduce((a, b) => a + b, 0) / vs.length : null;
    return strip(it, (d, i) => vals[i] == null ? `<i class="hc nb"></i>` : `<i class="hc nb" data-tip="${esc(it.name)}\n${human(d)}\n${fnum(vals[i], 3)}"><b style="height:${Math.max(4, vals[i] / mx * 100)}%"></b></i>`, avg == null ? "" : "ср " + (avg >= 1000 ? fnum(avg / 1000, 1) + "к" : fnum(avg, 2)));
  }).join("");
  const times = its.filter(i => i.type === "time" && !i.role);
  const timeRows = times.map(it => {
    const vals = days.map(d => active(it, d) ? hm2min(val(d, it.id)) : null), vs = vals.filter(x => x != null);
    const lo = 6 * 60, hi = 24 * 60, avg = vs.length ? vs.reduce((a, b) => a + b, 0) / vs.length : null;
    return strip(it, (d, i) => vals[i] == null ? `<i class="hc nb"></i>` : `<i class="hc nb" data-tip="${esc(it.name)}\n${human(d)}\n${esc(val(d, it.id))}"><s style="bottom:${Math.min(100, Math.max(0, (vals[i] - lo) / (hi - lo) * 100))}%"></s></i>`, avg == null ? "" : "ср " + min2hm(avg));
  }).join("");
  const meals = its.filter(i => i.type === "meal" || i.type === "product");
  const mealRows = meals.map(it => {
    const n = days.filter(d => val(d, it.id)).length;
    return strip(it, d => { const {num, time} = mealParts(val(d, it.id)); if (!num && !time) return `<i class="hc${d > t0 ? " fut" : ""}"></i>`; const r = recipeByNum(num); return `<i class="hc ok" data-tip="${esc(it.name)} · ${human(d)}\n${esc(r ? r.name : num ? num : "без блюда")}${time ? " · " + time : ""}"></i>`; }, n ? n + " дн" : "");
  }).join("");

  return `<div class="bar">${dnav("trMonth", monthName(mk))}<span class="muted small">Наведите на столбик или клетку, чтобы увидеть значение.</span></div>
  <section class="panel"><div class="bar"><h3>Время</h3><span class="muted small">${allTime ? "всего " + fmtMin(allTime) + " · в среднем " + fmtMin(allTime / Math.max(1, daysWith)) + " в день, когда занимался" : ""}</span></div>
    ${allTime ? timeChart : `<p class="empty">Времени за этот месяц не записано.</p>`}
    ${tSecs.length ? `<div class="legend">${tSecs.map(s => `<span class="lg"><span class="dot" style="--c:${secColor[s.id]}"></span>${esc(s.name)} <span class="muted num">${fmtMin(monthBySec[s.id])}</span></span>`).join("")}</div>` : ""}
    ${itemTotals.length ? `<div class="rows" style="margin-top:6px">${itemTotals.map(x => `<div class="srow"><span class="n"><span class="dot" style="--c:${secColor[x.i.sectionId] || "#888"}"></span><span>${esc(x.i.name)}</span></span><span class="num">${fmtMin(x.m)}</span><span class="p num">${Math.round(x.m / allTime * 100)}%</span><span class="sbar"><i style="width:${(x.m / maxItem * 100).toFixed(2)}%;background:${secColor[x.i.sectionId] || "#888"}"></i></span></div>`).join("")}</div>` : ""}
  </section>
  <section class="panel"><h3>Сон</h3>${sleepHtml}</section>
  ${checks.length ? `<section class="panel"><div class="bar"><h3>Привычки</h3><span class="muted small">клетка = день, закрашена = сделано</span></div><div class="hgrid">${habits}</div></section>` : ""}
  ${nums.length || times.length ? `<section class="panel"><h3>Числа и время</h3><div class="hgrid">${numRows}${timeRows}</div><p class="muted small">Для чисел высота столбика — значение за день, для времени суток точка выше = позже (шкала 06:00–24:00).</p></section>` : ""}
  ${meals.length ? `<section class="panel"><h3>Питание</h3><div class="hgrid">${mealRows}</div>${kcalChart(days)}</section>` : ""}
  ${habitStatsHtml()}
  ${insightsHtml()}`;
}

// ---------- Настройка строк ----------
function trackerSetup() {
  const timersBy = {}; all("timers").forEach(t => { if (t.itemId && !t.archived) (timersBy[t.itemId] = timersBy[t.itemId] || []).push(t.name); });
  const secs = sections();
  const itemRow = (i, list, idx) => `<div class="panel" style="padding:12px;gap:8px">
    <div class="row"><input type="text" data-chg="item" data-id="${i.id}" data-f="name" value="${esc(i.name)}" style="flex:1 1 200px" aria-label="Название">
      <select data-chg="item" data-id="${i.id}" data-f="type" aria-label="Тип">${Object.entries(ITEM_TYPES).map(([k, l]) => opt(k, l, i.type === k)).join("")}</select>
      <select data-chg="item" data-id="${i.id}" data-f="sectionId" aria-label="Раздел">${secs.map(s => opt(s.id, s.name, s.id === i.sectionId)).join("")}</select>
      <button type="button" class="icon" data-act="moveItem" data-id="${i.id}" data-n="-1" ${idx === 0 ? "disabled" : ""} aria-label="Выше">↑</button>
      <button type="button" class="icon" data-act="moveItem" data-id="${i.id}" data-n="1" ${idx === list.length - 1 ? "disabled" : ""} aria-label="Ниже">↓</button></div>
    <div class="row small">
      ${i.type === "meal" ? `<label class="row">Показывать<input type="text" data-chg="item" data-id="${i.id}" data-f="options" value="${esc(i.options)}" placeholder="еда (тип или категория)" style="width:16em"></label>` : ""}
      ${i.type === "product" ? `<label class="row">Категория продуктов<input type="text" data-chg="item" data-id="${i.id}" data-f="options" value="${esc(i.options)}" placeholder="например, энергетик (пусто — все)" style="width:16em"></label>` : ""}
      ${i.type === "choice" ? `<label class="row">Варианты через |<input type="text" data-chg="item" data-id="${i.id}" data-f="options" value="${esc(i.options)}" style="width:14em"></label>` : ""}
      ${i.type === "time" ? `<label class="row">Роль<select data-chg="item" data-id="${i.id}" data-f="role">${opt("", "—", !i.role)}${opt("bed", "Отбой (для сна)", i.role === "bed")}${opt("wake", "Подъём (для сна)", i.role === "wake")}</select></label>` : ""}
      <label class="row">С<input type="date" data-chg="item" data-id="${i.id}" data-f="from" value="${esc(i.from)}"></label>
      <label class="row">По<input type="date" data-chg="item" data-id="${i.id}" data-f="to" value="${esc(i.to)}"></label>
      ${i.type === "duration" ? `<span class="muted">Таймеры: ${timersBy[i.id] ? esc(timersBy[i.id].join(", ")) : "нет (связь задаётся в настройках таймера)"}</span>` : ""}
      ${U.delItem === i.id ? `<span>Удалить строку? Записи останутся в таблице.</span><button type="button" class="btn btn-sm btn-danger" data-act="delItemYes" data-id="${i.id}">Удалить</button><button type="button" class="btn btn-sm" data-act="delItemNo">Отмена</button>`
        : `${i.to && i.to < today() ? `<button type="button" class="btn btn-sm" data-act="reviveItem" data-id="${i.id}">Вернуть</button>` : `<button type="button" class="btn btn-sm" data-act="endItem" data-id="${i.id}" data-tip="Строка пропадёт из новых дней, история сохранится">Скрыть</button>`}<button type="button" class="btn btn-sm btn-danger" data-act="delItem" data-id="${i.id}">Удалить</button>`}
    </div></div>`;
  return `<p class="muted small">«Скрыть» ставит дату окончания (как «КОНЕЦ» в таблице): строка пропадёт из новых дней, но останется в истории. Скрытые строки показаны бледнее.</p>
    ${secs.map((s, si) => { const list = items().filter(i => i.sectionId === s.id); return `<section class="panel">
      <div class="row"><input type="text" data-chg="section" data-id="${s.id}" data-f="name" value="${esc(s.name)}" style="font-weight:600;flex:1 1 160px" aria-label="Раздел">
        <label class="row small"><input type="checkbox" data-chg="section" data-id="${s.id}" data-f="total" ${s.total ? "checked" : ""}> считать «Всего» по времени</label>
        <button type="button" class="icon" data-act="moveSection" data-id="${s.id}" data-n="-1" ${si === 0 ? "disabled" : ""} aria-label="Выше">↑</button>
        <button type="button" class="icon" data-act="moveSection" data-id="${s.id}" data-n="1" ${si === secs.length - 1 ? "disabled" : ""} aria-label="Ниже">↓</button>
        ${list.length ? "" : `<button type="button" class="btn btn-sm btn-danger" data-act="delSection" data-id="${s.id}">Удалить раздел</button>`}</div>
      ${list.map((i, idx) => `<div class="${i.to && i.to < today() ? "ended" : ""}">${itemRow(i, list, idx)}</div>`).join("")}
      <form class="form" data-form="addItem" data-sec="${s.id}"><input type="text" name="name" placeholder="Новая строка" style="flex:1 1 200px" aria-label="Новая строка">
        <select name="type" aria-label="Тип">${Object.entries(ITEM_TYPES).map(([k, l]) => opt(k, l, k === "check")).join("")}</select><button class="btn" type="submit">Добавить</button></form>
    </section>`; }).join("")}
    <form class="form panel" data-form="addSection"><input type="text" name="name" placeholder="Новый раздел" style="flex:1" aria-label="Новый раздел"><button class="btn btn-primary" type="submit">Добавить раздел</button></form>`;
}

// ---------- действия ----------
Object.assign(ACT, {
  trView: el => { U.trView = el.dataset.v; saveUI(); render(); },
  trDay: el => { U.trDate = shift(U.trDate, +el.dataset.n); saveUI(); render(); },
  trToday: () => { U.trDate = today(); saveUI(); render(); },
  trMonth: el => { U.trMonth = shiftMonth(U.trMonth, +el.dataset.n); saveUI(); render(); },
  cell: el => {
    const {d, id, t} = el.dataset;
    if (t === "check") setVal(d, id, isOn(d, id) ? "" : "TRUE");
    else if (t !== "computed") { U.trDate = d; U.trView = "day"; saveUI(); render(); window.scrollTo(0, 0); }
  },
  dur: el => { const {d, id} = el.dataset, it = get("items", id); const v = Math.max(0, durVal(d, it) + +el.dataset.n); setVal(d, id, v ? String(v) : (autoMin(d, id) ? "0" : "")); },
  resetAuto: el => setVal(el.dataset.d, el.dataset.id, ""),
  moveItem: el => { const it = get("items", el.dataset.id); moveIn("items", items().filter(i => i.sectionId === it.sectionId), it.id, +el.dataset.n); },
  moveSection: el => moveIn("sections", sections(), el.dataset.id, +el.dataset.n),
  endItem: el => patch("items", el.dataset.id, {to: shift(today(), -1)}),
  reviveItem: el => patch("items", el.dataset.id, {to: ""}),
  delItem: el => { U.delItem = el.dataset.id; render(); },
  delItemNo: () => { U.delItem = null; render(); },
  delItemYes: el => { U.delItem = null; del("items", el.dataset.id); },
  delSection: el => del("sections", el.dataset.id),
});
Object.assign(ACT, {
  prodAddOpen: el => { U.addProd = el.dataset.d + "|" + el.dataset.id; render(); setTimeout(() => { const s = $("[data-chg=prodAdd]"); if (s) { s.focus(); try { s.showPicker(); } catch (e) {} } }, 0); },
  prodAddCancel: () => { U.addProd = null; render(); },
  prodDel: el => { const {d, id} = el.dataset, cs = prodList(val(d, id)); cs.splice(+el.dataset.i, 1); setVal(d, id, cs.join(",")); },
});
Object.assign(CHG, {
  prodAdd: el => { if (!el.value) return; const {d, id} = el.dataset, cs = prodList(val(d, id)).filter(c => recipeByNum(c)); cs.push(el.value); U.addProd = null; setVal(d, id, cs.join(",")); },
  entry: el => {
    const it = get("items", el.dataset.id);
    let v = el.type === "checkbox" ? (el.checked ? "TRUE" : "") : el.value.trim();
    if (it && (it.type === "number" || it.type === "choice") && v !== "") { const n = toNum(v); v = n == null ? v : String(n); }
    setVal(el.dataset.d, el.dataset.id, v);
  },
  dur: el => {
    const s = el.value.trim();
    if (!s) return setVal(el.dataset.d, el.dataset.id, "");
    const m = parseDur(s);
    if (m == null) { toast("Время пишется как ч:мм, например 1:30"); render(); return; }
    setVal(el.dataset.d, el.dataset.id, String(m));
  },
  meal: el => {
    const box = el.closest(".meal");
    const raw = box.querySelector("[data-part=num]").value.trim(), num = parseFoodCode(raw)?.code || raw, time = box.querySelector("[data-part=time]").value.trim();
    const prev = mealParts(val(el.dataset.d, el.dataset.id));
    let amt = el.dataset.part === "num" && num !== prev.num ? "" : (box.querySelector("[data-part=amt]")?.value.trim() || "");
    if (amt !== "") { const n = toNum(amt); amt = n == null || n <= 0 ? "" : String(n); }
    setVal(el.dataset.d, el.dataset.id, num || time ? num + "|" + time + (amt ? "|" + amt : "") : "");
  },
  item: el => patch("items", el.dataset.id, {[el.dataset.f]: el.value.trim()}),
  section: el => patch("sections", el.dataset.id, {[el.dataset.f]: el.type === "checkbox" ? el.checked : el.value.trim()}),
});
Object.assign(FORM, {
  addItem: f => { const name = fv(f, "name").trim(); if (!name) return; const type = fv(f, "type"); put("items", {id: uid(), sectionId: f.dataset.sec, name, type, options: type === "choice" ? "0|1|2|3" : "", role: "", order: nextOrder(all("items")), from: today(), to: ""}); },
  addSection: f => { const name = fv(f, "name").trim(); if (name) put("sections", {id: uid(), name, order: nextOrder(all("sections")), total: false}); },
});
