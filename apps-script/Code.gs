/**
 * Трекер — база данных в Google Таблице.
 *
 * Как установить (один раз):
 *  1. В таблице-базе: Расширения → Apps Script. Удалите всё в файле Code.gs и вставьте этот код.
 *  2. Впишите свой секретный ключ в SECRET ниже (любая длинная строка) и сохраните (Ctrl+S).
 *  3. Сверху выберите функцию setup и нажмите «Выполнить». Разрешите доступ к таблице и Диску.
 *     setup создаёт недостающие листы и ежедневную резервную копию таблицы в папку на Диске.
 *  4. «Начать развёртывание» → «Новое развёртывание» → тип «Веб-приложение».
 *     Запуск от имени: «Я». У кого есть доступ: «Все». Нажмите «Начать развёртывание».
 *  5. Скопируйте URL веб-приложения и вместе с ключом вставьте их в настройках сайта.
 *
 * После правки кода: «Начать развёртывание» → «Управление развёртываниями» → карандаш →
 * Версия: «Новая версия» → «Начать развёртывание». URL при этом не меняется.
 *
 * Расписание месяца: время таймеров и строк «время» из трекера само попадает на лист Main таблиц
 * из настройки scheduleSheets (ссылки на «Расписание Ноябрь» и т. п.) — в формате ч:мм.
 * Один раз после установки выберите функцию exportAll и нажмите «Выполнить»: она попросит доступ
 * к таблицам расписания и заполнит уже накопленное время.
 */

const SECRET = 'ВСТАВЬТЕ_СВОЙ_КЛЮЧ';
const BACKUP_FOLDER = 'Трекер — резервные копии';
const BACKUP_KEEP = 30;
const VERSION = 5; // сайт проверяет версию и подсказывает, если скрипт пора обновить

// Листы базы и их столбцы (как SCHEMA в js/core.js). Новые столбцы и листы создаются сами при первой записи.
const SCHEMA = {
  settings:   ['id', 'value', 'updated'],
  timers:     ['id', 'name', 'group', 'color', 'order', 'itemId', 'archived', 'runningSince', 'created', 'cdMin', 'cdAcc', 'cdRang', 'updated'],
  sessions:   ['id', 'timerId', 'date', 'start', 'end', 'minutes', 'updated'],
  sections:   ['id', 'name', 'order', 'total', 'updated'],
  items:      ['id', 'sectionId', 'name', 'type', 'options', 'role', 'order', 'from', 'to', 'remind', 'updated'],
  entries:    ['id', 'date', 'itemId', 'value', 'updated'],
  recipes:    ['id', 'kind', 'ftype', 'num', 'name', 'short', 'cat', 'unit', 'pack', 'kcal', 'prot', 'fat', 'carb', 'sugar', 'extra', 'ingredients', 'steps', 'notes', 'order', 'updated'],
  weekly:     ['id', 'name', 'order', 'archived', 'updated'],
  weeklyDone: ['id', 'week', 'itemId', 'done', 'updated'],
  goals:      ['id', 'month', 'section', 'name', 'target', 'progress', 'source', 'done', 'order', 'updated'],
  triggers:   ['id', 'trigger', 'action', 'done', 'order', 'updated'],
  skills:     ['id', 'category', 'name', 'order', 'updated'],
  wishes:     ['id', 'person', 'name', 'done', 'order', 'updated'],
  finCats:    ['id', 'group', 'name', 'kind', 'inTotal', 'budget', 'order', 'archived', 'updated'],
  finOps:     ['id', 'date', 'catId', 'amount', 'note', 'updated'],
  debts:      ['id', 'name', 'base', 'order', 'archived', 'updated'],
  debtOps:    ['id', 'debtId', 'date', 'amount', 'note', 'updated'],
  lists:      ['id', 'name', 'group', 'order', 'updated'],
  tasks:      ['id', 'listId', 'parent', 'title', 'notes', 'due', 'done', 'doneAt', 'starred', 'order', 'updated'],
};

