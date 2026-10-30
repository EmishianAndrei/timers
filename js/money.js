"use strict";
/* Финансы, цели, настройки. */
const SKILL_CATS = ["необходимо","хочу","хочу, но вряд ли пригодится","слишком долгие что бы начать"];

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
  ${budgetsHtml(mk, byCat, catOf)}
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
        ${c.kind !== "income" ? `<label class="row">лимит/мес<input type="text" inputmode="decimal" data-chg="cat" data-id="${c.id}" data-f="budget" value="${esc(c.budget ?? "")}" placeholder="—" style="width:6.5em"></label>` : ""}
        <label class="row"><input type="checkbox" data-chg="cat" data-id="${c.id}" data-f="inTotal" ${c.inTotal ? "checked" : ""}>в итоге</label>
        <label class="row"><input type="checkbox" data-chg="cat" data-id="${c.id}" data-f="archived" ${c.archived ? "checked" : ""}>скрыта</label></div>`).join("")}
      <form class="form" data-form="addCat"><input type="text" name="group" placeholder="Группа" style="width:9em" required aria-label="Группа"><input type="text" name="name" placeholder="Категория" required style="flex:1 1 120px" aria-label="Категория"><select name="kind" aria-label="Тип">${opt("expense", "расход", true)}${opt("income", "доход")}</select><button class="btn btn-sm" type="submit">Добавить</button></form>` : `<p class="muted small">${activeCats.length} категорий в ${groups.length} группах.</p>`}
  </section>`;
};

/* ===== Цели ===== */
function goalProgress(g) {
  const src = g.source || "";
  if (src.startsWith("count:")) { const id = src.slice(6); return monthDays(g.month).filter(d => isOn(d, id)).length; }
  if (src.startsWith("time:") || src.startsWith("pairs:")) { const it = get("items", src.split(":")[1]); return it ? monthDays(g.month).reduce((a, d) => a + (active(it, d) ? durVal(d, it) : 0), 0) : 0; }
  if (src.startsWith("fin:")) { const ids = new Set(src.slice(4).split(",")); return all("finOps").filter(o => mkey(o.date) === g.month && ids.has(o.catId)).reduce((a, o) => a + o.amount, 0); }
  return g.progress;
}
// Как в условном форматировании таблицы: число сравнивается с числом из цели, любой текст = выполнено.
function goalOk(g, p) {
  if (g.done) return true;
  const digits = String(g.target).replace(/[^0-9]/g, "");
  let n = typeof p === "number" ? p : toNum(p);
  if (/^(time|pairs):/.test(g.source || "") && typeof p === "number") n = p / 60; // время сравниваем в часах
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
      <div class="row" style="justify-content:flex-end">${auto ? `<span class="gp" title="Считается автоматически">${typeof p === "number" ? (srcType === "fin" ? money(p) : srcType === "time" || srcType === "pairs" ? fmtMin(p) : fnum(p, 1)) : esc(p)}</span>` : `<input type="text" data-chg="goal" data-id="${g.id}" data-f="progress" value="${esc(g.progress)}" placeholder="прогресс" style="width:8em" aria-label="Прогресс">`}
        <button type="button" class="icon" data-act="editGoal" data-id="${ed ? "" : g.id}" aria-label="Настроить">⋯</button></div>
      ${ed ? `<div class="edit" style="grid-column:1/-1">
        <div class="row"><input type="text" data-chg="goal" data-id="${g.id}" data-f="name" value="${esc(g.name)}" style="flex:1 1 160px" aria-label="Название"><input type="text" data-chg="goal" data-id="${g.id}" data-f="target" value="${esc(g.target)}" style="flex:1 1 160px" placeholder="Цель" aria-label="Цель"><input type="text" list="gsecs" data-chg="goal" data-id="${g.id}" data-f="section" value="${esc(g.section)}" style="width:10em" placeholder="Раздел" aria-label="Раздел"></div>
        <label>Прогресс<select data-chg="goalSrcType" data-id="${g.id}">${opt("", "вручную", !srcType)}${opt("count", "дни с галочкой в строке трекера", srcType === "count")}${opt("time", "сумма времени по строке трекера (цель в часах)", srcType === "time" || srcType === "pairs")}${opt("fin", "сумма по категориям финансов", srcType === "fin")}</select></label>
        ${srcType === "count" || srcType === "time" || srcType === "pairs" ? `<select data-chg="goalSrc" data-id="${g.id}" data-t="${srcType === "pairs" ? "time" : srcType}">${its.filter(i => srcType === "count" ? i.type === "check" : i.type === "duration").map(i => opt(i.id, i.name, g.source.split(":")[1] === i.id)).join("")}</select>` : ""}
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
  return `<div class="bar"><h2>Настройки и база</h2></div>${scriptBanner()}
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

Object.assign(ACT, {
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
});
Object.assign(CHG, {
  finCatPick: el => { U.finCat = el.value; U.finSign = null; const keep = $("[data-form=addOp]") ? Object.fromEntries(new FormData($("[data-form=addOp]"))) : {}; render(); const f = $("[data-form=addOp]"); if (f) { f.elements.date.value = keep.date || today(); f.elements.amount.value = keep.amount || ""; f.elements.note.value = keep.note || ""; } },
  cat: el => { const f = el.dataset.f; if (f === "budget") { const n = toNum(el.value); return patch("finCats", el.dataset.id, {budget: n == null || n <= 0 ? null : Math.abs(n)}); } patch("finCats", el.dataset.id, {[f]: el.type === "checkbox" ? el.checked : el.value.trim()}); },
  goal: el => patch("goals", el.dataset.id, {[el.dataset.f]: el.type === "checkbox" ? el.checked : el.value.trim()}),
  goalSrc: el => patch("goals", el.dataset.id, {source: el.dataset.t + ":" + el.value}),
  goalFinCat: el => { const g = get("goals", el.dataset.id); const ids = new Set(g.source.slice(4).split(",").filter(Boolean)); el.checked ? ids.add(el.dataset.c) : ids.delete(el.dataset.c); patch("goals", g.id, {source: "fin:" + [...ids].join(",")}); },
  weekly: el => { const id = el.dataset.w + "|" + el.dataset.id; el.checked ? put("weeklyDone", {id, week: el.dataset.w, itemId: el.dataset.id, done: true}) : del("weeklyDone", id); },
  trig: el => patch("triggers", el.dataset.id, {done: el.checked}),
  wish: el => patch("wishes", el.dataset.id, {done: el.checked}),
  goalSrcType: el => {
    const t = el.value, g = get("goals", el.dataset.id);
    const first = t === "count" ? items().find(i => i.type === "check") : t === "time" ? items().find(i => i.type === "duration") : null;
    patch("goals", g.id, {source: !t ? "" : t === "fin" ? "fin:" : t + ":" + (first?.id || "")});
  },
  importJson: el => {
    const f = el.files[0]; if (!f) return;
    f.text().then(txt => {
      const j = JSON.parse(txt); if (!j || !j.data) throw new Error("Это не файл резервной копии трекера.");
      batch(() => { for (const c in SCHEMA) if (Array.isArray(j.data[c])) for (const r of j.data[c]) if (r && r.id) put(c, r); });
      toast("Данные восстановлены из файла");
    }).catch(e => toast("Не удалось прочитать файл: " + e.message, 6000));
  },
});
Object.assign(FORM, {
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
});

/** бюджеты: лимит на категорию в месяц, сколько потрачено и сколько осталось */
function budgetsHtml(mk, byCat, catOf) {
  const cats = all("finCats").filter(c => !c.archived && c.budget > 0).sort(byOrder);
  if (!cats.length) return `<section class="panel"><div class="bar"><h3>Бюджеты</h3><span class="muted small">Задайте лимит на месяц в «Категории → Изменить», и здесь появится остаток.</span></div></section>`;
  const [y, m] = mk.split("-").map(Number), dim = new Date(y, m, 0).getDate(), isCur = mk === mkey(today());
  const dayN = isCur ? parts(today())[2] : dim, pace = dayN / dim;
  return `<section class="panel"><div class="bar"><h3>Бюджеты</h3><span class="muted small">${isCur ? "прошло " + Math.round(pace * 100) + "% месяца" : ""}</span></div>
    <div class="budgets">${cats.map(c => {
      const spent = Math.max(0, -(byCat[c.id] || 0)), left = c.budget - spent, share = spent / c.budget;
      const st = share > 1 ? "over" : share > pace + 0.1 ? "warn" : "ok";
      return `<div class="bud ${st}"><div class="li"><span>${esc(c.name)}</span><span class="num">${money(-spent).replace("−", "")} / ${Math.round(c.budget).toLocaleString("ru-RU")} ₽</span></div>
        <span class="bbar"><i style="width:${Math.min(100, share * 100).toFixed(1)}%"></i>${isCur ? `<s style="left:${(pace * 100).toFixed(1)}%" data-tip="Сегодняшняя точка месяца"></s>` : ""}</span>
        <div class="small ${left < 0 ? "neg" : "muted"}">${left >= 0 ? "осталось " + Math.round(left).toLocaleString("ru-RU") + " ₽" + (isCur && dim - dayN > 0 ? " · " + Math.round(left / (dim - dayN + 1)).toLocaleString("ru-RU") + " ₽ в день" : "") : "перерасход " + Math.round(-left).toLocaleString("ru-RU") + " ₽"}</div></div>`;
    }).join("")}</div></section>`;
}
