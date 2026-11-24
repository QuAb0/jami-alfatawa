// خادم جامع الفتاوى — بدون مكتبات خارجية (Node 22.13+)
const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

// تحميل .env
const envFile = path.join(__dirname, '..', '.env');
if (fs.existsSync(envFile)) for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
  if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}

const { db } = require('./db');
const { search, live, related, COLS } = require('./search');
const crypto = require('crypto');
const sheikhs = require('./sheikhs');
const CATEGORIES = require('./categories');
const ai = require('./ai');
const corpus = require('./corpus');
const { normalize } = require('./arabic');

const PORT = Number(process.env.PORT) || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
const SITE_PASSWORD = process.env.SITE_PASSWORD || '';           // الوضع الخاص: كلمة مرور لدخول الموقع كله
const LIVE_ON = () => ai.enabled() && process.env.LIVE_SEARCH !== 'off';
const AUTH = SITE_PASSWORD ? crypto.createHash('sha256').update('fh:' + SITE_PASSWORD).digest('hex').slice(0, 32) : '';
const authed = req => !SITE_PASSWORD || (req.headers.cookie || '').split(/;\s*/).includes('fh_auth=' + AUTH);
const PUBLIC = path.join(__dirname, '..', 'public');
const INDEX_HTML = () => fs.readFileSync(path.join(PUBLIC, 'index.html'), 'utf8');

// ---------- أدوات ----------
const json = (res, code, obj) => { res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }); res.end(JSON.stringify(obj)); };
const body = req => new Promise((ok, fail) => {
  let s = ''; req.on('data', c => { s += c; if (s.length > 200_000) { req.destroy(); fail(new Error('large')); } });
  req.on('end', () => { try { ok(s ? JSON.parse(s) : {}); } catch (e) { fail(e); } });
});
const hits = new Map();
function limited(ip, key, max) {
  const k = ip + key, now = Date.now();
  const l = (hits.get(k) || []).filter(t => now - t < 60_000); l.push(now); hits.set(k, l);
  if (hits.size > 50_000) hits.clear();
  return l.length > max;
}
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const isAdmin = req => ADMIN_PASSWORD && req.headers['x-admin-password'] === ADMIN_PASSWORD;

function sheikhPublic(s) {
  const n = db.prepare('SELECT COUNT(*) n FROM fatwas WHERE sheikh_id = ?').get(s.id).n;
  return { id: s.id, name: s.name, short: s.short, about: s.about, years: s.years, color: s.color, site: { domain: s.site.domain, name: s.site.name }, count: n };
}

function daily() {
  const n = db.prepare('SELECT COUNT(*) n FROM fatwas WHERE length(answer) BETWEEN 200 AND 2500').get().n;
  if (!n) return null;
  const day = Math.floor((Date.now() + 3 * 3600e3) / 86400e3);       // بتوقيت مكة
  const off = (day * 2654435761) % n;
  return db.prepare(`SELECT ${COLS} FROM fatwas f WHERE length(answer) BETWEEN 200 AND 2500 ORDER BY id LIMIT 1 OFFSET ?`).get(off);
}

let crawlProc = null, crawlLog = [];