function doGet() {
  return out({ ok: true, app: 'tracker', hint: 'Это адрес базы. Вставьте его в настройках сайта.' });
}

function doPost(e) {
  let req;
  try { req = JSON.parse(e.postData.contents); } catch (err) { return out({ ok: false, error: 'bad_json' }); }
  if (!SECRET || SECRET === 'ВСТАВЬТЕ_СВОЙ_КЛЮЧ') return out({ ok: false, error: 'no_secret' });
  if (req.key !== SECRET) return out({ ok: false, error: 'bad_key' });

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const hasOps = Array.isArray(req.ops) && req.ops.length > 0;
  // Чтение без записи не ждёт блокировку — так синхронизация не стоит в очереди за другим устройством.
  const lock = hasOps ? LockService.getScriptLock() : null;
  if (lock && !lock.tryLock(25000)) return out({ ok: false, error: 'busy' });
  let res, target = false;
  try {
    if (hasOps) target = exportDates(ss, req.ops); // какие дни расписания затронуты (смотрим до записи)
    const applied = hasOps ? applyOps(ss, req.ops) : 0;
    res = { ok: true, applied: applied, time: Date.now(), version: VERSION };
    if (req.pull) res.data = readAll(ss);
    if (req.filled) res.filled = filledOn(ss, String(req.filled)); // для напоминаний: что уже отмечено за день
  } catch (err) {
    return out({ ok: false, error: 'server', message: String(err && err.message || err) });
  } finally {
    if (lock) lock.releaseLock();
  }
  // Время → таблица расписания месяца. Ошибка здесь не ломает синхронизацию.
  if (req.exportAll) target = null;
  if (target !== false) {
    try { res.exported = exportSchedule(ss, target); }
    catch (err) { res.exportError = String(err && err.message || err); }
  }
  return out(res);
}

function out(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/** Возвращает лист коллекции, создаёт его с заголовками при отсутствии. */
function sheetFor(ss, name) {
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    const cols = SCHEMA[name] || ['id', 'updated'];
    sh.getRange(1, 1, 1, cols.length).setValues([cols]).setFontWeight('bold');
    sh.setFrozenRows(1);
    sh.getRange(1, 1, sh.getMaxRows(), sh.getMaxColumns()).setNumberFormat('@');
  }
  return sh;
}

function headersOf(sh) {
  const lastCol = sh.getLastColumn();
  if (!lastCol) return [];
  return sh.getRange(1, 1, 1, lastCol).getValues()[0].map(String);
}

function cell(v) {
  if (v === null || v === undefined) return '';
  if (v === true) return 'TRUE';
  if (v === false) return 'FALSE';
  if (typeof v === 'object') v = JSON.stringify(v);
  v = String(v);
  return /^[=+\-@]/.test(v) ? "'" + v : v; // не даём строке стать формулой
}

function plain(v, tz) {
  if (v instanceof Date) return Utilities.formatDate(v, tz, 'yyyy-MM-dd');
  if (v === true) return 'TRUE';
  if (v === false) return 'FALSE';
  return String(v);
}

/**
 * ops: [{c: 'tasks', op: 'put', r: {...}} | {c: 'tasks', op: 'del', id: '...'}]
 * Лист читается одним запросом, а записываются только изменённые строки — это в разы быстрее,
 * чем переписывать весь лист при каждой галочке.
 */
