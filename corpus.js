// مخزون الفتاوى داخل المستودع (data/corpus) حتى يُحفظ مجاناً في GitHub
// كل شيخ له ملفات مضغوطة مرقّمة، والملفات القديمة لا تُعاد كتابتها (فيبقى تاريخ GitHub صغيراً)
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { db, saveFatwa } = require('./db');

const DIR = process.env.CORPUS_DIR || path.join(__dirname, '..', 'data', 'corpus');
const CHUNK = 2000;

const readGz = f => zlib.gunzipSync(fs.readFileSync(f)).toString('utf8').split('\n').filter(Boolean);
const chunks = dir => fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => /^\d+\.(jsonl|txt)\.gz$/.test(f)).sort().map(f => path.join(dir, f)) : [];
const nextName = (dir, ext) => { const n = chunks(dir).length; return path.join(dir, String(n + 1).padStart(4, '0') + ext); };

function writeChunks(dir, lines, ext) {
  fs.mkdirSync(dir, { recursive: true });
  for (let i = 0; i < lines.length; i += CHUNK) fs.writeFileSync(nextName(dir, ext), zlib.gzipSync(lines.slice(i, i + CHUNK).join('\n') + '\n', { level: 9 }));
}

// يصدّر الفتاوى الجديدة فقط من قاعدة البيانات إلى ملفات المخزون
function exportNew() {
  let total = 0;
  const sheikhIds = db.prepare('SELECT DISTINCT sheikh_id FROM fatwas WHERE demo = 0').all().map(r => r.sheikh_id);
  for (const sid of sheikhIds) {
    const dir = path.join(DIR, sid);
    const have = new Set(chunks(dir).flatMap(f => readGz(f).map(l => JSON.parse(l).url)));
    const rows = db.prepare('SELECT url, title, question, answer, summary, category, audio_url FROM fatwas WHERE sheikh_id = ? AND demo = 0 ORDER BY id').all(sid)
      .filter(r => !have.has(r.url));
    writeChunks(dir, rows.map(r => JSON.stringify(r)), '.jsonl.gz');
    total += rows.length;
  }
  const cdir = path.join(DIR, '_crawled');
  const haveC = new Set(chunks(cdir).flatMap(f => readGz(f).map(l => l.split('\t')[1])));
  const crawled = db.prepare('SELECT status, url FROM crawled').all().filter(r => !haveC.has(r.url) && r.status !== 'err');
  writeChunks(cdir, crawled.map(r => `${r.status}\t${r.url}`), '.txt.gz');
  return { fatwas: total, crawled: crawled.length };
}

function corpusCount() {
  if (!fs.existsSync(DIR)) return 0;
  let n = 0;
  for (const d of fs.readdirSync(DIR)) { const dir = path.join(DIR, d); if (d === '_crawled' || !fs.statSync(dir).isDirectory()) continue; for (const f of chunks(dir)) n += readGz(f).length; }
  return n;
}

// يحمّل المخزون كله إلى قاعدة البيانات (عند التشغيل على الاستضافة المجانية)
function importAll(log = () => {}) {
  if (!fs.existsSync(DIR)) return 0;
  let n = 0;
  const insC = db.prepare('INSERT OR IGNORE INTO crawled (url, status) VALUES (?, ?)');
  db.exec('BEGIN');
  try {
    for (const d of fs.readdirSync(DIR)) {
      const dir = path.join(DIR, d);
      if (!fs.statSync(dir).isDirectory()) continue;
      for (const f of chunks(dir)) for (const line of readGz(f)) {
        if (d === '_crawled') { const [st, url] = line.split('\t'); if (url) insC.run(url, st); continue; }
        const r = JSON.parse(line);
        saveFatwa({ ...r, sheikh_id: d, noGuess: 'category' in r });
        insC.run(r.url, 'ok');
        if (++n % 5000 === 0) log(`حُمّلت ${n} فتوى`);
      }
    }
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); throw e; }
  return n;
}

module.exports = { exportNew, importAll, corpusCount, DIR };