// ---------- المسارات ----------
async function api(req, res, url, ip) {
  const p = url.pathname;

  if (p === '/api/meta') {
    const cats = db.prepare('SELECT category, COUNT(*) n FROM fatwas GROUP BY category').all();
    const cm = Object.fromEntries(cats.map(c => [c.category, c.n]));
    return json(res, 200, {
      sheikhs: sheikhs.all().map(sheikhPublic),
      categories: CATEGORIES.map(c => ({ id: c.id, name: c.name, icon: c.icon, count: cm[c.id] || 0 })),
      total: db.prepare('SELECT COUNT(*) n FROM fatwas').get().n,
      demo: db.prepare('SELECT COUNT(*) n FROM fatwas WHERE demo = 1').get().n > 0,
      daily: daily(),
      top: db.prepare('SELECT shown, n FROM searches ORDER BY n DESC, last_at DESC LIMIT 8').all(),
      ai: ai.enabled(), live: LIVE_ON(), loading: LOADING,
    });
  }

  if (p === '/api/search') {
    if (limited(ip, 's', 20)) return json(res, 429, { error: 'طلبات كثيرة، انتظر قليلاً.' });
    const q = (url.searchParams.get('q') || '').trim();
    if (q.length < 2 || q.length > 600) return json(res, 400, { error: 'اكتب سؤالك.' });
    const sheikh = sheikhs.get(url.searchParams.get('sheikh')) ? url.searchParams.get('sheikh') : null;
    const cat = CATEGORIES.some(c => c.id === url.searchParams.get('cat')) ? url.searchParams.get('cat') : null;
    return json(res, 200, await search({ q, sheikh, category: cat }));
  }

  if (p === '/api/live') {
    if (!LIVE_ON()) return json(res, 400, { error: 'البحث المباشر يحتاج مفتاح ANTHROPIC_API_KEY.' });
    if (limited(ip, 'l', 6)) return json(res, 429, { error: 'طلبات بحث مباشر كثيرة، انتظر دقيقة.' });
    const q = (url.searchParams.get('q') || '').trim();
    if (q.length < 2 || q.length > 600) return json(res, 400, { error: 'اكتب سؤالك.' });
    const sheikh = sheikhs.get(url.searchParams.get('sheikh')) ? url.searchParams.get('sheikh') : null;
    try { return json(res, 200, await live({ q, sheikh })); }
    catch (e) { return json(res, 502, { error: 'تعذر البحث المباشر في مواقع المشايخ: ' + e.message }); }
  }

  let m;
  if ((m = p.match(/^\/api\/fatwa\/(\d+)$/))) {
    const f = db.prepare(`SELECT ${COLS}, f.views FROM fatwas f WHERE id = ?`).get(Number(m[1]));
    if (!f) return json(res, 404, { error: 'الفتوى غير موجودة' });
    db.prepare('UPDATE fatwas SET views = views + 1 WHERE id = ?').run(f.id);
    return json(res, 200, { fatwa: f, related: related(f) });
  }

  if (p === '/api/browse') {
    const cat = url.searchParams.get('cat'), sh = url.searchParams.get('sheikh');
    const page = Math.max(0, Number(url.searchParams.get('page')) || 0);
    let where = '1=1'; const args = [];
    if (cat) { where += ' AND category = ?'; args.push(cat); }
    if (sh) { where += ' AND sheikh_id = ?'; args.push(sh); }
    const total = db.prepare(`SELECT COUNT(*) n FROM fatwas f WHERE ${where}`).get(...args).n;
    const items = db.prepare(`SELECT ${COLS} FROM fatwas f WHERE ${where} ORDER BY views DESC, id DESC LIMIT 20 OFFSET ?`).all(...args, page * 20);
    return json(res, 200, { total, page, items: items.map(i => ({ ...i, answer: i.answer.slice(0, 320) })) });
  }

  if (p === '/api/assistant' && req.method === 'POST') {
    if (limited(ip, 'a', 12)) return json(res, 429, { error: 'رسائل كثيرة، انتظر قليلاً.' });
    const { messages } = await body(req);
    const msgs = (Array.isArray(messages) ? messages : []).slice(-10)
      .map(x => ({ role: x.role === 'assistant' ? 'assistant' : 'user', content: String(x.content || '').slice(0, 1200) }))
      .filter(x => x.content);
    if (!msgs.length || msgs.at(-1).role !== 'user') return json(res, 400, { error: 'رسالة فارغة' });
    if (!ai.enabled()) return json(res, 200, faq(msgs.at(-1).content));
    try { return json(res, 200, await ai.assistant(msgs)); }
    catch { return json(res, 200, faq(msgs.at(-1).content)); }
  }

  // ---------- الإدارة ----------
  if (p.startsWith('/api/admin/')) {
    if (!isAdmin(req)) return json(res, 401, { error: 'كلمة المرور غير صحيحة' });
    if (p === '/api/admin/stats') {
      return json(res, 200, {
        total: db.prepare('SELECT COUNT(*) n FROM fatwas').get().n,
        bySheikh: db.prepare('SELECT sheikh_id, COUNT(*) n FROM fatwas GROUP BY sheikh_id').all(),
        searches: db.prepare('SELECT COUNT(*) n, COALESCE(SUM(n),0) t FROM searches').get(),
        crawling: Boolean(crawlProc), log: crawlLog.slice(-60), ai: ai.enabled(),
        sheikhs: sheikhs.all(),
      });
    }
    if (p === '/api/admin/sheikhs' && req.method === 'POST') {
      try { sheikhs.save((await body(req)).sheikhs); return json(res, 200, { ok: true }); }
      catch (e) { return json(res, 400, { error: e.message }); }
    }
    if (p === '/api/admin/crawl' && req.method === 'POST') {
      if (crawlProc) return json(res, 409, { error: 'الجمع يعمل حالياً' });
      const b = await body(req);
      const args = [path.join(__dirname, 'crawler.js')];
      if (b.sheikh) args.push('--sheikh', String(b.sheikh));
      if (b.limit) args.push('--limit', String(Number(b.limit) || 100));
      if (b.ai) args.push('--ai');
      crawlLog = [];
      crawlProc = spawn(process.execPath, ['--no-warnings', ...args], { env: process.env });
      const onData = d => { crawlLog.push(...String(d).split('\n').filter(Boolean)); crawlLog = crawlLog.slice(-300); };
      crawlProc.stdout.on('data', onData); crawlProc.stderr.on('data', onData);
      crawlProc.on('exit', code => { crawlLog.push(`— انتهى (${code})`); crawlProc = null; });
      return json(res, 200, { ok: true });
    }
    if (p === '/api/admin/crawl/stop' && req.method === 'POST') { crawlProc?.kill(); return json(res, 200, { ok: true }); }
    if (p === '/api/admin/clear-demo' && req.method === 'POST') {
      const ids = db.prepare('SELECT id FROM fatwas WHERE demo = 1').all();
      for (const { id } of ids) db.prepare('DELETE FROM fatwas_fts WHERE rowid = ?').run(id);
      db.prepare('DELETE FROM fatwas WHERE demo = 1').run();
      return json(res, 200, { removed: ids.length });
    }
  }
  return json(res, 404, { error: 'not found' });
}