function applyOps(ss, ops) {
  const byCol = {};
  ops.forEach(function (o) {
    if (!o || !o.c || !/^[A-Za-z][A-Za-z0-9]{0,40}$/.test(o.c)) return;
    (byCol[o.c] = byCol[o.c] || []).push(o);
  });
  let applied = 0;
  const tz = ss.getSpreadsheetTimeZone();
  Object.keys(byCol).forEach(function (name) {
    const sh = sheetFor(ss, name);
    const all = sh.getDataRange().getValues();
    const headers = (all[0] || []).map(String);
    while (headers.length && !headers[headers.length - 1]) headers.pop();
    const width0 = headers.length;
    const rows = all.slice(1).map(function (r) { return r.slice(0, Math.max(width0, 1)).map(function (v) { return plain(v, tz); }); });
    const n0 = rows.length;
    const idCol = headers.indexOf('id');
    const updCol = headers.indexOf('updated');
    const index = {};
    rows.forEach(function (r, i) { if (r[idCol]) index[r[idCol]] = i; });
    const dead = {}, touched = {};

    byCol[name].forEach(function (o) {
      if (o.op === 'del') {
        if (o.id in index && !dead[index[o.id]]) { dead[index[o.id]] = true; applied++; }
        return;
      }
      const rec = o.r;
      if (!rec || !rec.id) return;
      Object.keys(rec).forEach(function (k) {
        if (headers.indexOf(k) < 0 && /^[A-Za-z][A-Za-z0-9]{0,40}$/.test(k)) headers.push(k);
      });
      const i = index[rec.id];
      if (i !== undefined && !dead[i]) {
        const cur = Number(rows[i][updCol] || 0);
        if (cur > Number(rec.updated || 0)) return; // на сервере более свежая версия
        headers.forEach(function (h, j) { if (h in rec) rows[i][j] = cell(rec[h]); });
        touched[i] = true;
      } else {
        index[rec.id] = rows.length;
        rows.push(headers.map(function (h) { return h in rec ? cell(rec[h]) : ''; }));
      }
      applied++;
    });

    const W = headers.length;
    rows.forEach(function (r) { while (r.length < W) r.push(''); });
    if (W > width0) {
      sh.getRange(1, 1, 1, W).setValues([headers]).setFontWeight('bold');
      if (sh.getMaxColumns() >= W) sh.getRange(1, width0 + 1, sh.getMaxRows(), W - width0).setNumberFormat('@');
    }
    const deadList = Object.keys(dead).map(Number);
    const upd = Object.keys(touched).map(Number).filter(function (i) { return i < n0 && !dead[i]; });

    if (deadList.length > 15 || upd.length > 40) {
      // много изменений — проще переписать лист целиком
      const keep = rows.filter(function (r, i) { return !dead[i]; });
      if (n0) sh.getRange(2, 1, n0, Math.max(W, sh.getLastColumn())).clearContent();
      if (keep.length) {
        if (sh.getMaxRows() < keep.length + 1) sh.insertRowsAfter(sh.getMaxRows(), keep.length + 1 - sh.getMaxRows());
        const rng = sh.getRange(2, 1, keep.length, W);
        rng.setNumberFormat('@');
        rng.setValues(keep);
      }
      return;
    }
    // 1) изменённые строки — на месте
    upd.forEach(function (i) { sh.getRange(i + 2, 1, 1, W).setValues([rows[i]]); });
    // 2) новые строки — одним блоком в конец
    const added = rows.slice(n0).filter(function (r, k) { return !dead[n0 + k]; });
    if (added.length) {
      const at = n0 + 2;
      if (sh.getMaxRows() < at + added.length - 1) sh.insertRowsAfter(sh.getMaxRows(), at + added.length - 1 - sh.getMaxRows());
      const rng = sh.getRange(at, 1, added.length, W);
      rng.setNumberFormat('@');
      rng.setValues(added);
    }
    // 3) удалённые — снизу вверх, чтобы номера строк не съезжали
    deadList.filter(function (i) { return i < n0; }).sort(function (a, b) { return b - a; })
      .forEach(function (i) { sh.deleteRow(i + 2); });
  });
  return applied;
}

/** Все коллекции: каждый лист читается одним запросом. */
function readAll(ss) {
  const tz = ss.getSpreadsheetTimeZone();
  const data = {};
  ss.getSheets().forEach(function (sh) {
    const name = sh.getName();
    if (!SCHEMA[name] && String(sh.getRange(1, 1).getValue()) !== 'id') return; // любой лист с первым столбцом id — тоже коллекция
    const all = sh.getDataRange().getValues();
    const headers = (all[0] || []).map(String);
    const list = [];
    for (let i = 1; i < all.length; i++) {
      const r = all[i], rec = {};
      for (let j = 0; j < headers.length; j++) if (headers[j]) rec[headers[j]] = plain(r[j], tz);
      if (rec.id) list.push(rec);
    }
    data[name] = list;
  });
  return data;
}

