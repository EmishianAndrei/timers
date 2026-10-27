"use strict";
/* Задачи в стиле Google Tasks: списки (с группами), подзадачи, даты, звёзды, «Выполненные», перетаскивание. */

const ICON = {
  addTask: `<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" d="M20.5 11a8.5 8.5 0 1 1-4.2-7.33"/><path fill="none" stroke="currentColor" stroke-width="2" d="m7.5 11 3 3 6-6.5"/><path fill="none" stroke="currentColor" stroke-width="2" d="M19 14.5v7M15.5 18h7"/></svg>`,
  dots: `<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><circle cx="12" cy="5" r="2" fill="currentColor"/><circle cx="12" cy="12" r="2" fill="currentColor"/><circle cx="12" cy="19" r="2" fill="currentColor"/></svg>`,
  caret: `<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M7 10l5 5 5-5z" fill="currentColor"/></svg>`,
  caretR: `<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M10 7l5 5-5 5z" fill="currentColor"/></svg>`,
  star: `<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" d="m12 3.6 2.6 5.3 5.8.8-4.2 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.2-4.1 5.8-.8z"/></svg>`,
  starF: `<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="currentColor" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" d="m12 3.6 2.6 5.3 5.8.8-4.2 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.2-4.1 5.8-.8z"/></svg>`,
  circle: `<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path class="ck" fill="none" stroke="currentColor" stroke-width="2" d="m7.8 12.2 2.9 2.9 5.6-6"/></svg>`,
  checked: `<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="currentColor" d="m9.6 16.6-4.2-4.2 1.4-1.4 2.8 2.8 7.6-7.6 1.4 1.4z"/></svg>`,
  cal: `<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><rect x="4" y="5.5" width="16" height="14" rx="2" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M4 10h16M8 3.5v4M16 3.5v4" stroke="currentColor" stroke-width="1.8"/></svg>`,
  drag: `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">${[6, 12, 18].map(y => `<circle cx="9" cy="${y}" r="1.6" fill="currentColor"/><circle cx="15" cy="${y}" r="1.6" fill="currentColor"/>`).join("")}</svg>`,
  trash: `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.8" d="M5 7h14M10 7V4.5h4V7M7 7l1 13h8l1-13"/></svg>`,
  check: `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2.2" d="m5 12.5 4.5 4.5L19 7.5"/></svg>`,
  plus: `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path stroke="currentColor" stroke-width="2" d="M12 5v14M5 12h14"/></svg>`,
  x: `<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path stroke="currentColor" stroke-width="2" d="m6 6 12 12M18 6 6 18"/></svg>`,
};
const listsAll = () => all("lists").sort(byOrder);
const tasksOf = lid => all("tasks").filter(t => t.listId === lid);
const kidsOf = (id, pool) => pool.filter(t => t.parent === id).sort(byOrder);
function chipDate(d) {
  const t0 = today();
  if (d === t0) return "Сегодня"; if (d === shift(t0, 1)) return "Завтра"; if (d === shift(t0, -1)) return "Вчера";
  const [y, m, dd] = parts(d);
  return WD[dateOf(d).getDay()] + ", " + dd + " " + MONTHS_S[m - 1] + (y !== new Date().getFullYear() ? " " + y : "");
}
const chipCls = d => d < today() ? " over" : d === today() ? " today" : "";
function ensureList() {
  let cur = get("lists", U.list) || listsAll()[0];
  if (!cur) { cur = put("lists", {id: uid(), name: "Мои задачи", group: "", order: 0}); }
  U.list = cur.id; return cur;
}

