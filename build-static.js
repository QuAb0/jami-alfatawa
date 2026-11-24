// يبني نسخة ثابتة كاملة من الموقع لـ GitHub Pages (بلا خادم):
// صفحات الواجهة + فهرس بحث مقسّم + الفتاوى مقسمة على ملفات صغيرة، والبحث يتم في متصفح الزائر
// الاستخدام: SITE_BASE=/fatwa-hub/ node scripts/build-static.js   (الناتج في _site)
const fs = require('fs');
const path = require('path');
const { db } = require('../server/db');
const sheikhs = require('../server/sheikhs').all();
const CATEGORIES = require('../server/categories');
const { indexText, isStop } = require('../server/arabic');

const ROOT = path.join(__dirname, '..');
const OUT = process.env.STATIC_OUT || path.join(ROOT, '_site');
let BASE = process.env.SITE_BASE || '/';
if (!BASE.startsWith('/')) BASE = '/' + BASE;
if (!BASE.endsWith('/')) BASE += '/';
const PAGE = 20, DOCS_PER_FILE = 100;

fs.rmSync(OUT, { recursive: true, force: true });
const w = (rel, data) => { const f = path.join(OUT, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, typeof data === 'string' ? data : JSON.stringify(data)); };
const shardName = t => [...t.slice(0, 2)].map(c => c.codePointAt(0).toString(16)).join('_');

const rows = db.prepare('SELECT id, sheikh_id, url, title, question, answer, summary, category, audio_url, demo FROM fatwas ORDER BY id').all();
const t0 = Date.now();

// ---------- الفتاوى ----------
const docFiles = new Map();
for (const r of rows) { const k = Math.floor(r.id / DOCS_PER_FILE); if (!docFiles.has(k)) docFiles.set(k, {}); docFiles.get(k)[r.id] = r; }
for (const [k, obj] of docFiles) w(`data/docs/${k}.json`, obj);

// ---------- خريطة الفتوى ← الشيخ (للتصفية أثناء البحث) ----------
const sIndex = Object.fromEntries(sheikhs.map((s, i) => [s.id, i]));
const maxId = rows.length ? rows.at(-1).id : 0;
const dsh = new Array(maxId + 1).fill(-1);
for (const r of rows) dsh[r.id] = sIndex[r.sheikh_id] ?? -1;
w('data/dsh.json', dsh);

// ---------- الفهرس المقلوب: كلمة ← [رقم الفتوى × 4 + موضعها] ----------
// الموضع: 2 في العنوان، 1 في السؤال، 0 في بداية الجواب
const inv = new Map();
const add = (tok, id, f) => {
  if (tok.length < 2 || isStop(tok)) return;
  let m = inv.get(tok); if (!m) inv.set(tok, m = new Map());
  if ((m.get(id) ?? -1) < f) m.set(id, f);
};
for (const r of rows) {
  for (const t of new Set(indexText(r.answer.slice(0, 1500)).split(' '))) add(t, r.id, 0);
  for (const t of new Set(indexText(r.question || '').split(' '))) add(t, r.id, 1);
  for (const t of new Set(indexText(r.title).split(' '))) add(t, r.id, 2);
}
const shards = new Map();
for (const [tok, m] of inv) {
  const ids = [...m.keys()].sort((a, b) => a - b);
  let prev = 0; const enc = ids.map(id => { const v = (id - prev) * 4 + m.get(id); prev = id; return v; });   // ترميز فرقي لتصغير الحجم
  const sn = shardName(tok); if (!shards.has(sn)) shards.set(sn, {}); shards.get(sn)[tok] = enc;
}
for (const [sn, obj] of shards) w(`data/idx/${sn}.json`, obj);

// ---------- قوائم التصفح (حسب الشيخ والباب) ----------
const brief = r => ({ id: r.id, sheikh_id: r.sheikh_id, title: r.title, question: (r.question || '').slice(0, 200), answer: r.answer.slice(0, 240), category: r.category, url: r.url, demo: r.demo });
const lists = new Map();
const push = (key, r) => { if (!lists.has(key)) lists.set(key, []); lists.get(key).push(r); };
for (const r of [...rows].reverse()) {
  push('all', r); push(`sh/${r.sheikh_id}`, r);
  if (r.category) { push(`cat/${r.category}`, r); push(`shcat/${r.sheikh_id}/${r.category}`, r); }
}
for (const [key, list] of lists) for (let p = 0; p * PAGE < list.length || p === 0; p++)
  w(`data/lists/${key}/${p}.json`, { total: list.length, page: p, items: list.slice(p * PAGE, p * PAGE + PAGE).map(brief) });

// ---------- البيانات العامة ----------
const count = (k) => (lists.get(k) || []).length;
const good = rows.filter(r => r.answer.length >= 200 && r.answer.length <= 2500);
const day = Math.floor((Date.now() + 3 * 3600e3) / 86400e3);
w('data/meta.json', {
  sheikhs: sheikhs.map(s => ({ id: s.id, name: s.name, short: s.short, about: s.about, years: s.years, color: s.color, aliases: s.aliases, site: { domain: s.site.domain, name: s.site.name }, count: count(`sh/${s.id}`) })),
  categories: CATEGORIES.map(c => ({ id: c.id, name: c.name, icon: c.icon, count: count(`cat/${c.id}`) })),
  total: rows.length, maxId, demo: rows.some(r => r.demo), daily: good.length ? good[(day * 2654435761) % good.length] : null,
  top: [], ai: false, live: false, static: true, built: new Date().toISOString(), shards: [...shards.keys()],
});

// ---------- الواجهة ----------
const pub = path.join(ROOT, 'public');
let html = fs.readFileSync(path.join(pub, 'index.html'), 'utf8')
  .replace('<base href="/">', `<base href="${BASE}">`)
  .replace('<script src="app.js"></script>', `<script>window.__BASE=${JSON.stringify(BASE)}</script><script src="arabic.js"></script><script src="static-api.js"></script><script src="app.js"></script>`);
w('index.html', html);
w('404.html', html);                       // حتى تعمل الروابط المباشرة مثل /fatwa/123
for (const f of ['app.css', 'app.js', 'favicon.svg', 'static-api.js']) fs.copyFileSync(path.join(pub, f), path.join(OUT, f));
w('arabic.js', fs.readFileSync(path.join(ROOT, 'server', 'arabic.js'), 'utf8').replace(/module\.exports = \{([^}]*)\};/, 'window.AR = {$1};'));
w('.nojekyll', '');

const size = d => fs.readdirSync(d, { withFileTypes: true }).reduce((a, e) => a + (e.isDirectory() ? size(path.join(d, e.name)) : fs.statSync(path.join(d, e.name)).size), 0);
console.log(`بُني الموقع الثابت: ${rows.length} فتوى، ${shards.size} ملف فهرس، ${docFiles.size} ملف فتاوى، الحجم ${(size(OUT) / 1048576).toFixed(1)} ميجابايت، في ${((Date.now() - t0) / 1000).toFixed(1)} ثانية (المسار ${BASE})`);
