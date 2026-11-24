// قاعدة البيانات: SQLite المدمج في Node مع فهرس نصي كامل (FTS5)
const path = require('path');
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');
const { indexText, normalize } = require('./arabic');
const CATEGORIES = require('./categories');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });
const db = new DatabaseSync(path.join(DATA_DIR, 'fatwas.db'));

db.exec(`
PRAGMA journal_mode = WAL;
CREATE TABLE IF NOT EXISTS fatwas (
  id INTEGER PRIMARY KEY,
  sheikh_id TEXT NOT NULL,
  url TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  question TEXT,
  answer TEXT NOT NULL,
  summary TEXT,
  category TEXT,
  audio_url TEXT,
  views INTEGER DEFAULT 0,
  demo INTEGER DEFAULT 0,
  updated_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS fatwas_sheikh ON fatwas(sheikh_id);
CREATE INDEX IF NOT EXISTS fatwas_cat ON fatwas(category);
CREATE VIRTUAL TABLE IF NOT EXISTS fatwas_fts USING fts5(title, question, answer, tokenize='unicode61 remove_diacritics 2');
CREATE TABLE IF NOT EXISTS searches (q TEXT PRIMARY KEY, shown TEXT, n INTEGER DEFAULT 1, last_at TEXT DEFAULT (datetime('now')));
CREATE TABLE IF NOT EXISTS crawled (url TEXT PRIMARY KEY, status TEXT, at TEXT DEFAULT (datetime('now')));
`);

const CAT_WORDS = CATEGORIES.map(c => ({ id: c.id, words: c.words.map(w => ({ iw: indexText(w), multi: w.includes(' ') })) }));
function guessCategory(text) {
  const t = ' ' + indexText(text) + ' ';
  let best = null, score = 0;
  for (const c of CAT_WORDS) {
    let s = 0;
    for (const { iw, multi } of c.words) if (iw.length <= 3 ? t.includes(' ' + iw + ' ') : t.includes(' ' + iw)) s += multi ? 2 : 1;
    if (s > score) { score = s; best = c.id; }
  }
  return best;
}

const upsertStmt = db.prepare(`
INSERT INTO fatwas (sheikh_id, url, title, question, answer, summary, category, audio_url, demo)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(url) DO UPDATE SET title=excluded.title, question=excluded.question, answer=excluded.answer,
  summary=COALESCE(excluded.summary, fatwas.summary), category=excluded.category, audio_url=excluded.audio_url,
  updated_at=datetime('now')
RETURNING id`);
const delFts = db.prepare('DELETE FROM fatwas_fts WHERE rowid = ?');
const insFts = db.prepare('INSERT INTO fatwas_fts (rowid, title, question, answer) VALUES (?, ?, ?, ?)');

function saveFatwa(f) {
  const category = f.category || f.noGuess ? (f.category || null) : guessCategory(`${f.title} ${f.title} ${f.question || ''} ${(f.answer || '').slice(0, 600)}`);
  const { id } = upsertStmt.get(f.sheikh_id, f.url, f.title, f.question || null, f.answer, f.summary || null,
    category, f.audio_url || null, f.demo ? 1 : 0);
  delFts.run(id);
  insFts.run(id, indexText(f.title), indexText(f.question || ''), indexText(f.answer.slice(0, 1500)));   // بداية الجواب تكفي للبحث، وتخفف الحجم والتحميل
  return id;
}

module.exports = { db, saveFatwa, guessCategory };