VIEWS.tasks = () => {
  const ls = listsAll(), cur = get("lists", U.list) || ls[0];
  if (cur) U.list = cur.id;
  const ts = cur ? tasksOf(cur.id) : [];
  const open = ts.filter(t => !t.done);
  const done = ts.filter(t => t.done).sort((a, b) => (b.doneAt || "").localeCompare(a.doneAt || ""));
  const sort = U.taskSort || "my", t0 = today();
  const openIds = new Set(open.map(t => t.id));
  const newRow = parent => `<form class="gt-task edit gt-new${parent ? " sub" : ""}" data-form="gtNew" data-parent="${parent || ""}" autocomplete="off">
      <span class="gt-handle"></span><span class="gt-check" aria-hidden="true">${ICON.circle}</span>
      <div class="gt-main"><input name="title" class="gt-in-title" placeholder="Название" aria-label="Название задачи">
        <textarea name="notes" class="gt-in-notes" rows="1" placeholder="Подробности" aria-label="Подробности"></textarea>
        <div class="gt-editbar"><button type="button" class="gt-chip" data-act="gtPickDate">${ICON.cal}<span data-datelabel>Дата</span></button><input type="date" name="due" class="gt-date-input" data-chg="gtNewDue" tabindex="-1" aria-label="Срок"></div></div>
      <span class="gt-star"></span></form>`;
  const row = (t, sub) => {
    const ed = U.openTask === t.id, drag = sort === "my" && !ed && !U.adding;
    const kids = open.filter(k => k.parent === t.id).length;
    return `<div class="gt-task${ed ? " edit" : ""}${sub ? " sub" : ""}" data-tid="${t.id}" ${drag ? `draggable="true"` : ""}>
      <span class="gt-handle" aria-hidden="true">${sort === "my" ? ICON.drag : ""}</span>
      <button type="button" class="gt-check" data-act="gtDone" data-id="${t.id}" aria-label="Отметить как выполненную" data-tip="Отметить как выполненную">${ICON.circle}</button>
      <div class="gt-main" ${ed ? "" : `data-act="gtOpen" data-id="${t.id}"`}>
        ${ed ? `<input class="gt-in-title" data-chg="task" data-id="${t.id}" data-f="title" value="${esc(t.title)}" placeholder="Название" aria-label="Название задачи">
          <textarea class="gt-in-notes" data-chg="task" data-id="${t.id}" data-f="notes" rows="${Math.min(8, Math.max(1, (t.notes || "").split("\n").length))}" placeholder="Подробности" aria-label="Подробности">${esc(t.notes)}</textarea>
          <div class="gt-editbar"><button type="button" class="gt-chip${t.due ? chipCls(t.due) : ""}" data-act="gtPickDate">${ICON.cal}<span>${t.due ? chipDate(t.due) : "Дата"}</span></button>
            <input type="date" class="gt-date-input" data-chg="task" data-id="${t.id}" data-f="due" value="${esc(t.due)}" tabindex="-1" aria-label="Срок">
            ${t.due ? `<button type="button" class="icon sm" data-act="gtClearDue" data-id="${t.id}" aria-label="Убрать дату">${ICON.x}</button>` : ""}
            <span style="flex:1"></span>
            <span class="pop-anchor"><button type="button" class="icon" data-act="menu" data-m="task:${t.id}" aria-label="Ещё">${ICON.dots}</button>${U.menu === "task:" + t.id ? taskPop(t, open, kids) : ""}</span></div>`
        : `<div class="gt-title">${t.title ? esc(t.title) : `<span class="muted">Без названия</span>`}</div>
          ${t.notes ? `<div class="gt-notes">${esc(t.notes)}</div>` : ""}
          ${t.due ? `<span class="gt-chip sm${chipCls(t.due)}">${ICON.cal}${chipDate(t.due)}</span>` : ""}
          ${kids && sort !== "my" ? "" : ""}`}
      </div>
      <button type="button" class="gt-star${t.starred ? " on" : ""}" data-act="gtStar" data-id="${t.id}" aria-label="${t.starred ? "Убрать отметку" : "Пометить"}" data-tip="${t.starred ? "Убрать из помеченных" : "Пометить"}">${t.starred ? ICON.starF : ICON.star}</button>
    </div>`;
  };
  let body = "";
  if (sort === "my") {
    const tops = open.filter(t => !t.parent || !openIds.has(t.parent)).sort(byOrder);
    if (U.adding && !U.addingParent) body += newRow("");
    for (const p of tops) {
      body += row(p, false) + kidsOf(p.id, open).map(c => row(c, true)).join("");
      if (U.adding && U.addingParent === p.id) body += newRow(p.id);
    }
  } else if (sort === "date") {
    if (U.adding) body += newRow("");
    const groups = {}, order = [];
    const key = t => !t.due ? "~" : t.due < t0 ? "!" : t.due;
    open.slice().sort((a, b) => (a.due || "9999").localeCompare(b.due || "9999") || byOrder(a, b)).forEach(t => { const k = key(t); if (!groups[k]) { groups[k] = []; order.push(k); } groups[k].push(t); });
    order.sort((a, b) => a === "!" ? -1 : b === "!" ? 1 : a === "~" ? 1 : b === "~" ? -1 : a.localeCompare(b));
    for (const k of order) body += `<div class="gt-sec${k === "!" ? " over" : ""}">${k === "!" ? "Прошедшие" : k === "~" ? "Без даты" : chipDate(k)}</div>` + groups[k].map(t => row(t, false)).join("");
  } else {
    if (U.adding) body += newRow("");
    const st = open.filter(t => t.starred).sort((a, b) => b.updated - a.updated), rest = open.filter(t => !t.starred).sort(byOrder);
    if (st.length) body += `<div class="gt-sec">Помеченные</div>` + st.map(t => row(t, false)).join("");
    if (rest.length) body += `<div class="gt-sec">Остальные</div>` + rest.map(t => row(t, false)).join("");
  }
  if (!open.length && !U.adding) body += `<div class="gt-empty">${done.length ? "Все задачи выполнены. Отлично!" : "Задач пока нет. Нажмите «Добавить задачу»."}</div>`;
  const doneRow = t => `<div class="gt-task done" data-did="${t.id}">
      <span class="gt-handle"></span>
      <button type="button" class="gt-check on" data-act="gtUndone" data-id="${t.id}" aria-label="Отметить как невыполненную" data-tip="Отметить как невыполненную">${ICON.checked}</button>
      <div class="gt-main"><div class="gt-title">${esc(t.title) || "Без названия"}</div>
        ${t.notes ? `<div class="gt-notes">${esc(t.notes)}</div>` : ""}
        <div class="gt-meta">Выполнено: ${t.doneAt ? chipDate(dkey(new Date(t.doneAt))) : ""}</div></div>
      <button type="button" class="gt-star gt-trash" data-act="gtDel" data-id="${t.id}" aria-label="Удалить" data-tip="Удалить">${ICON.trash}</button></div>`;
  const lgroups = [...new Set(ls.map(l => l.group).filter(Boolean))];
  return `<div class="gt-wrap"><section class="gt" aria-label="Задачи">
    <div class="gt-top">
      <div class="gt-label">ЗАДАЧИ</div>
      <span class="pop-anchor"><button type="button" class="gt-listbtn" data-act="menu" data-m="lists" aria-haspopup="true">${esc(cur ? cur.name : "Мои задачи")}${ICON.caret}</button>${U.menu === "lists" ? listsPop(ls, cur) : ""}</span>
      ${cur && cur.group ? `<span class="gt-group">${esc(cur.group)}</span>` : ""}
    </div>
    <div class="gt-addrow"><button type="button" class="gt-add" data-act="gtAdd">${ICON.addTask}<span>Добавить задачу</span></button>
      <span class="pop-anchor"><button type="button" class="icon" data-act="menu" data-m="listMenu" aria-label="Действия со списком">${ICON.dots}</button>${U.menu === "listMenu" ? listMenuPop(cur, done) : ""}</span></div>
    <div class="gt-body">${body}</div>
    ${done.length ? `<div class="gt-donebox"><button type="button" class="gt-done-h${U.showDone ? " open" : ""}" data-act="gtShowDone">${ICON.caretR}<span>Выполненные (${done.length})</span></button>${U.showDone ? done.map(doneRow).join("") : ""}</div>` : ""}
  </section></div>
  <datalist id="lgroups">${lgroups.map(g => opt(g, g)).join("")}</datalist>
  ${U.modal ? modalHtml(U.modal, cur, ts) : ""}`;
};
function listsPop(ls, cur) {
  const groups = [...new Set(ls.map(l => l.group || ""))].sort((a, b) => (a === "") - (b === "") || a.localeCompare(b, "ru"));
  const openN = l => all("tasks").filter(t => t.listId === l.id && !t.done).length;
  return `<div class="pop" role="menu">${groups.map(g => `${g ? `<div class="pop-h">${esc(g)}</div>` : ""}${ls.filter(l => (l.group || "") === g).map(l => `<button type="button" class="pop-i" role="menuitem" data-act="pickList" data-id="${l.id}"><span class="pop-ic">${cur && l.id === cur.id ? ICON.check : ""}</span><span class="pop-t">${esc(l.name)}</span><span class="pop-n">${openN(l) || ""}</span></button>`).join("")}`).join("")}
    ${ls.length ? `<div class="pop-sep"></div>` : ""}<button type="button" class="pop-i" role="menuitem" data-act="modal" data-m="newList"><span class="pop-ic">${ICON.plus}</span><span class="pop-t">Создать список</span></button></div>`;
}
function listMenuPop(cur, done) {
  const s = U.taskSort || "my", it = (v, l) => `<button type="button" class="pop-i" role="menuitemradio" aria-checked="${s === v}" data-act="taskSort" data-v="${v}"><span class="pop-ic">${s === v ? ICON.check : ""}</span><span class="pop-t">${l}</span></button>`;
  return `<div class="pop right" role="menu"><div class="pop-h">Сортировка</div>${it("my", "Мой порядок")}${it("date", "Дата")}${it("star", "Недавно помеченные")}
    <div class="pop-sep"></div>
    <button type="button" class="pop-i" data-act="modal" data-m="renameList" ${cur ? "" : "disabled"}><span class="pop-ic"></span><span class="pop-t">Переименовать список</span></button>
    <button type="button" class="pop-i" data-act="modal" data-m="delList" ${cur ? "" : "disabled"}><span class="pop-ic"></span><span class="pop-t">Удалить список</span></button>
    <div class="pop-sep"></div>
    <button type="button" class="pop-i" data-act="gtClearDone" ${done.length ? "" : "disabled"}><span class="pop-ic"></span><span class="pop-t">Удалить все выполненные задачи</span></button></div>`;
}
function taskPop(t, open, kids) {
  const tops = open.filter(x => !x.parent).sort(byOrder), i = tops.findIndex(x => x.id === t.id);
  const canIndent = !t.parent && i > 0 && !kids && (U.taskSort || "my") === "my";
  const others = listsAll().filter(l => l.id !== t.listId);
  return `<div class="pop right" role="menu">
    ${!t.parent ? `<button type="button" class="pop-i" data-act="gtAddSub" data-id="${t.id}"><span class="pop-ic"></span><span class="pop-t">Добавить подзадачу</span></button>` : ""}
    ${canIndent ? `<button type="button" class="pop-i" data-act="gtIndent" data-id="${t.id}"><span class="pop-ic"></span><span class="pop-t">Сделать подзадачей</span></button>` : ""}
    ${t.parent ? `<button type="button" class="pop-i" data-act="gtOutdent" data-id="${t.id}"><span class="pop-ic"></span><span class="pop-t">Сделать обычной задачей</span></button>` : ""}
    <button type="button" class="pop-i" data-act="gtDel" data-id="${t.id}"><span class="pop-ic">${ICON.trash}</span><span class="pop-t">Удалить</span></button>
    ${others.length ? `<div class="pop-sep"></div><div class="pop-h">Переместить в список</div>${others.map(l => `<button type="button" class="pop-i" data-act="gtMoveList" data-id="${t.id}" data-l="${l.id}"><span class="pop-ic"></span><span class="pop-t">${esc(l.name)}</span></button>`).join("")}` : ""}
  </div>`;
}
function modalHtml(m, cur, ts) {
  const shell = (title, inner, ok, danger) => `<div class="modal-bg" data-act="modalBg"><form class="modal" data-form="gtModal" autocomplete="off" role="dialog" aria-modal="true" aria-label="${esc(title)}">
    <h3>${esc(title)}</h3>${inner}<div class="row" style="justify-content:flex-end"><button type="button" class="btn btn-flat" data-act="modalClose">Отмена</button><button type="submit" class="btn ${danger ? "btn-dangerfill" : "btn-flat-primary"}">${ok}</button></div></form></div>`;
  if (m === "delList") return shell("Удалить этот список?", `<p class="muted">Список «${esc(cur?.name)}» и все задачи в нём (${ts.length}) будут удалены.</p>`, "Удалить", true);
  const isNew = m === "newList";
  return shell(isNew ? "Создать список" : "Переименовать список",
    `<input name="name" value="${isNew ? "" : esc(cur?.name)}" placeholder="Название" required data-autofocus aria-label="Название списка">
     <input name="group" list="lgroups" value="${isNew ? "" : esc(cur?.group)}" placeholder="Группа (необязательно)" aria-label="Группа">`, "Готово");
}