/** Записи трекера за один день: {itemId: value}. Нужно уведомлениям, чтобы не напоминать о том, что уже отмечено. */
function filledOn(ss, date) {
  const sh = ss.getSheetByName('entries');
  if (!sh) return {};
  const tz = ss.getSpreadsheetTimeZone();
  const all = sh.getDataRange().getValues();
  const h = (all[0] || []).map(String), di = h.indexOf('date'), ii = h.indexOf('itemId'), vi = h.indexOf('value');
  const res = {};
  for (let i = 1; i < all.length; i++) {
    if (plain(all[i][di], tz) === date && all[i][vi] !== '') res[String(all[i][ii])] = plain(all[i][vi], tz);
  }
  return res;
}

/* ================= Расписание месяца ================= */
const SCHEDULE_TAB = 'Main';
const normName = function (v) { return String(v == null ? '' : v).toLowerCase().replace(/\s+/g, ' ').trim(); };

/** Таблицы расписания: настройка scheduleSheets — ссылки или ID через пробел, запятую или с новой строки. */
function scheduleIds(ss) {
  const rec = tableOf(ss, 'settings').filter(function (r) { return String(r.id) === 'scheduleSheets'; })[0];
  if (!rec) return [];
  return String(rec.value || '').split(/[\s,;]+/).map(function (x) {
    const m = /\/d\/([A-Za-z0-9_-]{20,})/.exec(x);
    return m ? m[1] : (/^[A-Za-z0-9_-]{20,}$/.test(x) ? x : '');
  }).filter(Boolean);
}

function tableOf(ss, name) {
  const sh = ss.getSheetByName(name);
  if (!sh) return [];
  const all = sh.getDataRange().getValues(), h = (all[0] || []).map(String), list = [];
  for (let i = 1; i < all.length; i++) {
    const o = {};
    for (let j = 0; j < h.length; j++) if (h[j]) o[h[j]] = all[i][j];
    if (o.id !== '' && o.id != null) list.push(o);
  }
  return list;
}

/** Какие дни пересчитать: Set дат, null — все, false — ничего (галочки и прочее расписание не трогают). */
function exportDates(ss, ops) {
  const rel = ops.filter(function (o) { return o && (o.c === 'sessions' || o.c === 'entries'); });
  if (!rel.length) return false;
  let dur = null;
  const days = {};
  let any = false;
  for (let k = 0; k < rel.length; k++) {
    const o = rel[k];
    if (o.c === 'sessions') {
      if (o.op === 'del' || !o.r || !o.r.date) return null; // дата удалённой сессии неизвестна — пересчитаем всё
      days[String(o.r.date)] = 1; any = true;
    } else {
      if (!dur) { dur = {}; tableOf(ss, 'items').forEach(function (it) { if (String(it.type) === 'duration') dur[String(it.id)] = 1; }); }
      const id = o.op === 'del' ? String(o.id || '') : String(o.r && o.r.id || '');
      const parts = id.split('|');
      if (parts.length === 2 && dur[parts[1]]) { days[parts[0]] = 1; any = true; }
    }
  }
  return any ? Object.keys(days) : false;
}

/** Минуты по строкам: таймер, привязанный к строке трекера, — в эту строку, иначе — в строку с названием таймера.
 *  Если время строки вписано на сайте вручную, берётся оно (как в трекере). */
