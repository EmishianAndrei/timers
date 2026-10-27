"use strict";
/* Рецепты: у каждого блюда свой номер. В трекере в приёме пищи пишется номер блюда и время. */

function recipeUsage() {
  const meals = new Set(all("items").filter(i => i.type === "meal").map(i => i.id));
  const u = {};
  for (const e of all("entries")) {
    if (!meals.has(e.itemId)) continue;
    const {num} = mealParts(e.value); if (!num) continue;
    const x = u[num] = u[num] || {n: 0, last: ""};
    x.n++; if (e.date > x.last) x.last = e.date;
  }
  return u;
}
const nextRecipeNum = () => all("recipes").reduce((m, r) => Math.max(m, r.num || 0), 0) + 1;

VIEWS.recipes = () => {
  const q = (U.recipeQ || "").toLowerCase().trim();
  const use = recipeUsage();
  let list = recipesSorted();
  if (q) list = list.filter(r => String(r.num) === q || (r.name + " " + r.ingredients + " " + r.notes).toLowerCase().includes(q));
  const pre = U.newRecipeNum;
  const card = r => {
    const ed = U.editRecipe === r.id, u = use[String(r.num)];
    return `<article class="panel recipe">
      <div class="li" style="align-items:flex-start">
        <div style="min-width:0;flex:1"><div class="row" style="gap:10px"><span class="rnum num">№${esc(r.num)}</span><h3 style="overflow-wrap:anywhere">${esc(r.name)}</h3></div>
        <div class="small muted">${u ? `ели ${u.n} раз · последний раз ${short(u.last)}` : "ещё не ели"}</div></div>
        <button type="button" class="icon" data-act="editRecipe" data-id="${ed ? "" : r.id}" aria-label="${ed ? "Готово" : "Изменить"}">${ed ? "✓" : "✎"}</button></div>
      ${ed ? `<div class="edit">
        <div class="row"><label style="width:6em">№<input type="number" min="1" step="1" data-chg="recipe" data-id="${r.id}" data-f="num" value="${esc(r.num)}"></label>
          <label style="flex:1 1 200px">Название<input type="text" data-chg="recipe" data-id="${r.id}" data-f="name" value="${esc(r.name)}"></label></div>
        <label>Ингредиенты<textarea data-chg="recipe" data-id="${r.id}" data-f="ingredients" rows="4">${esc(r.ingredients)}</textarea></label>
        <label>Приготовление<textarea data-chg="recipe" data-id="${r.id}" data-f="steps" rows="5">${esc(r.steps)}</textarea></label>
        <label>Заметки<input type="text" data-chg="recipe" data-id="${r.id}" data-f="notes" value="${esc(r.notes)}" placeholder="ккал, порции, где купить…"></label>
        <div class="row">${U.delRecipe === r.id ? `<span>Удалить рецепт? Записи в трекере останутся с номером.</span><button type="button" class="btn btn-sm btn-danger" data-act="delRecipeYes" data-id="${r.id}">Удалить</button><button type="button" class="btn btn-sm" data-act="delRecipeNo">Отмена</button>` : `<button type="button" class="btn btn-sm btn-danger" data-act="delRecipe" data-id="${r.id}">Удалить</button>`}<button type="button" class="btn btn-sm" data-act="editRecipe" data-id="">Готово</button></div>
      </div>` : `${r.ingredients ? `<div><div class="label">Ингредиенты</div><div class="pre">${esc(r.ingredients)}</div></div>` : ""}
        ${r.steps ? `<div><div class="label">Приготовление</div><div class="pre">${esc(r.steps)}</div></div>` : ""}
        ${r.notes ? `<div class="small muted">${esc(r.notes)}</div>` : ""}`}
    </article>`;
  };
  return `<div class="bar"><h2>Рецепты</h2><input type="search" data-chg="recipeQ" value="${esc(U.recipeQ || "")}" placeholder="Поиск по названию, ингредиентам или №" style="flex:0 1 320px" aria-label="Поиск"></div>
  <section class="panel"><h3>Новый рецепт</h3>
    <form class="form" data-form="addRecipe" autocomplete="off" style="flex-direction:column;align-items:stretch">
      <div class="row"><label class="row" style="gap:6px">№<input type="number" name="num" min="1" step="1" value="${esc(pre || nextRecipeNum())}" style="width:6em" aria-label="Номер"></label>
        <input type="text" name="name" placeholder="Название, например «Каша овсяная с бананом»" required style="flex:1 1 240px" aria-label="Название"></div>
      <textarea name="ingredients" rows="3" placeholder="Ингредиенты, по одному в строке" aria-label="Ингредиенты"></textarea>
      <textarea name="steps" rows="3" placeholder="Как готовить" aria-label="Приготовление"></textarea>
      <input type="text" name="notes" placeholder="Заметки: ккал, порции…" aria-label="Заметки">
      <div><button class="btn btn-primary" type="submit">Добавить рецепт</button></div>
    </form>
    <p class="muted small">В трекере в «Приёме еды» пишется только номер блюда и время. Название подставится само.</p>
  </section>
  ${list.length ? `<div class="rgrid">${list.map(card).join("")}</div>` : `<p class="empty">${q ? "Ничего не найдено." : "Рецептов пока нет."}</p>`}`;
};

Object.assign(ACT, {
  newRecipe: el => { U.newRecipeNum = el.dataset.num; U.tab = "recipes"; history.replaceState(null, "", "#recipes"); render(); window.scrollTo(0, 0); setTimeout(() => $("[data-form=addRecipe] [name=name]")?.focus(), 0); },
  editRecipe: el => { U.editRecipe = el.dataset.id || null; U.delRecipe = null; render(); },
  delRecipe: el => { U.delRecipe = el.dataset.id; render(); },
  delRecipeNo: () => { U.delRecipe = null; render(); },
  delRecipeYes: el => { U.delRecipe = null; U.editRecipe = null; del("recipes", el.dataset.id); },
});
Object.assign(CHG, {
  recipe: el => {
    const f = el.dataset.f, id = el.dataset.id;
    if (f === "num") {
      const n = Math.round(toNum(el.value));
      if (!n || n < 1) { toast("Номер должен быть целым числом больше нуля"); return render(); }
      if (all("recipes").some(r => r.id !== id && r.num === n)) { toast("Номер " + n + " уже занят"); return render(); }
      return patch("recipes", id, {num: n});
    }
    patch("recipes", id, {[f]: f === "name" ? el.value.trim() : el.value});
  },
  recipeQ: el => { U.recipeQ = el.value; render(); },
});
Object.assign(FORM, {
  addRecipe: f => {
    const name = fv(f, "name").trim(), num = Math.round(toNum(fv(f, "num")) || nextRecipeNum());
    if (!name) return;
    if (all("recipes").some(r => r.num === num)) return toast("Номер " + num + " уже занят, выберите другой", 5000);
    put("recipes", {id: uid(), num, name, ingredients: fv(f, "ingredients"), steps: fv(f, "steps"), notes: fv(f, "notes").trim(), order: num});
    U.newRecipeNum = null;
    toast("Рецепт №" + num + " добавлен");
  },
});
let rqT = null;
document.addEventListener("input", e => { if (e.target.matches("[data-chg=recipeQ]")) { clearTimeout(rqT); const v = e.target.value; rqT = setTimeout(() => { U.recipeQ = v; render(); const s = $("[data-chg=recipeQ]"); if (s) { s.focus(); s.setSelectionRange(v.length, v.length); } }, 250); } });