// ---------- операции ----------
function createTask(listId, parent, title, notes, due) {
  const pool = tasksOf(listId).filter(t => !t.done && (t.parent || "") === (parent || ""));
  const order = parent ? nextOrder(pool) : pool.reduce((m, t) => Math.min(m, t.order ?? 0), 0) - 1; // новая задача — сверху, подзадача — в конец
  return put("tasks", {id: uid(), listId, parent: parent || "", title, notes: notes || "", due: due || "", done: false, doneAt: "", starred: false, order});
}
function restore(recs) { batch(() => recs.forEach(r => put("tasks", r))); }
function completeTask(id) {
  const t = get("tasks", id); if (!t) return;
  const now = new Date().toISOString(), kids = all("tasks").filter(k => k.parent === id && !k.done);
  const before = [t, ...kids].map(x => Object.assign({}, x));
  batch(() => { patch("tasks", id, {done: true, doneAt: now}); kids.forEach(k => patch("tasks", k.id, {done: true, doneAt: now})); });
  toast("Задача выполнена", 5000, {label: "Отменить", fn: () => restore(before)});
}
function deleteTask(id) {
  const t = get("tasks", id); if (!t) return;
  const recs = [t, ...all("tasks").filter(k => k.parent === id)].map(x => Object.assign({}, x));
  if (U.openTask === id) U.openTask = null;
  U.menu = null;
  batch(() => recs.forEach(r => del("tasks", r.id)));
  toast("Задача удалена", 5000, {label: "Отменить", fn: () => restore(recs)});
}
function moveTaskTo(id, targetId, after) {
  const t = get("tasks", id), target = get("tasks", targetId); if (!t || !target || id === targetId) return;
  const open = tasksOf(t.listId).filter(x => !x.done);
  let parent = target.parent || "";
  if (parent && open.some(k => k.parent === id)) { targetId = parent; parent = ""; after = true; } // задачу с подзадачами нельзя вложить
  if (parent === id) return;
  const sib = open.filter(x => (x.parent || "") === parent && x.id !== id).sort(byOrder);
  const idx = sib.findIndex(x => x.id === targetId);
  sib.splice(idx < 0 ? sib.length : idx + (after ? 1 : 0), 0, t);
  batch(() => sib.forEach((x, k) => { const p = {}; if (x.order !== k) p.order = k; if (x.id === id && (t.parent || "") !== parent) p.parent = parent; if (Object.keys(p).length) patch("tasks", x.id, p); }));
}
function commitNewRow() {
  const f = $("[data-form=gtNew]"); if (!f) return false;
  const title = fv(f, "title").trim();
  if (title) { createTask(ensureList().id, f.dataset.parent, title, fv(f, "notes"), fv(f, "due")); return true; }
  return false;
}

