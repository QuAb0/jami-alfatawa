// أداة جمع الفتاوى من مواقع المشايخ
// طرق اكتشاف الروابط (حسب إعدادات كل موقع في config/sheikhs.json):
//   sitemaps : خرائط الموقع (ويقرأ أيضاً ما في robots.txt)
//   seeds    : صفحات قوائم يتتبع روابطها (follow) ويلتقط روابط الفتاوى (include)
//   ids      : أرقام متسلسلة {template, from, to}، ويبدأ من الأحدث
// الاستخدام: node server/crawler.js [--sheikh binbaz] [--limit 200] [--ai] [--delay 1500] [--refresh]
const path = require('path');
const fs = require('fs');
const envFile = path.join(__dirname, '..', '.env');
if (fs.existsSync(envFile)) for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
  if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const { db, saveFatwa } = require('./db');
const sheikhs = require('./sheikhs');
const ai = require('./ai');
const CATEGORIES = require('./categories');

const argv = process.argv.slice(2);
const opt = k => { const i = argv.indexOf('--' + k); return i < 0 ? null : (argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : true); };
const ONLY = opt('sheikh'), LIMIT = Number(opt('limit')) || 200, USE_AI = Boolean(opt('ai')) && ai.enabled();
const DELAY = Number(opt('delay')) || 1500, REFRESH = Boolean(opt('refresh'));
const MAX_MIN = Number(opt('max-minutes')) || 0;   // حد زمني للتشغيل كله (لـ GitHub Actions)
const UA = process.env.CRAWLER_UA || 'Mozilla/5.0 (compatible; FatwaHubBot/1.0)';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

class HttpError extends Error { constructor(s) { super('HTTP ' + s); this.status = s; } }
async function get(url) {
  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 25000);
  try {
    const res = await fetch(url, { headers: { 'user-agent': UA, 'accept-language': 'ar,en;q=0.5', accept: 'text/html,application/xhtml+xml,application/xml' }, signal: ctrl.signal, redirect: 'follow' });
    if (!res.ok) throw new HttpError(res.status);
    const buf = Buffer.from(await res.arrayBuffer());
    let cs = (res.headers.get('content-type') || '').match(/charset=([\w-]+)/i)?.[1];
    if (!cs) cs = buf.slice(0, 2000).toString('latin1').match(/charset=["']?([\w-]+)/i)?.[1];
    let text; try { text = new TextDecoder(cs || 'utf-8').decode(buf); } catch { text = buf.toString('utf8'); }
    return { text, finalUrl: res.url };
  } finally { clearTimeout(t); }
}
const fetchUrl = (url, site) => site.fetch ? url.replace(site.fetch.from, site.fetch.to) : url;

// ---------- robots.txt ----------
async function robots(origin) {
  const rules = { disallow: [], sitemaps: [] };
  try {
    const { text } = await get(origin + '/robots.txt');
    let applies = false;
    for (const raw of text.split(/\r?\n/)) {
      const line = raw.replace(/#.*/, '').trim();
      const i = line.indexOf(':'); if (i < 0) continue;
      const k = line.slice(0, i).trim().toLowerCase(), val = line.slice(i + 1).trim();
      if (k === 'user-agent') applies = val === '*' || /fatwahub/i.test(val);
      else if (k === 'disallow' && applies && val) rules.disallow.push(val);
      else if (k === 'sitemap' && val) rules.sitemaps.push(val);
    }
  } catch { /* لا يوجد robots */ }
  return rules;
}
const allowed = (url, rules) => { const u = new URL(url), p = u.pathname + u.search; return !rules.disallow.some(d => p.startsWith(d.replace(/\*.*$/, ''))); };

const decode = s => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16))).replace(/&nbsp;/g, ' ');