function scheduleMinutes(ss) {
  const tz = ss.getSpreadsheetTimeZone();
  const dur = {}, secName = {};
  tableOf(ss, 'sections').forEach(function (x) { secName[String(x.id)] = String(x.name || ''); });
  tableOf(ss, 'items').forEach(function (it) { if (String(it.type) === 'duration') dur[String(it.id)] = it; });
  const rows = {};
  const row = function (label, section) { const k = normName(label); if (!k) return null; return rows[k] = rows[k] || { label: String(label).trim(), section: section || 'Личное', auto: {}, manual: {} }; };
  Object.keys(dur).forEach(function (id) { row(dur[id].name, secName[String(dur[id].sectionId)]); });
  const byTimer = {};
  tableOf(ss, 'timers').forEach(function (t) { const it = dur[String(t.itemId)]; byTimer[String(t.id)] = it ? row(it.name) : row(t.name, 'Личное'); });
  tableOf(ss, 'sessions').forEach(function (x) {
    const r = byTimer[String(x.timerId)]; if (!r) return;
    const m = (Number(x.end) - Number(x.start)) / 60000, d = plain(x.date, tz);
    if (m > 0) r.auto[d] = (r.auto[d] || 0) + m;
  });
  tableOf(ss, 'entries').forEach(function (x) {
    const it = dur[String(x.itemId)]; if (!it) return;
    const v = String(x.value).replace(',', '.');
    if (v !== '' && !isNaN(Number(v))) row(it.name).manual[plain(x.date, tz)] = Number(v);
  });
  return rows;
}
function minutesOn(r, d) { return d in r.manual ? r.manual[d] : (r.auto[d] || 0); }

/** «1:30» → 90, пусто → 0, иное → NaN */
function hmToMin(s) {
  s = String(s || '').trim();
  if (!s) return 0;
  const m = /^(\d+):(\d\d)(?::\d\d)?$/.exec(s);
  return m ? Number(m[1]) * 60 + Number(m[2]) : NaN;
}
function dateKey(v, tz) {
  if (v instanceof Date) return Utilities.formatDate(v, tz, 'yyyy-MM-dd');
  if (typeof v === 'number' && v > 30000) return Utilities.formatDate(new Date(Math.round((v - 25569) * 864e5)), 'UTC', 'yyyy-MM-dd');
  return '';
}

/** Пишет время в таблицы расписания. days — массив дат или null (все даты листа). */
function exportSchedule(ss, days) {
  const ids = scheduleIds(ss);
  if (!ids.length) return { sheets: 0, cells: 0 };
  const rows = scheduleMinutes(ss);
  const want = days ? days.reduce(function (o, d) { o[d] = 1; return o; }, {}) : null;
  let cells = 0, added = [];
  ids.forEach(function (id) {
    const book = SpreadsheetApp.openById(id), sh = book.getSheetByName(SCHEDULE_TAB);
    if (!sh) return;
    const tz = book.getSpreadsheetTimeZone();
    let all = sh.getDataRange().getValues();
    const cols = {};
    (all[1] || []).forEach(function (v, j) { if (j < 2) return; const d = dateKey(v, tz); if (d && (!want || want[d])) cols[d] = j; });
    const dlist = Object.keys(cols);
    if (!dlist.length) return;
    const index = function () { const m = {}; all.forEach(function (r, i) { const k = normName(r[1]); if (k && !(k in m)) m[k] = i; }); return m; };
    let idx = index();
    Object.keys(rows).forEach(function (k) {
      if (k in idx) return;
      if (!dlist.some(function (d) { return Math.round(minutesOn(rows[k], d)) > 0; })) return;
      addScheduleRow(sh, all, rows[k].label, rows[k].section);
      added.push(rows[k].label);
      all = sh.getDataRange().getValues(); idx = index();
    });
    const shown = sh.getDataRange().getDisplayValues();
    Object.keys(rows).forEach(function (k) {
      if (!(k in idx)) return;
      const i = idx[k];
      dlist.forEach(function (d) {
        const m = Math.round(minutesOn(rows[k], d)), j = cols[d];
        if (hmToMin(shown[i][j]) === m) return; // уже так
        const c = sh.getRange(i + 1, j + 1);
        if (m > 0) c.setNumberFormat('[h]:mm').setValue(m / 1440); else c.clearContent();
        cells++;
      });
    });
  });
  return { sheets: ids.length, cells: cells, added: added };
}