Object.assign(ACT, {
  menu: el => { U.menu = U.menu === el.dataset.m ? null : el.dataset.m; render(); },
  pickList: el => { U.list = el.dataset.id; U.menu = null; U.openTask = null; U.adding = null; saveUI(); render(); },
  taskSort: el => { U.taskSort = el.dataset.v; U.menu = null; saveUI(); render(); },
  modal: el => { U.modal = el.dataset.m; U.menu = null; render(); setTimeout(() => $("[data-autofocus]")?.focus(), 0); },
  modalClose: () => { U.modal = null; render(); },
  modalBg: (el, e) => { if (e.target === el) { U.modal = null; render(); } },
  gtAdd: () => { if (U.adding) commitNewRow(); U.adding = true; U.addingParent = null; U.openTask = null; U.menu = null; render(); setTimeout(() => $("[data-form=gtNew] [name=title]")?.focus(), 0); },
  gtAddSub: el => { U.adding = true; U.addingParent = el.dataset.id; U.openTask = null; U.menu = null; U.taskSort = "my"; render(); setTimeout(() => $("[data-form=gtNew] [name=title]")?.focus(), 0); },
  gtOpen: (el, e) => { if (U.adding) { commitNewRow(); U.adding = null; } U.openTask = el.dataset.id; U.menu = null; render(); setTimeout(() => { const i = $(`.gt-task[data-tid="${U.openTask}"] .gt-in-title`); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }, 0); },
  gtDone: el => { const row = el.closest(".gt-task"); row && row.classList.add("completing"); const id = el.dataset.id; setTimeout(() => { if (U.openTask === id) U.openTask = null; completeTask(id); }, 280); },
  gtUndone: el => { const t = get("tasks", el.dataset.id); batch(() => { patch("tasks", t.id, {done: false, doneAt: ""}); const p = t.parent && get("tasks", t.parent); if (p && p.done) patch("tasks", p.id, {done: false, doneAt: ""}); }); },
  gtStar: el => { const t = get("tasks", el.dataset.id); patch("tasks", t.id, {starred: !t.starred}); },
  gtDel: el => deleteTask(el.dataset.id),
  gtClearDue: el => patch("tasks", el.dataset.id, {due: ""}),
  gtPickDate: el => { const inp = el.parentElement.querySelector(".gt-date-input"); if (!inp) return; try { inp.showPicker(); } catch (e) { inp.focus(); inp.click(); } },
  gtShowDone: () => { U.showDone = !U.showDone; saveUI(); render(); },
  gtClearDone: () => {
    const recs = tasksOf(U.list).filter(t => t.done).map(x => Object.assign({}, x)); U.menu = null;
    batch(() => recs.forEach(r => del("tasks", r.id)));
    toast("Удалено выполненных: " + recs.length, 6000, {label: "Отменить", fn: () => restore(recs)});
  },
  gtIndent: el => {
    const t = get("tasks", el.dataset.id), tops = tasksOf(t.listId).filter(x => !x.done && !x.parent).sort(byOrder), i = tops.findIndex(x => x.id === t.id);
    if (i < 1) return; const p = tops[i - 1]; U.menu = null;
    patch("tasks", t.id, {parent: p.id, order: nextOrder(kidsOf(p.id, all("tasks").filter(x => !x.done)))});
  },
  gtOutdent: el => { const t = get("tasks", el.dataset.id), p = get("tasks", t.parent); U.menu = null; if (p) moveTaskTo(t.id, p.id, true); else patch("tasks", t.id, {parent: ""}); },
  gtMoveList: el => {
    const t = get("tasks", el.dataset.id), l = get("lists", el.dataset.l); U.menu = null; U.openTask = null;
    batch(() => { patch("tasks", t.id, {listId: l.id, parent: ""}); all("tasks").filter(k => k.parent === t.id).forEach(k => patch("tasks", k.id, {listId: l.id})); });
    toast("Перемещено в «" + l.name + "»");
  },
});
Object.assign(CHG, {
  task: el => {
    const f = el.dataset.f;
    patch("tasks", el.dataset.id, {[f]: f === "notes" ? el.value : el.value.trim()});
  },
  gtNewDue: el => { const s = el.closest("form").querySelector("[data-datelabel]"); if (s) s.textContent = el.value ? chipDate(el.value) : "Дата"; },
});
Object.assign(FORM, {
  gtNew: f => {
    if (!commitNewRow()) return;
    f.reset(); const s = f.querySelector("[data-datelabel]"); if (s) s.textContent = "Дата";
    setTimeout(() => $("[data-form=gtNew] [name=title]")?.focus(), 0);
  },
  gtModal: f => {
    const m = U.modal; U.modal = null;
    if (m === "delList") {
      const id = U.list;
      batch(() => { tasksOf(id).forEach(t => del("tasks", t.id)); del("lists", id); });
      U.list = listsAll()[0]?.id || ""; saveUI(); render(); return;
    }
    const name = fv(f, "name").trim(), group = fv(f, "group").trim(); if (!name) return render();
    if (m === "newList") { const l = put("lists", {id: uid(), name, group, order: nextOrder(all("lists"))}); U.list = l.id; saveUI(); }
    else patch("lists", U.list, {name, group});
    render();
  },
});

