"use strict";
/* Еда: рецепты и продукты с общей нумерацией. В трекере в приёме пищи пишется номер и время. */

function recipeUsage() {
  const meals = new Set(all("items").filter(i => i.type === "meal").map(i => i.id));
  const u = {};
  for (const e of all("entries")) {
    if (!meals.has(e.itemId)) continue;
    const p = parseFoodCode(mealParts(e.value).num); if (!p) continue; const num = p.code;
    const x = u[num] = u[num] || {n: 0, last: ""};
    x.n++; if (e.date > x.last) x.last = e.date;
  }
  return u;
}
const sameKind = (r, product) => (r.kind === "product") === !!product;
const nextRecipeNum = product => all("recipes").filter(r => sameKind(r, product)).reduce((m, r) => Math.max(m, r.num || 0), 0) + 1;

const NUTR = [["kcal", "Калории", "ккал"], ["prot", "Белки", "г"], ["fat", "Жиры", "г"], ["carb", "Углеводы", "г"], ["sugar", "в т. ч. сахара", "г"]];
const isProduct = r => r.kind === "product";
function nutrTable(r) {
  const pack = toNum(r.pack), u = r.unit || "г";
  const rows = NUTR.filter(([k]) => r[k] !== "" && r[k] != null);
  if (!rows.length) return "";
  return `<table class="ntab"><thead><tr><th></th><th>на 100 ${esc(u)}</th>${pack ? `<th>на упаковку ${fnum(pack)} ${esc(u)}</th>` : ""}</tr></thead><tbody>
    ${rows.map(([k, l, unit]) => { const v = toNum(r[k]); return `<tr><td>${l}</td><td class="num">${fnum(v, 2)} ${unit}</td>${pack ? `<td class="num">${fnum(v * pack / 100, 1)} ${unit}</td>` : ""}</tr>`; }).join("")}</tbody></table>`;
}
VIEWS.recipes = () => {
  const q = (U.recipeQ || "").toLowerCase().trim(), mode = U.foodMode === "products" ? "products" : "recipes";
  const use = recipeUsage();
  let list = recipesSorted().filter(r => mode === "products" ? isProduct(r) : !isProduct(r));
  if (q) list = list.filter(r => String(r.num) === q || foodCode(r).toLowerCase() === q || [r.name, r.short, r.cat, r.ingredients, r.notes, r.extra].join(" ").toLowerCase().includes(q));
  const pre = U.newRecipeNum;
  const field = (r, f, label, type = "text", attrs = "") => `<label${type !== "text" ? ` style="width:7.5em"` : ""}>${label}<input type="${type === "dec" ? "text" : type}" ${type === "dec" ? `inputmode="decimal"` : ""} data-chg="recipe" data-id="${r.id}" data-f="${f}" value="${esc(r[f])}" ${attrs}></label>`;
  const delRow = r => `<div class="row">${U.delRecipe === r.id ? `<span>Удалить? Записи в трекере останутся с номером.</span><button type="button" class="btn btn-sm btn-danger" data-act="delRecipeYes" data-id="${r.id}">Удалить</button><button type="button" class="btn btn-sm" data-act="delRecipeNo">Отмена</button>` : `<button type="button" class="btn btn-sm btn-danger" data-act="delRecipe" data-id="${r.id}">Удалить</button>`}<button type="button" class="btn btn-sm" data-act="editRecipe" data-id="">Готово</button></div>`;
  const card = r => {
    const ed = U.editRecipe === r.id, u = use[foodCode(r)], prod = isProduct(r);
    const head = `<div class="li" style="align-items:flex-start">
        <div style="min-width:0;flex:1"><div class="row" style="gap:10px"><span class="rnum num">№${esc(r.num)}</span><h3 style="overflow-wrap:anywhere">${esc(r.name)}</h3></div>
        <div class="small">${r.short ? `<b>${esc(r.short)}</b> ` : ""}<span class="chip">${foodType(r) === "напиток" ? "напиток" : "еда"}</span>${r.cat ? ` <span class="chip">${esc(r.cat)}</span>` : ""}</div><div class="small muted">${prod && toNum(r.pack) ? `упаковка ${fnum(toNum(r.pack))} ${esc(r.unit || "г")} · ` : ""}${u ? `${prod ? "отмечено" : "ели"} ${u.n} раз · последний раз ${short(u.last)}` : prod ? "ещё не отмечали" : "ещё не ели"}</div></div>
        <button type="button" class="icon" data-act="editRecipe" data-id="${ed ? "" : r.id}" aria-label="${ed ? "Готово" : "Изменить"}">${ed ? "✓" : "✎"}</button></div>`;
    if (prod) return `<article class="panel recipe">${head}
      ${ed ? `<div class="edit">
        <div class="row">${field(r, "num", "№", "number", `min="1" step="1"`)}<label style="flex:1 1 200px">Название<input type="text" data-chg="recipe" data-id="${r.id}" data-f="name" value="${esc(r.name)}"></label></div>
        <div class="row"><label style="flex:1 1 160px">Сокращённое название<input type="text" data-chg="recipe" data-id="${r.id}" data-f="short" value="${esc(r.short)}" maxlength="24"></label><label style="flex:1 1 140px">Категория<input type="text" list="pcats" data-chg="recipe" data-id="${r.id}" data-f="cat" value="${esc(r.cat)}" placeholder="энергетик, йогурт…"></label><label style="width:9em">Тип<select data-chg="recipe" data-id="${r.id}" data-f="ftype">${opt("еда", "Еда", foodType(r) !== "напиток")}${opt("напиток", "Напиток", foodType(r) === "напиток")}</select></label></div>
        <div class="row">${field(r, "pack", "Упаковка", "dec")}<label style="width:6em">Ед.<select data-chg="recipe" data-id="${r.id}" data-f="unit">${opt("г", "г", r.unit !== "мл")}${opt("мл", "мл", r.unit === "мл")}</select></label></div>
        <div class="label">На 100 ${esc(r.unit || "г")}</div>
        <div class="row">${NUTR.map(([k, l]) => field(r, k, l, "dec")).join("")}</div>
        <label>Активные вещества, витамины<textarea data-chg="recipe" data-id="${r.id}" data-f="extra" rows="4">${esc(r.extra)}</textarea></label>
        <label>Состав<textarea data-chg="recipe" data-id="${r.id}" data-f="ingredients" rows="4">${esc(r.ingredients)}</textarea></label>
        <label>Заметки<textarea data-chg="recipe" data-id="${r.id}" data-f="notes" rows="2">${esc(r.notes)}</textarea></label>
        ${delRow(r)}</div>`
      : `${nutrTable(r)}
        ${r.extra ? `<div><div class="label">Активные вещества</div><div class="pre">${esc(r.extra)}</div></div>` : ""}
        ${r.ingredients ? `<details><summary class="label" style="cursor:pointer">Состав</summary><div class="pre small" style="margin-top:4px">${esc(r.ingredients)}</div></details>` : ""}
        ${r.notes ? `<div class="small muted pre">${esc(r.notes)}</div>` : ""}`}
    </article>`;
    return `<article class="panel recipe">${head}
      ${ed ? `<div class="edit">
        <div class="row">${field(r, "num", "№", "number", `min="1" step="1"`)}<label style="flex:1 1 200px">Название<input type="text" data-chg="recipe" data-id="${r.id}" data-f="name" value="${esc(r.name)}"></label></div>
        <div class="row"><label style="flex:1 1 160px">Сокращённое название<input type="text" data-chg="recipe" data-id="${r.id}" data-f="short" value="${esc(r.short)}" maxlength="24"></label><label style="width:9em">Тип<select data-chg="recipe" data-id="${r.id}" data-f="ftype">${opt("еда", "Еда", foodType(r) !== "напиток")}${opt("напиток", "Напиток", foodType(r) === "напиток")}</select></label></div>
        <label>Ингредиенты<textarea data-chg="recipe" data-id="${r.id}" data-f="ingredients" rows="4">${esc(r.ingredients)}</textarea></label>
        <label>Приготовление<textarea data-chg="recipe" data-id="${r.id}" data-f="steps" rows="5">${esc(r.steps)}</textarea></label>
        <label>Заметки<input type="text" data-chg="recipe" data-id="${r.id}" data-f="notes" value="${esc(r.notes)}" placeholder="ккал, порции, где купить…"></label>
        ${delRow(r)}</div>` : `${r.ingredients ? `<div><div class="label">Ингредиенты</div><div class="pre">${esc(r.ingredients)}</div></div>` : ""}
        ${r.steps ? `<div><div class="label">Приготовление</div><div class="pre">${esc(r.steps)}</div></div>` : ""}
        ${r.notes ? `<div class="small muted">${esc(r.notes)}</div>` : ""}`}
    </article>`;
  };
  const numInput = `<label class="row" style="gap:6px">№<input type="number" name="num" min="1" step="1" value="${esc(pre || nextRecipeNum(mode === "products"))}" style="width:6em" aria-label="Номер"></label>`;
  const form = mode === "products" ? `<section class="panel"><h3>Новый продукт</h3>
    <form class="form" data-form="addProduct" autocomplete="off" style="flex-direction:column;align-items:stretch">
      <div class="row">${numInput}<input type="text" name="name" placeholder="Название продукта" required style="flex:1 1 240px" aria-label="Название"></div>
      <div class="row"><input type="text" name="short" maxlength="24" placeholder="Сокращённое название (для списков в трекере)" style="flex:1 1 220px" aria-label="Сокращённое название"><input type="text" name="cat" list="pcats" placeholder="Категория: энергетик, йогурт…" style="flex:1 1 180px" aria-label="Категория"><select name="ftype" aria-label="Тип">${opt("еда", "Еда", true)}${opt("напиток", "Напиток")}</select></div>
      <div class="row"><label class="row" style="gap:6px">Упаковка<input type="text" name="pack" inputmode="decimal" style="width:6em" aria-label="Размер упаковки"></label><select name="unit" aria-label="Единица">${opt("г", "г", true)}${opt("мл", "мл")}</select></div>
      <div class="label">Пищевая ценность на 100 г или мл</div>
      <div class="row">${NUTR.map(([k, l]) => `<input type="text" name="${k}" inputmode="decimal" placeholder="${l}" style="width:8em" aria-label="${l}">`).join("")}</div>
      <textarea name="extra" rows="2" placeholder="Активные вещества, витамины (кофеин, таурин…)" aria-label="Активные вещества"></textarea>
      <textarea name="ingredients" rows="2" placeholder="Состав с упаковки" aria-label="Состав"></textarea>
      <input type="text" name="notes" placeholder="Заметки" aria-label="Заметки">
      <div><button class="btn btn-primary" type="submit">Добавить продукт</button></div>
    </form></section>`
  : `<section class="panel"><h3>Новый рецепт</h3>
    <form class="form" data-form="addRecipe" autocomplete="off" style="flex-direction:column;align-items:stretch">
      <div class="row">${numInput}<input type="text" name="name" placeholder="Название, например «Каша овсяная с бананом»" required style="flex:1 1 240px" aria-label="Название"></div>
      <div class="row"><input type="text" name="short" maxlength="24" placeholder="Сокращённое название (для списков в трекере)" style="flex:1 1 220px" aria-label="Сокращённое название"><select name="ftype" aria-label="Тип">${opt("еда", "Еда", true)}${opt("напиток", "Напиток")}</select></div>
      <textarea name="ingredients" rows="3" placeholder="Ингредиенты, по одному в строке" aria-label="Ингредиенты"></textarea>
      <textarea name="steps" rows="3" placeholder="Как готовить" aria-label="Приготовление"></textarea>
      <input type="text" name="notes" placeholder="Заметки: ккал, порции…" aria-label="Заметки">
      <div><button class="btn btn-primary" type="submit">Добавить рецепт</button></div>
    </form></section>`;
  return `<div class="bar"><h2>Еда</h2><div class="seg" role="group" aria-label="Раздел">
      <button type="button" data-act="foodMode" data-v="recipes" aria-pressed="${mode === "recipes"}">Рецепты</button>
      <button type="button" data-act="foodMode" data-v="products" aria-pressed="${mode === "products"}">Продукты</button></div>
    <input type="search" data-chg="recipeQ" value="${esc(U.recipeQ || "")}" placeholder="Поиск по названию, составу или №" style="flex:0 1 300px" aria-label="Поиск"></div>
  <p class="muted small" style="margin:-6px 0 0">У рецептов и продуктов своя нумерация. Тип «Еда» или «Напиток» решает, где показывать: еда — в «Приёме еды», напитки — в строках вроде «Энергетики» (там же работает фильтр по категории).</p>
  ${scriptBanner()}
  ${form}
  <datalist id="pcats">${[...new Set(all("recipes").map(r => r.cat).filter(Boolean))].map(c => opt(c, c)).join("")}</datalist>
  ${list.length ? `<div class="rgrid">${list.map(card).join("")}</div>` : `<p class="empty">${q ? "Ничего не найдено." : mode === "products" ? "Продуктов пока нет." : "Рецептов пока нет."}</p>`}`;
};