// ردود جاهزة للمساعد عند عدم توفر الذكاء الاصطناعي
function faq(text) {
  const t = normalize(text);
  const has = (...w) => w.some(x => t.includes(x));
  if (has('صوت', 'مايك', 'اتكلم')) return { reply: 'اضغط زر الميكروفون داخل خانة البحث وتكلم بسؤالك، وبعد ما تخلص يبدأ البحث تلقائياً.', search: null };
  if (has('قارن', 'مقارنه', 'اختلاف')) return { reply: 'بعد ما تبحث، اضغط «قارن الأقوال» أعلى النتائج، ويطلع لك جواب كل شيخ في المسألة جنب بعض.', search: null };
  if (has('بعينه', 'شيخا', 'شيخ معين', 'شيخ محدد', 'ابن باز', 'ابن عثيمين', 'الفوزان', 'صفحه الشيخ')) return { reply: 'تقدر تختار الشيخ من القائمة تحت خانة البحث، أو تدخل صفحته من قسم «المشايخ»، أو تكتب اسمه في سؤالك مثل: «وش رأي ابن باز في…».', search: null };
  if (has('حفظ', 'مفضله', 'نجمه', 'سجل')) return { reply: 'اضغط النجمة على أي فتوى لحفظها، وتلقى المحفوظات وأسئلتك السابقة في صفحة «محفوظاتي». تنحفظ في جهازك فقط.', search: null };
  if (has('شارك', 'ارسل', 'واتس')) return { reply: 'تحت كل فتوى زر «شارك»: تقدر ترسلها واتساب أو إكس، أو تنسخ الرابط، أو تحفظ بطاقة صورة.', search: null };
  if (has('استمع', 'اسمع', 'قراءه')) return { reply: 'اضغط «استمع» تحت الفتوى. إذا كانت لها صوتية في موقع الشيخ تشتغل، وإذا ما كانت يقرأ لك الموقع النص.', search: null };
  if (has('رابط', 'مصدر', 'تاكد', 'صحه')) return { reply: 'كل جواب منقول من موقع الشيخ نفسه، وتحته رابط يوديك لصفحة الفتوى الأصلية عشان تتأكد بنفسك.', search: null };
  if (has('حكم', 'يجوز', 'حلال', 'حرام')) return { reply: 'أنا دليل للموقع وما أفتي، لكن أقدر أبحث لك في فتاوى المشايخ عن سؤالك.', search: text };
  return { reply: 'أهلاً! أقدر أساعدك في استخدام الموقع: البحث، والسؤال الموجه لشيخ معين، ومقارنة الأقوال، والأبواب، والمشاركة، والمحفوظات. وش تبي تعرف؟', search: null };
}

// صفحة HTML مع وسوم المشاركة (تظهر معاينة جميلة في واتساب وإكس)
function page(res, url) {
  let html = INDEX_HTML();
  const m = url.pathname.match(/^\/fatwa\/(\d+)/);
  if (m) {
    const f = db.prepare('SELECT title, answer, sheikh_id FROM fatwas WHERE id = ?').get(Number(m[1]));
    if (f) {
      const s = sheikhs.get(f.sheikh_id);
      const title = `${f.title} — ${s?.short || ''}`;
      const desc = f.answer.replace(/\s+/g, ' ').slice(0, 180);
      html = html.replace(/<title>.*?<\/title>/, `<title>${esc(title)} | جامع الفتاوى</title>`)
        .replace('<!--OG-->', `<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}"><meta name="description" content="${esc(desc)}">`);
    }
  }
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  res.end(html);
}