// клики вне меню / редактируемой задачи / новой строки закрывают их (как в Google Tasks)
document.addEventListener("click", e => {
  if (U.tab !== "tasks") return;
  let dirty = false;
  const actEl = e.target.closest("[data-act]");
  if (U.menu && !e.target.closest(".pop") && !(actEl && actEl.dataset.act === "menu")) { U.menu = null; dirty = true; }
  if (U.openTask && !e.target.closest(`.gt-task[data-tid="${U.openTask}"]`) && !e.target.closest(".pop") && !e.target.closest(".toast")) { U.openTask = null; dirty = true; }
  if (U.adding && !e.target.closest(".gt-new") && !(actEl && /^(gtAdd|gtAddSub)$/.test(actEl.dataset.act))) { commitNewRow(); U.adding = null; dirty = true; }
  if (dirty) { if (actEl) setTimeout(() => { if (!U.dragging) render(); }, 0); else render(); }
}, true);
document.addEventListener("keydown", e => {
  if (U.tab !== "tasks" || e.key !== "Escape") return;
  if (U.modal) { U.modal = null; return render(); }
  if (U.menu) { U.menu = null; return render(); }
  if (U.adding) { U.adding = null; return render(); }
  if (U.openTask) { document.activeElement?.blur(); U.openTask = null; return render(); }
});
// Enter в названии редактируемой задачи — закрыть редактирование
document.addEventListener("keydown", e => {
  if (e.key === "Enter" && !e.shiftKey && e.target.matches(".gt-task.edit:not(.gt-new) .gt-in-title")) { e.preventDefault(); e.target.blur(); U.openTask = null; render(); }
});
// авто-высота поля «Подробности»
document.addEventListener("input", e => { if (e.target.matches(".gt-in-notes")) { e.target.style.height = "auto"; e.target.style.height = e.target.scrollHeight + "px"; } });