// ---------- الاكتشاف ----------
async function fromSitemaps(list, include, max) {
  const out = new Set(), queue = [...list], seen = new Set();
  while (queue.length && out.size < max * 3 && seen.size < 300) {
    const sm = queue.shift(); if (seen.has(sm)) continue; seen.add(sm);
    let xml; try { xml = (await get(sm)).text; } catch (e) { log('تعذر قراءة خريطة', sm, e.message); continue; }
    const locs = [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map(m => decode(m[1]));
    if (/<sitemapindex/i.test(xml)) {
      const score = u => /fatw|answer|question|content/i.test(u) ? 1 : 0;
      queue.push(...locs.sort((a, b) => score(b) - score(a)));
    } else for (const u of locs) if (include.some(r => r.test(u))) out.add(u);
    await sleep(300);
  }
  return [...out];
}

async function fromSeeds(site, include, max, rules, done, deadline) {
  const follow = (site.follow || []).map(r => new RegExp(r));
  const out = new Set(), queue = [...site.seeds], seen = new Set();
  const maxPages = site.maxListPages || 3000;
  while (queue.length && out.size < max && seen.size < maxPages && Date.now() < deadline) {
    const page = queue.shift(); if (seen.has(page)) continue; seen.add(page);
    let html; try { html = (await get(fetchUrl(page, site))).text; } catch (e) { log('تعذر فتح قائمة', page, e.message); continue; }
    for (const m of html.matchAll(/href=["']([^"'#]+)["']/gi)) {
      let u; try { u = new URL(decode(m[1]), page).href; } catch { continue; }
      if (!allowed(u, rules)) continue;
      if (include.some(r => r.test(u))) { if (!done.has(u)) out.add(u); }
      else if (follow.some(r => r.test(u)) && !seen.has(u)) queue.push(u);
    }
    // صفحات الترقيم التالية حتى لو لم تظهر كلها في الصفحة
    const pm = page.match(/[?&]page=(\d+)/);
    if (follow.length) { const next = pm ? page.replace(/([?&]page=)\d+/, `$1${+pm[1] + 1}`) : page + (page.includes('?') ? '&' : '?') + 'page=2';
      if (follow.some(r => r.test(next)) && !seen.has(next) && html.includes('page=')) queue.push(next); }
    await sleep(Math.min(DELAY, 800));
  }
  return [...out];
}

function fromIds(site, max, done) {
  const { template, from = 1, to } = site.ids;
  const out = [];
  for (let id = to; id >= from && out.length < max; id--) {   // الأحدث أولاً
    const u = template.replace('{id}', id);
    if (!done.has(u)) out.push(u);
  }
  return out;
}

// ---------- استخراج الفتوى ----------
function toText(html) {
  return decode(html
    .replace(/<(script|style|noscript|svg|nav|header|footer|aside|form|iframe|select|button)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|li|h\d|blockquote|section|tr|article)>/gi, '\n').replace(/<(h\d)[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' '))
    .replace(/[ \t ]+/g, ' ').split('\n').map(l => l.trim()).join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

function pickMain(html) {
  return html.match(/<article\b[\s\S]*?<\/article>/i)?.[0] || html.match(/<main\b[\s\S]*?<\/main>/i)?.[0] || html.match(/<body\b[\s\S]*<\/body>/i)?.[0] || html;
}

function extract(html, site) {
  const ex = site.extract || {};
  const meta = n => html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${n}["'][^>]+content=["']([^"']+)`, 'i'))?.[1];
  let title = toText(html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1] || '') || decode(meta('og:title') || '') || toText(html.match(/<title>([\s\S]*?)<\/title>/i)?.[1] || '');
  title = title.replace(/^الموقع الرسمي[^-–|]*[-–|]\s*/, '').replace(/\s*[|\-–]\s*(موقع|الموقع)[^|\-–]*$/, '').trim();

  // بيانات منظمة QAPage إن وجدت
  for (const m of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    try { const j = JSON.parse(m[1]); for (const it of (Array.isArray(j) ? j : j['@graph'] || [j])) if (it['@type'] === 'QAPage' && it.mainEntity?.acceptedAnswer?.text)
      return { title: title || toText(it.mainEntity.name || ''), question: toText(it.mainEntity.text || ''), answer: toText(it.mainEntity.acceptedAnswer.text), full: toText(pickMain(html)), audio: audioOf(html) };
    } catch { /* تجاهل */ }
  }

  let text = toText(pickMain(html));
  const full = text;
  if (ex.require && !new RegExp(ex.require).test(text)) return { skip: 'ليست فتوى (درس أو كتاب)', title, full };
  // ابدأ بعد العنوان، واحذف سطور البيانات الوصفية
  if (title) { const i = text.indexOf(title); if (i >= 0 && i < text.length / 2) text = text.slice(i + title.length); }
  const drops = (ex.drop || []).map(r => new RegExp(r));
  let lines = text.split('\n').filter(l => !drops.some(r => r.test(l)));
  text = lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  // النهاية
  for (const e of ex.end || []) { const m = text.match(new RegExp('\\n\\s*' + e)); if (m && m.index > 40) text = text.slice(0, m.index); }

  const lab = arr => (arr || []).map(x => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  const qL = lab(ex.questionLabels || ['السؤال']), aL = lab(ex.answerLabels || ['الجواب']);
  let question = '', answer = text;
  const label = L => L && new RegExp(`(?:^|\\n)\\s*(?:${L})\\s*[:：]\\s*`);
  // السؤال ينتهي عند أول سطر ينتهي بعلامة استفهام (خلال 6 أسطر) وإلا فهو السطر الأول
  const splitQ = rest => { const ls = rest.split('\n'); let k = ls.slice(0, 6).findIndex(l => /[؟?]\s*$/.test(l)); if (k < 0) k = 0;
    return [ls.slice(0, k + 1).join('\n'), ls.slice(k + 1).join('\n')]; };
  const qm = text.match(label(qL));
  if (qm) {
    const rest = text.slice(qm.index + qm[0].length);
    const am = rest.match(label(aL));
    if (am && am.index > 5) { question = rest.slice(0, am.index); answer = rest.slice(am.index + am[0].length); }
    else [question, answer] = splitQ(rest);
  } else {
    const am = text.match(label(aL));
    if (am && am.index > 5) { question = text.slice(0, am.index); answer = text.slice(am.index + am[0].length); }
    else if (am) answer = text.slice(am.index + am[0].length);
  }
  answer = answer.replace(label(aL), '');
  // احذف السطور القصيرة في آخر الجواب (تصنيفات وروابط)
  const al = answer.trim().split('\n');
  while (al.length > 1 && al.at(-1).length < 40 && !/[.؟!،]$/.test(al.at(-1))) al.pop();
  answer = al.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  return { title, question: question.replace(/\s+\n/g, '\n').trim(), answer, full, audio: audioOf(html) };
}
const audioOf = html => html.match(/(?:src|href)=["']([^"']+\.(?:mp3|m4a|ogg))(?:\?[^"']*)?["']/i)?.[1] || null;

// ---------- الجمع ----------
async function crawlSheikh(s, deadline = Infinity) {
  const site = s.site;
  const include = (site.include || ['.']).map(r => new RegExp(r));
  const origin = `https://${site.domain}`;
  const rules = await robots(new URL(fetchUrl(origin + '/', site)).origin);
  const done = new Set(REFRESH ? [] : db.prepare("SELECT url FROM crawled WHERE url LIKE ?").all(`%${site.domain}%`).map(r => r.url));

  let urls = [];
  const sitemaps = [...new Set([...(site.sitemaps || []), ...rules.sitemaps])];
  if (sitemaps.length) { log(`${s.short}: قراءة ${sitemaps.length} خريطة موقع`); urls = await fromSitemaps(sitemaps, include, LIMIT); }
  if (!urls.length && site.seeds?.length) { log(`${s.short}: تتبع صفحات القوائم`); urls = await fromSeeds(site, include, LIMIT, rules, done, deadline); }
  urls = urls.filter(u => !done.has(u) && allowed(u, rules));
  if (!urls.length && site.ids) { log(`${s.short}: المرور على أرقام الصفحات`); urls = fromIds(site, LIMIT, done); }
  if (!urls.length) { log(`${s.short}: لا توجد روابط جديدة (جُمع كل ما وُجد، أو راجع إعدادات الموقع)`); return; }
  urls = urls.slice(0, LIMIT);
  log(`${s.short}: ${urls.length} صفحة للمعالجة`);

  let ok = 0, skip = 0, miss = 0;
  const mark = (url, st) => db.prepare('INSERT OR REPLACE INTO crawled (url, status) VALUES (?, ?)').run(url, st);
  for (const [i, url] of urls.entries()) {
    if (Date.now() > deadline) { log(`${s.short}: انتهى الوقت المخصص، نكمل في التشغيل القادم`); break; }
    try {
      const { text: html } = await get(fetchUrl(url, site));
      let f = extract(html, site);
      if (f.skip) { mark(url, 'skip'); skip++; continue; }
      if (USE_AI) {
        try {
          const x = await ai.extractPage(f.title, f.full, CATEGORIES);
          if (x.is_fatwa === false) { mark(url, 'skip'); skip++; continue; }
          f = { ...f, ...(x.question != null ? { question: x.question } : {}), ...(x.answer ? { answer: x.answer } : {}), summary: x.summary, category: x.category };
        } catch (e) { log('تعذر التحليل الذكي، نكمل بالاستخراج العادي:', e.message); }
      }
      if (!f.title || (f.answer || '').length < 40) { mark(url, 'empty'); miss++; continue; }
      const audio = f.audio ? new URL(f.audio, fetchUrl(url, site)).href : null;
      saveFatwa({ sheikh_id: s.id, url, title: f.title.slice(0, 300), question: f.question, answer: f.answer, summary: f.summary, category: f.category, audio_url: audio });
      mark(url, 'ok'); ok++;
    } catch (e) {
      if (e.status === 404 || e.status === 410) { mark(url, 'gone'); miss++; }
      else { mark(url, 'err'); log('تخطي', url, e.message); if (e.status === 429 || e.status === 403) { log('الموقع يطلب التمهل، ننتظر دقيقة'); await sleep(60000); } }
    }
    if ((i + 1) % 25 === 0 || i === urls.length - 1) log(`${s.short}: ${i + 1}/${urls.length} — حُفظت ${ok}، ليست فتاوى ${skip}، فارغة أو غير موجودة ${miss}`);
    await sleep(DELAY);
  }
  log(`✓ ${s.short}: حُفظت ${ok} فتوى`);
}

if (require.main === module) (async () => {
  const list = sheikhs.all().filter(s => !ONLY || s.id === ONLY);
  if (!list.length) { log('لا يوجد شيخ بهذا المعرّف'); process.exit(1); }
  log(`بدء الجمع (${USE_AI ? 'مع' : 'بدون'} تحليل ذكي، حتى ${LIMIT} صفحة لكل موقع)`);
  const end = MAX_MIN ? Date.now() + MAX_MIN * 60000 : Infinity;
  for (const [i, s] of list.entries()) {
    // الوقت المتبقي يُقسم بالتساوي على المشايخ الباقين
    const deadline = end === Infinity ? Infinity : Date.now() + (end - Date.now()) / (list.length - i);
    try { await crawlSheikh(s, deadline); } catch (e) { log('خطأ في', s.short, e.message); }
  }
  log('اكتمل الجمع');
})();

module.exports = { extract, toText, get, fetchUrl };