Object.assign(ACT, {
  newRecipe: el => { const p = parseFoodCode(el.dataset.num); U.newRecipeNum = p ? p.num : null; U.foodMode = p && p.kind === "product" ? "products" : "recipes"; U.tab = "recipes"; history.replaceState(null, "", "#recipes"); render(); window.scrollTo(0, 0); setTimeout(() => $("[data-form=addRecipe] [name=name], [data-form=addProduct] [name=name]")?.focus(), 0); },
  foodMode: el => { U.foodMode = el.dataset.v; U.editRecipe = null; saveUI(); render(); },
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
      const me = get("recipes", id);
      if (all("recipes").some(r => r.id !== id && r.num === n && sameKind(r, isProduct(me)))) { toast("Номер " + (isProduct(me) ? "П" : "") + n + " уже занят"); return render(); }
      return patch("recipes", id, {num: n});
    }
    patch("recipes", id, {[f]: f === "name" ? el.value.trim() : NUTR.some(([k]) => k === f) || f === "pack" ? (toNum(el.value) == null ? "" : String(toNum(el.value))) : el.value});
  },
  recipeQ: el => { U.recipeQ = el.value; render(); },
});
Object.assign(FORM, {
  addRecipe: f => {
    const name = fv(f, "name").trim(), num = Math.round(toNum(fv(f, "num")) || nextRecipeNum(false));
    if (!name) return;
    if (all("recipes").some(r => r.num === num && sameKind(r, false))) return toast("Номер " + num + " уже занят, выберите другой", 5000);
    put("recipes", {id: uid(), kind: "", ftype: fv(f, "ftype") || "еда", short: fv(f, "short").trim(), num, name, ingredients: fv(f, "ingredients"), steps: fv(f, "steps"), notes: fv(f, "notes").trim(), order: num});
    U.newRecipeNum = null;
    toast("Рецепт №" + num + " добавлен");
  },
  addProduct: f => {
    const name = fv(f, "name").trim(), num = Math.round(toNum(fv(f, "num")) || nextRecipeNum(true));
    if (!name) return;
    if (all("recipes").some(r => r.num === num && sameKind(r, true))) return toast("Продукт №" + num + " уже есть, выберите другой номер", 5000);
    const n = k => { const v = toNum(fv(f, k)); return v == null ? "" : String(v); };
    put("recipes", {id: uid(), kind: "product", num, name, short: fv(f, "short").trim(), cat: fv(f, "cat").trim(), ftype: fv(f, "ftype") || "еда", unit: fv(f, "unit"), pack: n("pack"), kcal: n("kcal"), prot: n("prot"), fat: n("fat"), carb: n("carb"), sugar: n("sugar"), extra: fv(f, "extra"), ingredients: fv(f, "ingredients"), steps: "", notes: fv(f, "notes").trim(), order: num});
    U.newRecipeNum = null;
    toast("Продукт №" + num + " добавлен");
  },
});
let rqT = null;
document.addEventListener("input", e => { if (e.target.matches("[data-chg=recipeQ]")) { clearTimeout(rqT); const v = e.target.value; rqT = setTimeout(() => { U.recipeQ = v; render(); const s = $("[data-chg=recipeQ]"); if (s) { s.focus(); s.setSelectionRange(v.length, v.length); } }, 250); } });