// ---------- перетаскивание ----------
document.addEventListener("dragstart", e => {
  const row = e.target.closest && e.target.closest(".gt-task[draggable=true]"); if (!row) return;
  U.dragging = row.dataset.tid; e.dataTransfer.effectAllowed = "move";
  try { e.dataTransfer.setData("text/plain", row.dataset.tid); } catch (x) {}
  setTimeout(() => row.classList.add("dragging"), 0);
});
const clearDrop = () => document.querySelectorAll(".drop-before,.drop-after").forEach(x => x.classList.remove("drop-before", "drop-after"));
document.addEventListener("dragover", e => {
  if (!U.dragging) return;
  const row = e.target.closest && e.target.closest(".gt-task[data-tid]"); if (!row || row.dataset.tid === U.dragging) return;
  e.preventDefault(); e.dataTransfer.dropEffect = "move";
  const r = row.getBoundingClientRect(), after = e.clientY > r.top + r.height / 2;
  clearDrop(); row.classList.add(after ? "drop-after" : "drop-before");
});
document.addEventListener("drop", e => {
  if (!U.dragging) return;
  const row = e.target.closest && e.target.closest(".gt-task[data-tid]");
  e.preventDefault();
  const id = U.dragging; U.dragging = null;
  if (row && row.dataset.tid !== id) { const r = row.getBoundingClientRect(); moveTaskTo(id, row.dataset.tid, e.clientY > r.top + r.height / 2); }
  else render();
});
document.addEventListener("dragend", () => { if (!U.dragging) { clearDrop(); return; } U.dragging = null; clearDrop(); render(); });