function loginPage(res, wrong) {
  res.writeHead(wrong ? 401 : 200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
  res.end(`<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>جامع الفتاوى، نسخة تجريبية</title><link rel="icon" href="/favicon.svg">
<link href="https://fonts.googleapis.com/css2?family=Readex+Pro:wght@400;600&display=swap" rel="stylesheet">
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:radial-gradient(ellipse at 70% 0%,rgba(25,227,165,.25),transparent 50%),radial-gradient(ellipse at 10% 60%,rgba(60,120,255,.2),transparent 50%),#060a12;color:#eef2f8;font:16px/1.7 "Readex Pro",Tahoma,sans-serif;padding:20px}
form{box-sizing:border-box;width:min(380px,100%);padding:32px;border-radius:24px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.12);backdrop-filter:blur(14px);text-align:center}
img{width:56px;margin:0 auto 14px;display:block}h1{font-size:22px;margin:0 0 6px}p{color:#a3aec2;margin:0 0 22px;font-size:15px}
input{width:100%;box-sizing:border-box;height:50px;border-radius:14px;border:1px solid rgba(255,255,255,.16);background:rgba(0,0,0,.3);color:#fff;padding:0 16px;font:inherit;font-size:16px;margin-bottom:12px}
button{width:100%;height:50px;border:0;border-radius:14px;background:linear-gradient(100deg,#19e3a5,#3cc8ff 50%,#8b7bff);color:#03121a;font:inherit;font-weight:600;cursor:pointer}
.err{color:#ff8f9b;font-size:14px;margin:-4px 0 12px}</style></head><body>
<form method="post" action="/login"><img src="/favicon.svg" alt=""><h1>جامع الفتاوى</h1><p>نسخة تجريبية خاصة. أدخل كلمة المرور للدخول.</p>
${wrong ? '<div class="err">كلمة المرور غير صحيحة</div>' : ''}<input type="password" name="password" placeholder="كلمة المرور" autofocus required autocomplete="current-password"><button>دخول</button></form></body></html>`);
}

const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json' };

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
  try {
    // الوضع الخاص
    if (SITE_PASSWORD && !authed(req)) {
      if (url.pathname === '/login' && req.method === 'POST') {
        let b = ''; for await (const c of req) { b += c; if (b.length > 2000) break; }
        const pw = new URLSearchParams(b).get('password') || '';
        if (limited(ip, 'login', 10)) { res.writeHead(429); return res.end('انتظر دقيقة'); }
        if (pw === SITE_PASSWORD) { res.writeHead(302, { 'set-cookie': `fh_auth=${AUTH}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000${req.headers['x-forwarded-proto'] === 'https' ? '; Secure' : ''}`, location: '/' }); return res.end(); }
        return loginPage(res, true);
      }
      if (url.pathname === '/favicon.svg') { res.writeHead(200, { 'content-type': 'image/svg+xml' }); return fs.createReadStream(path.join(PUBLIC, 'favicon.svg')).pipe(res); }
      if (url.pathname.startsWith('/api/')) return json(res, 401, { error: 'الموقع في وضع التجربة الخاصة.' });
      return loginPage(res, false);
    }
    if (url.pathname.startsWith('/api/')) return await api(req, res, url, ip);
    const file = path.normalize(path.join(PUBLIC, decodeURIComponent(url.pathname)));
    if (file.startsWith(PUBLIC + path.sep) && fs.existsSync(file) && fs.statSync(file).isFile() && !file.endsWith('index.html')) {
      res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream', 'cache-control': 'public, max-age=3600' });
      return fs.createReadStream(file).pipe(res);
    }
    return page(res, url);   // تطبيق صفحة واحدة: كل المسارات الأخرى تفتح الواجهة
  } catch (e) {
    console.error(e);
    json(res, 500, { error: 'حدث خطأ في الخادم' });
  }
});

// تحميل مخزون الفتاوى من data/corpus إذا كانت قاعدة البيانات أقل منه (الاستضافة المجانية تبدأ فارغة)
let LOADING = false;
function loadCorpus() {
  const have = db.prepare('SELECT COUNT(*) n FROM fatwas WHERE demo = 0').get().n;
  const inCorpus = corpus.corpusCount();
  if (inCorpus <= have) return;
  LOADING = true;
  setImmediate(() => {
    try { const n = corpus.importAll(m => console.log(m)); console.log(`حُمّل المخزون: ${n} فتوى`); }
    catch (e) { console.error('تعذر تحميل المخزون', e); }
    LOADING = false;
  });
}

function listen() {
  server.listen(PORT, () => {
    console.log(`جامع الفتاوى: http://localhost:${PORT}  (الذكاء الاصطناعي: ${ai.enabled() ? 'مفعّل' : 'غير مفعّل'})`);
    loadCorpus();
  });
}
if (require.main === module) listen();
module.exports = { server, faq, listen };
