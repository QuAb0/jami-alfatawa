// محرك البحث: فهم السؤال + بحث نصي سريع + ترتيب ذكي، والكل خلال ثوانٍ
const { db } = require('./db');
const { tokens, normalize, dialectToFusha, stem, indexText, concepts } = require('./arabic');
const ai = require('./ai');
const CATEGORIES = require('./categories');
const sheikhsCfg = require('./sheikhs');

const COLS = 'f.id, f.sheikh_id, f.url, f.title, f.question, f.answer, f.summary, f.category, f.audio_url, f.demo';

function ftsQuery(words) {
  let base = words.flatMap(w => normalize(w).split(' ')).map(stem).filter(w => w.length > 1);
  base = concepts(base).flat();                                                   // مع المرادفات
  base = base.concat(base.filter(w => w.length >= 4 && /^[ايتن]/.test(w)).map(w => w.slice(1)));  // أجمع ← جمع
  const uniq = [...new Set(base)].slice(0, 30);
  return uniq.map(w => `"${w.replace(/"/g, '')}"*`).join(' OR ');
}

function ftsSearch(words, { sheikh, category, limit = 40 } = {}) {
  const q = ftsQuery(words);
  if (!q) return [];
  let sql = `SELECT ${COLS}, bm25(fatwas_fts, 6.0, 3.0, 1.0) AS score FROM fatwas_fts
    JOIN fatwas f ON f.id = fatwas_fts.rowid WHERE fatwas_fts MATCH ?`;
  const args = [q];
  if (sheikh) { sql += ' AND f.sheikh_id = ?'; args.push(sheikh); }
  if (category) { sql += ' AND f.category = ?'; args.push(category); }
  sql += ' ORDER BY score LIMIT ?'; args.push(limit);
  try { return db.prepare(sql).all(...args); } catch { return []; }
}

// ---------- بوابة الصلة: لا تُعرض فتوى لا تشترك مع السؤال في جوهره ----------
// كل مفهوم في السؤال له وزن حسب ندرته (الكلمة النادرة مثل «الربا» أثقل من الشائعة مثل «أكل»)
function conceptWeights(groups) {
  const N = db.prepare('SELECT COUNT(*) n FROM fatwas').get().n || 1;
  return groups.map(g => {
    let df = 0;
    try { df = db.prepare('SELECT COUNT(*) n FROM fatwas_fts WHERE fatwas_fts MATCH ?').get(g.map(w => `"${w.replace(/"/g, '')}"*`).join(' OR ')).n; } catch { /* كلمة غير صالحة للفهرس */ }
    return { g, df, w: Math.log(1 + N / (df + 1)) };
  });
}
const hasTok = (set, w) => {
  if (set.has(w)) return true;
  if (w.length < 3) return false;
  if (w.length >= 4 && /^[ايتن]/.test(w)) { const v = w.slice(1); if (set.has(v)) return true; for (const t of set) if (t.length >= 3 && t.startsWith(v)) return true; }  // أمسح ← مسح
  for (const t of set) if (t.length >= 3 && (t.startsWith(w) || (w.startsWith(t) && t.length >= w.length - 1))) return true;
  return false;
};
function relevance(r, weighted) {
  const head = new Set(indexText(`${r.title} ${r.question || ''}`).split(' '));
  const body = new Set(indexText(r.answer.slice(0, 1500)).split(' '));
  let got = 0, total = 0, keyHit = false;
  const present = weighted.filter(c => c.df);
  if (!present.length) return { cov: 0, keyHit: false };
  const key = present.reduce((a, b) => (b.w > a.w ? b : a), present[0]);
  for (const c of weighted) {
    total += c.w;
    const inHead = c.g.some(w => hasTok(head, w)), inBody = !inHead && c.g.some(w => hasTok(body, w));
    got += c.w * (inHead ? 1 : inBody ? .55 : 0);
    if (c === key && (inHead || inBody)) keyHit = true;
  }
  return { cov: total ? got / total : 0, keyHit };
}

