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
 */

const SECRET = 'ВСТАВЬТЕ_СВОЙ_КЛЮЧ';
const BACKUP_FOLDER = 'Трекер — резервные копии';
const BACKUP_KEEP = 30;
const VERSION = 4; // сайт проверяет версию и подсказывает, если скрипт пора обновить

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
  try {
    const applied = hasOps ? applyOps(ss, req.ops) : 0;
    const res = { ok: true, applied: applied, time: Date.now(), version: VERSION };
    if (req.pull) res.data = readAll(ss);
    if (req.filled) res.filled = filledOn(ss, String(req.filled)); // для напоминаний: что уже отмечено за день
    return out(res);
  } catch (err) {
    return out({ ok: false, error: 'server', message: String(err && err.message || err) });
  } finally {
    if (lock) lock.releaseLock();
  }
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
