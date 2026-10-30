"use strict";
/* Серии привычек, годовая тепловая карта и поиск связей в данных (как Exist / Bearable). */

const checkItems = () => items().filter(i => i.type === "check");
/** серия: сколько дней подряд отмечено; если сегодня ещё не отмечено — считаем со вчера */
function streakOf(id, upto = today()) {
  const it = get("items", id); let d = isOn(upto, id) ? upto : shift(upto, -1), n = 0;
  while (isOn(d, id) && (!it || active(it, d))) { n++; d = shift(d, -1); if (n > 3660) break; }
  return n;
}
function bestStreak(id) {
  const ds = all("entries").filter(e => e.itemId === id && e.value === "TRUE").map(e => e.date).sort();
  let best = 0, cur = 0, prev = "";
  for (const d of ds) { cur = prev && shift(prev, 1) === d ? cur + 1 : 1; best = Math.max(best, cur); prev = d; }
  return best;
}
/** доля выполнения за последние n дней (учитывая даты активности строки) */
function rateOf(id, n = 30) {
  const it = get("items", id); let ok = 0, tot = 0;
  for (let i = 0; i < n; i++) { const d = shift(today(), -i); if (it && !active(it, d)) continue; tot++; if (isOn(d, id)) ok++; }
  return tot ? ok / tot : null;
}
/** доля привычек, выполненных за день (все галочки, активные в этот день) */
function habitShare(d) {
  const list = checkItems().filter(i => active(i, d)); if (!list.length) return null;
  return list.filter(i => isOn(d, i.id)).length / list.length;
}

function heatmapHtml(id) {
  const t0 = today(), start = shift(weekStart(t0), -7 * 52), cols = [];
  for (let w = 0; w < 53; w++) {
    const cells = [];
    for (let i = 0; i < 7; i++) {
      const d = shift(start, w * 7 + i);
      if (d > t0) { cells.push(`<i class="hm f"></i>`); continue; }
      let lvl, tip;
      if (id) { const it = get("items", id); const on = isOn(d, id); lvl = it && !active(it, d) ? -1 : on ? 4 : 0; tip = human(d) + (on ? "\n✓ сделано" : ""); }
      else { const sh = habitShare(d); lvl = sh == null ? -1 : sh === 0 ? 0 : Math.min(4, Math.ceil(sh * 4)); tip = human(d) + (sh == null ? "" : "\nпривычек выполнено: " + Math.round(sh * 100) + "%"); }
      cells.push(`<i class="hm l${lvl}" data-tip="${esc(tip)}"></i>`);
    }
    const first = shift(start, w * 7), m = parts(first)[1];
    cols.push(`<div class="hmc"><span class="hmm">${parts(first)[2] <= 7 ? MONTHS_S[m - 1] : ""}</span>${cells.join("")}</div>`);
  }
  return `<div class="hmwrap"><div class="hmdays"><span></span><span>пн</span><span></span><span>ср</span><span></span><span>пт</span><span></span><span></span></div><div class="hmgrid">${cols.join("")}</div></div>
    <div class="hmleg muted small">меньше <i class="hm l0"></i><i class="hm l1"></i><i class="hm l2"></i><i class="hm l3"></i><i class="hm l4"></i> больше</div>`;
}
function habitStatsHtml() {
  const list = checkItems().filter(i => active(i, today()));
  if (!list.length) return "";
  const sel = U.heatItem && get("items", U.heatItem) ? U.heatItem : "";
  const rows = list.map(i => { const s = streakOf(i.id), b = bestStreak(i.id), r = rateOf(i.id); return {i, s, b, r}; }).sort((a, b) => b.s - a.s || (b.r ?? 0) - (a.r ?? 0));
  return `<section class="panel"><div class="bar"><h3>Серии привычек</h3><span class="muted small">серия — дней подряд; % — за последние 30 дней</span></div>
    <div class="streaks">${rows.map(x => `<button type="button" class="streak${sel === x.i.id ? " on" : ""}" data-act="heatItem" data-id="${x.i.id}">
      <span class="sn">${esc(x.i.name)}</span>
      <span class="sv"><b class="num">${x.s}</b><i>${x.s ? "🔥" : ""}</i></span>
      <span class="sm muted small">лучшая ${x.b} · ${x.r == null ? "—" : Math.round(x.r * 100) + "%"}</span>
      <span class="sbar"><i style="width:${Math.round((x.r || 0) * 100)}%;background:var(--good)"></i></span></button>`).join("")}</div>
    <div class="bar"><h3>${sel ? esc(get("items", sel).name) : "Все привычки"} за год</h3>${sel ? `<button type="button" class="btn btn-sm" data-act="heatItem" data-id="">Показать все</button>` : `<span class="muted small">нажмите на привычку выше, чтобы увидеть её карту</span>`}</div>
    ${heatmapHtml(sel)}</section>`;
}
function kcalChart(days) {
  const t0 = today(), vals = days.map(d => d > t0 ? null : dayNutr(d)), mx = Math.max(0, ...vals.map(v => v ? v.tot.kcal : 0));
  if (!mx) return "";
  const N = days.length, withData = vals.filter(v => v && v.tot.kcal > 0), avg = withData.reduce((a, v) => a + v.tot.kcal, 0) / withData.length;
  return `<div class="label" style="margin-top:6px">Калории по дням · в среднем ${Math.round(avg)} ккал</div>
    <div class="hcells kc" style="grid-template-columns:repeat(${N},1fr)">${days.map((d, i) => { const v = vals[i]; if (!v || !v.tot.kcal) return `<i class="hc nb"></i>`; return `<i class="hc nb" data-tip="${human(d)}\n${Math.round(v.tot.kcal)} ккал\nБ ${fnum(v.tot.prot, 0)} · Ж ${fnum(v.tot.fat, 0)} · У ${fnum(v.tot.carb, 0)} г"><b style="height:${Math.max(4, v.tot.kcal / mx * 100)}%"></b></i>`; }).join("")}</div>`;
}