function detectSheikh(q) {
  const n = ' ' + normalize(q) + ' ';
  for (const s of sheikhsCfg.all()) for (const a of [s.short, ...(s.aliases || [])]) {
    if (a && n.includes(' ' + normalize(a) + ' ')) return s.id;
  }
  return null;
}

function stripSheikhNames(q) {
  let n = normalize(q);
  for (const s of sheikhsCfg.all()) for (const a of [s.short, ...(s.aliases || [])]) if (a) n = n.replace(normalize(a), ' ');
  return n;
}

function logSearch(q) {
  const key = normalize(q);
  if (key.length < 4) return;
  db.prepare(`INSERT INTO searches (q, shown) VALUES (?, ?) ON CONFLICT(q) DO UPDATE SET n = n + 1, last_at = datetime('now')`).run(key, q.slice(0, 140));
}

const cache = new Map();

async function search({ q, sheikh = null, category = null }) {
  const started = Date.now();
  const ck = [normalize(q), sheikh, category].join('|');
  const hit = cache.get(ck);
  if (hit && Date.now() - hit.at < 6 * 3600e3) { logSearch(q); return { ...hit.data, ms: Date.now() - started, cached: true }; }

  // يبدأ البحث المحلي فوراً، وبالتوازي يفهم الذكاء الاصطناعي السؤال
  const localSheikh = sheikh || detectSheikh(q);
  const localWords = tokens(stripSheikhNames(q));
  const local = ftsSearch(localWords, { sheikh: localSheikh, category });

  let u = null;
  if (ai.enabled()) {
    try { u = await ai.understand(q, sheikhsCfg.all(), CATEGORIES); } catch { u = null; }
  }
  const targetSheikh = sheikh || u?.sheikh_id || localSheikh;
  const fusha = u?.fusha || dialectToFusha(q);

  // دمج النتائج
  const byId = new Map();
  for (const r of local) byId.set(r.id, { ...r, s: -r.score });
  if (u?.keywords?.length) {
    for (const r of ftsSearch([...u.keywords, ...tokens(u.fusha)], { sheikh: targetSheikh, category })) {
      const prev = byId.get(r.id);
      byId.set(r.id, { ...r, s: (prev?.s || 0) + -r.score * 1.3 });
    }
  }
  let ranked = [...byId.values()].filter(r => !targetSheikh || r.sheikh_id === targetSheikh).sort((a, b) => b.s - a.s).slice(0, 40);

  // بوابة الصلة: المفاهيم الجوهرية من الذكاء الاصطناعي إن توفرت، وإلا من كلمات السؤال
  const coreWords = u?.core?.length ? u.core.flatMap(c => tokens(c)) : localWords;
  const weighted = conceptWeights(concepts(coreWords.length ? coreWords : localWords));
  if (weighted.length) {
    ranked = ranked.map(r => ({ ...r, rel: relevance(r, weighted) }))
      .filter(r => r.rel.keyHit && r.rel.cov >= (u ? .45 : .6))
      .sort((a, b) => (b.rel.cov - a.rel.cov) || (b.s - a.s));
  } else ranked = [];

  // ترتيب ذكي: النموذج يستبعد ما لا يجيب عن المسألة نفسها
  let reranked = false;
  if (ai.enabled() && ranked.length && Date.now() - started < 3400) {
    try {
      const top = ranked.slice(0, 15);
      const ids = await ai.rerank(fusha, top);
      const keep = new Map(top.map(r => [r.id, r]));
      ranked = ids.map(id => keep.get(id));
      reranked = true;
    } catch { /* نكمل بترتيب البوابة */ }
  }

  // أفضل فتوى أو اثنتان لكل شيخ
  const groups = [];
  const seen = new Map();
  for (const r of ranked) {
    const g = seen.get(r.sheikh_id) || (() => { const x = { sheikh_id: r.sheikh_id, fatwas: [] }; seen.set(r.sheikh_id, x); groups.push(x); return x; })();
    if (g.fatwas.length < 3) g.fatwas.push(clean(r));
  }

  const data = {
    query: q, fusha, keywords: u?.keywords || localWords, sheikh: targetSheikh,
    ai: Boolean(u), reranked, groups,
  };
  cache.set(ck, { at: Date.now(), data });
  if (cache.size > 2000) cache.delete(cache.keys().next().value);
  logSearch(q);
  return { ...data, ms: Date.now() - started };
}

