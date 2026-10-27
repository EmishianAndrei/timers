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

// Листы базы и их столбцы (как SCHEMA в js/core.js). Новые столбцы и листы создаются сами при первой записи.
const SCHEMA = {
  settings:   ['id', 'value', 'updated'],
  timers:     ['id', 'name', 'group', 'color', 'order', 'itemId', 'archived', 'runningSince', 'created', 'cdMin', 'cdAcc', 'cdRang', 'updated'],
  sessions:   ['id', 'timerId', 'date', 'start', 'end', 'minutes', 'updated'],
  sections:   ['id', 'name', 'order', 'total', 'updated'],
  items:      ['id', 'sectionId', 'name', 'type', 'options', 'role', 'order', 'from', 'to', 'updated'],
  entries:    ['id', 'date', 'itemId', 'value', 'updated'],
  recipes:    ['id', 'kind', 'num', 'name', 'unit', 'pack', 'kcal', 'prot', 'fat', 'carb', 'sugar', 'extra', 'ingredients', 'steps', 'notes', 'order', 'updated'],
  weekly:     ['id', 'name', 'order', 'archived', 'updated'],
  weeklyDone: ['id', 'week', 'itemId', 'done', 'updated'],
  goals:      ['id', 'month', 'section', 'name', 'target', 'progress', 'source', 'done', 'order', 'updated'],
  triggers:   ['id', 'trigger', 'action', 'done', 'order', 'updated'],
  skills:     ['id', 'category', 'name', 'order', 'updated'],
  wishes:     ['id', 'person', 'name', 'done', 'order', 'updated'],
  finCats:    ['id', 'group', 'name', 'kind', 'inTotal', 'order', 'archived', 'updated'],
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

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(25000)) return out({ ok: false, error: 'busy' });
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let applied = 0;
    if (Array.isArray(req.ops) && req.ops.length) applied = applyOps(ss, req.ops);
    const res = { ok: true, applied: applied, time: Date.now() };
    if (req.pull) res.data = readAll(ss);
    return out(res);
  } catch (err) {
    return out({ ok: false, error: 'server', message: String(err && err.message || err) });
  } finally {
    lock.releaseLock();
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

/** ops: [{c: 'tasks', op: 'put', r: {...}} | {c: 'tasks', op: 'del', id: '...'}] */
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
    let headers = headersOf(sh);
    const lastRow = sh.getLastRow();
    let rows = lastRow > 1 ? sh.getRange(2, 1, lastRow - 1, headers.length).getValues() : [];
    rows = rows.map(function (r) { return r.map(function (v) { return plain(v, tz); }); });
    const idCol = headers.indexOf('id');
    const updCol = headers.indexOf('updated');
    const index = {};
    rows.forEach(function (r, i) { if (r[idCol]) index[r[idCol]] = i; });
    const dead = {};

    byCol[name].forEach(function (o) {
      if (o.op === 'del') {
        if (o.id in index) { dead[index[o.id]] = true; applied++; }
        return;
      }
      const rec = o.r;
      if (!rec || !rec.id) return;
      Object.keys(rec).forEach(function (k) {
        if (headers.indexOf(k) < 0 && /^[A-Za-z][A-Za-z0-9]{0,40}$/.test(k)) {
          headers.push(k);
          rows.forEach(function (r) { r.push(''); });
        }
      });
      const i = index[rec.id];
      if (i !== undefined && !dead[i]) {
        const cur = Number(rows[i][updCol] || 0);
        if (cur > Number(rec.updated || 0)) return; // на сервере более свежая версия
        headers.forEach(function (h, j) { if (h in rec) rows[i][j] = cell(rec[h]); });
      } else {
        const row = headers.map(function (h) { return h in rec ? cell(rec[h]) : ''; });
        index[rec.id] = rows.length;
        rows.push(row);
      }
      applied++;
    });

    const keep = rows.filter(function (r, i) { return !dead[i]; });
    sh.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
    if (lastRow > 1) sh.getRange(2, 1, lastRow - 1, Math.max(headers.length, sh.getLastColumn())).clearContent();
    if (keep.length) {
      if (sh.getMaxRows() < keep.length + 1) sh.insertRowsAfter(sh.getMaxRows(), keep.length + 1 - sh.getMaxRows());
      const rng = sh.getRange(2, 1, keep.length, headers.length);
      rng.setNumberFormat('@');
      rng.setValues(keep);
    }
  });
  return applied;
}

function readAll(ss) {
  const tz = ss.getSpreadsheetTimeZone();
  const data = {};
  ss.getSheets().forEach(function (sh) {
    const name = sh.getName();
    const headers = headersOf(sh);
    if (!SCHEMA[name] && headers[0] !== 'id') return; // любой лист с первым столбцом id — это коллекция
    const lastRow = sh.getLastRow();
    const list = [];
    if (lastRow > 1 && headers.length) {
      sh.getRange(2, 1, lastRow - 1, headers.length).getValues().forEach(function (r) {
        const rec = {};
        headers.forEach(function (h, j) { if (h) rec[h] = plain(r[j], tz); });
        if (rec.id) list.push(rec);
      });
    }
    data[name] = list;
  });
  return data;
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
