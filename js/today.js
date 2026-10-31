"use strict";
/* «Сегодня»: всё главное на один экран — таймеры, привычки, сон, еда с КБЖУ, задачи, быстрая трата. */

function todayTasks() {
  const t0 = today();
  return all("tasks").filter(t => !t.done && ((t.due && t.due <= t0) || t.starred))
    .sort((a, b) => (a.due || "9999").localeCompare(b.due || "9999") || (b.starred - a.starred));
}
function topExpenseCats(n = 6) {
  const since = shift(today(), -60), cnt = {};
  all("finOps").forEach(o => { if (o.date >= since && o.amount < 0) cnt[o.catId] = (cnt[o.catId] || 0) + 1; });
  const cats = all("finCats").filter(c => !c.archived && c.kind !== "income");
  return cats.sort((a, b) => (cnt[b.id] || 0) - (cnt[a.id] || 0) || byOrder(a, b)).slice(0, n);
}

VIEWS.today = () => {
  const k = today(), now = Date.now(), sp = spentDay(k, now);
  const d = dateOf(k), title = WDL[d.getDay()][0].toUpperCase() + WDL[d.getDay()].slice(1) + ", " + short(k);
  const workMs = Object.values(sp).reduce((a, b) => a + b, 0);
  const slp = sleepMin(k), nutr = dayNutr(k);
  const checks = checkItems().filter(i => active(i, k)), doneN = checks.filter(i => isOn(k, i.id)).length;
  const tasks = todayTasks();
  const spent = all("finOps").filter(o => o.date === k && o.amount < 0).reduce((a, o) => a + o.amount, 0);

  // плитки-итоги
  const tile = (label, value, sub, tab) => `<button type="button" class="tile tbtn" data-act="tab" data-tab="${tab}"><div class="label">${label}</div><div class="v num">${value}</div>${sub ? `<div class="small muted">${sub}</div>` : ""}</button>`;
  const tiles = `<div class="tiles">
    ${tile("Время", fmt(workMs).replace(/:\d\d$/, ""), Object.keys(sp).length ? Object.keys(sp).filter(id => sp[id] > 0).length + " дел" : "таймеры не запускали", "timers")}
    ${tile("Привычки", doneN + "/" + checks.length, checks.length ? `<span class="pbar"><i style="width:${Math.round(doneN / checks.length * 100)}%"></i></span>` : "", "tracker")}
    ${tile("Сон", slp == null ? "—" : min2hm(slp), slp == null ? "впишите отбой и подъём" : "", "tracker")}
    ${tile("Калории", nutr.list.length ? Math.round(nutr.tot.kcal) : "—", nutr.list.length ? `Б ${fnum(nutr.tot.prot, 0)} · Ж ${fnum(nutr.tot.fat, 0)} · У ${fnum(nutr.tot.carb, 0)}` : "ничего не отмечено", "tracker")}
    ${tile("Задачи", tasks.length, tasks.length ? "на сегодня и важные" : "всё сделано", "tasks")}
  </div>`;

  // таймеры: компактные строки
  const ts = timersList();
  const timersHtml = ts.length ? `<div class="tlist">${ts.map(t => {
    const run = !!t.runningSince, rem = cdRemaining(t, now);
    return `<div class="trow${run ? " run" : ""}" style="--c:${t.color}">
      <span class="dot"></span><span class="name">${esc(t.name)}</span>
      <span class="num tval${rem != null && rem < 0 ? " over" : ""}" data-live="${t.id}">${timeText(t, sp, now)}</span>
      ${run ? `<button type="button" class="go" data-act="toggleTimer" data-id="${t.id}">Пауза</button>`
        : t.cdMin ? `<button type="button" class="go" data-act="cdResume" data-id="${t.id}">Дальше</button>`
        : `<button type="button" class="go" data-act="toggleTimer" data-id="${t.id}" aria-label="Старт: ${esc(t.name)}">▶</button>`}
    </div>`; }).join("")}</div>` : `<p class="empty">Таймеров пока нет. <button type="button" class="linkbtn" data-act="tab" data-tab="timers">Создать</button></p>`;

  // привычки по разделам
  const secs = sections();
  const firstSec = (list, def) => list.find(i => get("sections", i.sectionId))?.sectionId || def || secs[0]?.id || "";
  const habitsHtml = editOn("t:habits") ? secs.map(s => { const l = checks.filter(i => i.sectionId === s.id); return l.length ? `<div class="hgroup"><div class="label">${esc(s.name)}</div>${editRows(l)}</div>` : ""; }).join("") + hiddenRows(items().filter(i => i.type === "check" && isHidden(i))) + addRowForm(["check"], firstSec(checks), true)
    : checks.length ? secs.map(s => {
    const list = checks.filter(i => i.sectionId === s.id); if (!list.length) return "";
    return `<div class="hgroup"><div class="label">${esc(s.name)}</div>${list.map(i => { const on = isOn(k, i.id), st = streakOf(i.id);
      return `<label class="hcheck${on ? " on" : ""}"><input type="checkbox" data-chg="entry" data-d="${k}" data-id="${i.id}" ${on ? "checked" : ""}><span class="hc-t">${esc(i.name)}</span>${st > 1 ? `<span class="st" data-tip="Серия: ${st} дн. подряд">🔥 ${st}</span>` : ""}</label>`; }).join("")}</div>`;
  }).join("") : `<p class="empty">Галочек пока нет.</p>`;

  // сон, еда и прочие поля за день (кроме галочек и времени занятий)
  const FOOD = ["meal", "product"], REST = ["time", "computed", "number", "choice", "text"];
  const its = items().filter(i => active(i, k));
  const foodIts = its.filter(i => FOOD.includes(i.type));
  const restIts = its.filter(i => REST.includes(i.type)); // идут в общем порядке строк, его можно менять
  const fieldRows = list => list.map(i => `<div class="item"><span class="lbl">${itemLabel(k, i)}</span><span class="ctl">${control(k, i)}</span></div>`).join("");
  const panelBody = (key, list, types, addTypes) => editOn(key)
    ? editRows(list) + hiddenRows(items().filter(i => types.includes(i.type) && isHidden(i))) + addRowForm(addTypes, firstSec(list), true)
    : fieldRows(list);

  const cats = topExpenseCats(), cur = get("finCats", U.finCat) && cats.some(c => c.id === U.finCat) ? U.finCat : cats[0]?.id;
  const moneyHtml = cats.length ? `<div class="chips">${cats.map(c => `<button type="button" class="chipbtn${c.id === cur ? " on" : ""}" data-act="todayCat" data-id="${c.id}">${esc(c.name)}</button>`).join("")}</div>
    <form class="form" data-form="addOp" autocomplete="off"><input type="hidden" name="date" value="${k}"><input type="hidden" name="cat" value="${esc(cur)}"><input type="hidden" name="note" value="">
      <input type="text" name="amount" inputmode="decimal" placeholder="Сумма, ₽" required style="flex:1 1 120px" aria-label="Сумма"><button class="btn btn-primary" type="submit">Записать трату</button></form>
    <div class="small muted">Сегодня потрачено: <b class="num">${money(spent)}</b></div>` : `<p class="empty">Категорий трат пока нет.</p>`;

  const t0 = k;
  const tasksHtml = tasks.length ? tasks.slice(0, 8).map(t => `<div class="gt-task today-task" data-tid="${t.id}">
      <span></span><button type="button" class="gt-check" data-act="gtDone" data-id="${t.id}" aria-label="Выполнено">${ICON.circle}</button>
      <div class="gt-main" data-act="openTaskFromToday" data-id="${t.id}"><div class="gt-title">${esc(t.title)}</div>${t.due ? `<span class="gt-chip sm${chipCls(t.due)}">${ICON.cal}${chipDate(t.due)}</span>` : ""}</div>
      <span class="gt-star${t.starred ? " on" : ""}">${t.starred ? ICON.starF : ""}</span></div>`).join("") + (tasks.length > 8 ? `<p class="muted small">и ещё ${tasks.length - 8}</p>` : "")
    : `<p class="empty">На сегодня задач нет.</p>`;

  return `<div class="bar"><div><h1 class="hello">${title}</h1><div class="muted small">${greet()}</div></div></div>
  ${scriptBanner()}
  ${remindBanner()}
  ${tiles}
  <div class="dash">
    <section class="panel"><div class="bar"><h3>Таймеры</h3><button type="button" class="linkbtn" data-act="tab" data-tab="timers">Все таймеры →</button></div>${timersHtml}</section>
    <section class="panel"><div class="bar"><h3>Привычки</h3><span class="row"><span class="muted small">${doneN} из ${checks.length}</span>${editBtn("t:habits")}</span></div>${habitsHtml}</section>
    <section class="panel sec"><div class="bar"><h3>Еда</h3><span class="row">${editOn("t:food") ? "" : `<button type="button" class="linkbtn" data-act="tab" data-tab="recipes">Рецепты →</button>`}${editBtn("t:food")}</span></div>${panelBody("t:food", foodIts, FOOD, FOOD)}${editOn("t:food") ? "" : nutrSummary(k)}</section>
    <section class="panel"><div class="bar"><h3>Задачи</h3><button type="button" class="linkbtn" data-act="tab" data-tab="tasks">Все задачи →</button></div><div class="today-tasks">${tasksHtml}</div></section>
    <section class="panel sec"><div class="bar"><h3>Сон и самочувствие</h3>${editBtn("t:rest")}</div>${panelBody("t:rest", restIts, REST, ["time", "number", "choice", "text"])}${!restIts.length && !editOn("t:rest") ? `<p class="empty">Строк нет — нажмите «Настроить», чтобы добавить.</p>` : ""}</section>
    <section class="panel"><h3>Быстрая трата</h3>${moneyHtml}</section>
  </div>`;
};
function greet() {
  const h = new Date().getHours();
  return h < 5 ? "Доброй ночи" : h < 12 ? "Доброе утро" : h < 18 ? "Добрый день" : "Добрый вечер";
}
Object.assign(ACT, {
  todayCat: el => { U.finCat = el.dataset.id; U.finSign = null; const a = $("[data-form=addOp] [name=amount]")?.value || ""; render(); const f = $("[data-form=addOp] [name=amount]"); if (f) { f.value = a; f.focus(); } },
  openTaskFromToday: el => { const t = get("tasks", el.dataset.id); if (!t) return; U.list = t.listId; U.openTask = t.id; U.tab = "tasks"; history.replaceState(null, "", "#tasks"); saveUI(); render(); window.scrollTo(0, 0); },
});