function clean(r) {
  const { score, s, rel, ...rest } = r;
  return rest;
}

function related(f, limit = 5) {
  const words = tokens(f.title).slice(0, 8);
  const weighted = conceptWeights(concepts(words));
  if (!weighted.length) return [];
  return ftsSearch(words, { limit: 30 }).filter(r => r.id !== f.id)
    .map(r => ({ ...r, rel: relevance(r, weighted) })).filter(r => r.rel.keyHit && r.rel.cov >= .6)
    .sort((a, b) => b.rel.cov - a.rel.cov).slice(0, limit).map(clean);
}

// ---------- البحث المباشر في مواقع المشايخ (عند عدم وجود الفتوى في المخزون) ----------
const liveCache = new Map();
async function live({ q, sheikh = null }) {
  const started = Date.now();
  const key = normalize(q) + '|' + (sheikh || '');
  const hit = liveCache.get(key);
  if (hit && Date.now() - hit.at < 6 * 3600e3) return { ...hit.data, ms: 0, cached: true };
  const { extract, get, fetchUrl } = require('./crawler');
  const { saveFatwa } = require('./db');
  const target = sheikh || detectSheikh(q);
  const list = sheikhsCfg.all().filter(s => !target || s.id === target);
  const fusha = dialectToFusha(q);
  const pages = await ai.liveSearch(q, fusha, list);
  const out = [];
  await Promise.all(pages.map(async p => {
    let u; try { u = new URL(p.url); } catch { return; }
    const s = list.find(x => u.hostname.replace(/^www\./, '').endsWith(x.site.domain.replace(/^www\./, '')));
    if (!s) return;
    let url = u.href;
    // روابط ابن عثيمين: نحفظ رابط الموقع الرسمي، ونقرأ من النسخة القديمة
    if (s.site.fetch && url.startsWith(s.site.fetch.to)) url = url.replace(s.site.fetch.to, s.site.fetch.from);
    try {
      const existing = db.prepare(`SELECT ${COLS} FROM fatwas f WHERE url = ?`).get(url);
      if (existing) { out.push(existing); return; }
      const { text: html } = await get(fetchUrl(url, s.site));
      const f = extract(html, s.site);
      if (f.skip || !f.title || (f.answer || '').length < 40) return;
      const id = saveFatwa({ sheikh_id: s.id, url, title: f.title.slice(0, 300), question: f.question, answer: f.answer,
        audio_url: f.audio ? new URL(f.audio, fetchUrl(url, s.site)).href : null });
      out.push(db.prepare(`SELECT ${COLS} FROM fatwas f WHERE id = ?`).get(id));
    } catch { /* صفحة لم تُفتح */ }
  }));
  const groups = [], m = new Map();
  for (const r of out) { let g = m.get(r.sheikh_id); if (!g) { g = { sheikh_id: r.sheikh_id, fatwas: [] }; m.set(r.sheikh_id, g); groups.push(g); } if (g.fatwas.length < 3) g.fatwas.push(r); }
  const data = { query: q, fusha, sheikh: target, groups, live: true };
  liveCache.set(key, { at: Date.now(), data });
  cache.clear();   // الفتاوى الجديدة تدخل في نتائج البحث القادمة
  return { ...data, ms: Date.now() - started };
}

module.exports = { search, live, related, ftsSearch, COLS };