// ---------- связи между показателями ----------
function dayMetrics(d) {
  const durs = items().filter(i => i.type === "duration" && active(i, d));
  const steps = items().find(i => i.type === "number" && /шаг/i.test(i.name));
  const caf = items().find(i => i.type === "time" && !i.role && /кофе/i.test(i.name));
  const energy = items().filter(i => (i.type === "product" || i.type === "choice") && /энерг/i.test(i.name));
  const nt = dayNutr(d).tot.kcal;
  return {
    sleep: sleepMin(d),
    work: durs.length ? durs.reduce((a, i) => a + durVal(d, i), 0) : null,
    steps: steps ? toNum(val(d, steps.id)) : null,
    caffeine: caf ? hm2min(val(d, caf.id)) : null,
    energy: energy.length ? (energy.some(i => { const v = val(d, i.id); return v && toNum(v) !== 0; }) ? 1 : 0) : null,
    habits: habitShare(d),
    kcal: nt > 0 ? nt : null,
  };
}
const MET = {
  sleep: {name: "сон накануне", hi: "вы спали дольше обычного", f: v => min2hm(v)},
  nextSleep: {name: "сон следующей ночью", hi: "следующей ночью вы спали дольше", f: v => min2hm(v)},
  work: {name: "время на дела", hi: "на дела ушло больше времени", f: v => fmtMin(v)},
  steps: {name: "шагов", hi: "шагов было больше обычного", f: v => fnum(Math.round(v))},
  caffeine: {name: "последний кофеин", hi: "последний кофеин был позже обычного", f: v => min2hm(v)},
  energy: {name: "энергетик", bin: true, yes: "с энергетиком", no: "без энергетика"},
  habits: {name: "выполнено привычек", hi: "выполнено больше привычек", f: v => Math.round(v * 100) + "%"},
  kcal: {name: "калорий", hi: "калорий было больше обычного", f: v => Math.round(v) + " ккал"},
};
function pearson(xs, ys) {
  const n = xs.length, mx = xs.reduce((a, b) => a + b, 0) / n, my = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0, sxx = 0, syy = 0; for (let i = 0; i < n; i++) { const a = xs[i] - mx, b = ys[i] - my; sxy += a * b; sxx += a * a; syy += b * b; }
  return sxx && syy ? sxy / Math.sqrt(sxx * syy) : 0;
}
function insights(nDays = 90) {
  const rows = []; const t0 = today();
  for (let i = nDays; i >= 1; i--) { const d = shift(t0, -i); const m = dayMetrics(d); m.nextSleep = sleepMin(shift(d, 1)); rows.push(m); }
  const pairs = [["sleep", "work"], ["sleep", "habits"], ["nextSleep", "caffeine"], ["nextSleep", "energy"], ["sleep", "energy"], ["steps", "sleep"], ["nextSleep", "steps"], ["work", "habits"], ["kcal", "sleep"], ["work", "energy"], ["steps", "work"]];
  const out = [];
  for (const [y, x] of pairs) {
    const ok = rows.filter(r => r[x] != null && r[y] != null); if (ok.length < 10) continue;
    const xs = ok.map(r => r[x]), ys = ok.map(r => r[y]);
    if (new Set(xs).size < 2 || (!MET[x].bin && !MET[x].hi)) continue;
    const r = pearson(xs, ys); if (Math.abs(r) < 0.25) continue;
    let hi, lo, cond;
    let lead, rest;
    if (MET[x].bin) { hi = ok.filter(o => o[x] === 1); lo = ok.filter(o => o[x] === 0); lead = "В дни " + MET[x].yes; rest = "в дни " + MET[x].no; }
    else { const med = [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]; hi = ok.filter(o => o[x] > med); lo = ok.filter(o => o[x] <= med); lead = "В дни, когда " + MET[x].hi + ","; rest = "в остальные дни"; }
    if (hi.length < 3 || lo.length < 3) continue;
    const avg = a => a.reduce((s, o) => s + o[y], 0) / a.length, ah = avg(hi), al = avg(lo);
    out.push({x, y, r, n: ok.length, text: `${lead} ${MET[y].name} в среднем <b>${MET[y].f(ah)}</b>, ${rest} — <b>${MET[y].f(al)}</b>.`});
  }
  return out.sort((a, b) => Math.abs(b.r) - Math.abs(a.r)).slice(0, 6);
}
function insightsHtml() {
  const list = insights();
  const strength = r => Math.abs(r) >= 0.5 ? "сильная связь" : Math.abs(r) >= 0.35 ? "заметная связь" : "слабая связь";
  return `<section class="panel"><div class="bar"><h3>Связи в ваших данных</h3><span class="muted small">за последние 90 дней</span></div>
    ${list.length ? `<div class="insights">${list.map(i => `<div class="ins"><span class="ins-tag ${i.r > 0 ? "up" : "down"}">${i.r > 0 ? "↗" : "↘"} ${strength(i.r)}</span><p>${i.text}</p><span class="muted small">${i.n} дней с данными</span></div>`).join("")}</div>
      <p class="muted small">Это совпадения, а не доказанные причины. Чем больше дней заполнено, тем надёжнее выводы.</p>`
    : `<p class="empty">Пока мало данных, чтобы найти закономерности. Нужно хотя бы 10 заполненных дней со сном, временем и привычками.</p>`}</section>`;
}

Object.assign(ACT, {
  heatItem: el => { U.heatItem = el.dataset.id || null; render(); },
});