/**
 * Строка для таймера или строки трекера, которой нет в расписании: в её раздел (столбец A — название раздела,
 * конец раздела — строка «Всего …»). Сначала занимается пустая строка раздела, иначе вставляется новая
 * над последней строкой раздела, а формула итога расширяется на неё. Нет такого раздела — в «Личное».
 */
function addScheduleRow(sh, all, label, section) {
  const width = Math.max(sh.getLastColumn(), 3);
  const block = function (name) {
    const k = normName(name);
    let s = -1, t = -1;
    for (let i = 0; i < all.length && s < 0; i++) if (k && normName(all[i][0]) === k) s = i;
    if (s < 0) return null;
    for (let i = s; i < all.length; i++) if (/^всего/.test(normName(all[i][1]))) { t = i; break; }
    return t < 0 ? null : { s: s, t: t };
  };
  const b = block(section) || block('Личное');
  if (!b) { // разделов нет — в конец листа
    const at = all.length + 1;
    sh.getRange(at, 2).setValue(label);
    sh.getRange(at, 3, 1, width - 2).setNumberFormat('[h]:mm');
    return;
  }
  for (let i = b.s; i < b.t; i++) { // свободная строка раздела
    const r = all[i];
    if (!String(r[1] == null ? '' : r[1]).trim() && r.slice(2).every(function (v) { return v === '' || v == null; })) {
      sh.getRange(i + 1, 2).setValue(label);
      sh.getRange(i + 1, 3, 1, width - 2).setNumberFormat('[h]:mm');
      return;
    }
  }
  const n = b.t; // 1-based номер строки над итогом; новая строка встаёт на её место
  sh.insertRowBefore(n);
  const nr = sh.getRange(n, 1, 1, width);
  nr.clearContent(); nr.clearDataValidations();
  sh.getRange(n, 3, 1, width - 2).setNumberFormat('[h]:mm');
  sh.getRange(n, 2).setValue(label);
  const tr = sh.getRange(b.t + 2, 3, 1, width - 2), f = tr.getFormulas()[0];
  if (f.some(function (x) { return x; })) {
    tr.setFormulas([f.map(function (x) {
      return x ? x.replace(/(\$?[A-Z]{1,3}\$?)(\d+):(\$?[A-Z]{1,3}\$?)(\d+)/g, function (m, a, r1, c, r2) { return a + r1 + ':' + c + (Number(r2) < n ? n : r2); }) : x;
    })]);
  }
}

/** Запустить вручную один раз: даст доступ к таблицам расписания и заполнит всё накопленное время. */
function exportAll() {
  const r = exportSchedule(SpreadsheetApp.getActiveSpreadsheet(), null);
  Logger.log(JSON.stringify(r));
  return r;
}

/** Запустить один раз вручную: листы + ежедневная резервная копия. */
function setup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  Object.keys(SCHEMA).forEach(function (n) { sheetFor(ss, n); });
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'backupDaily') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('backupDaily').timeBased().everyDays(1).atHour(4).create();
  backupDaily();
}

function backupDaily() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const it = DriveApp.getFoldersByName(BACKUP_FOLDER);
  const folder = it.hasNext() ? it.next() : DriveApp.createFolder(BACKUP_FOLDER);
  const stamp = Utilities.formatDate(new Date(), ss.getSpreadsheetTimeZone(), 'yyyy-MM-dd');
  DriveApp.getFileById(ss.getId()).makeCopy(ss.getName() + ' — ' + stamp, folder);
  const files = [];
  const fi = folder.getFiles();
  while (fi.hasNext()) files.push(fi.next());
  files.sort(function (a, b) { return b.getDateCreated() - a.getDateCreated(); });
  files.slice(BACKUP_KEEP).forEach(function (f) { f.setTrashed(true); });
}
