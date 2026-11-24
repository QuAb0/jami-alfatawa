// محرك البحث داخل المتصفح للنسخة الثابتة (GitHub Pages): يجيب طلبات /api/* من ملفات data/
// يطبّق نفس قواعد الخادم: تحويل العامية، المرادفات، أوزان الندرة، وبوابة الصلة
(() => {
  const { normalize: norm, dialectToFusha, tokens, concepts } = window.AR;
  const realFetch = window.fetch.bind(window);
  const cache = new Map();
  const load = path => { if (!cache.has(path)) cache.set(path, realFetch('data/' + path).then(r => r.ok ? r.json() : null).catch(() => null)); return cache.get(path); };
  const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json' } });
  const shardName = t => [...t.slice(0, 2)].map(c => c.codePointAt(0).toString(16)).join('_');
  let META;
  const meta = async () => META || (META = await load('meta.json'));
  const doc = async id => (await load(`docs/${Math.floor(id / 100)}.json`))?.[id] || null;

  // كل المواضع التي تظهر فيها كلمة (مع مطابقة البادئة كما في الخادم)
  async function postings(word) {
    const out = new Map();
    const variants = [word];
    if (word.length >= 4 && /^[ايتن]/.test(word)) variants.push(word.slice(1));   // أمسح ← مسح
    for (const v of variants) {
      if (v.length < 2) continue;
      const M = await meta(); const sn = shardName(v);
      if (M.shards && !M.shards.includes(sn)) continue;   // لا توجد كلمات بهذه البداية
      const shard = await load(`idx/${sn}.json`);
      if (!shard) continue;
      for (const k in shard) {
        const ok = k === v || (v.length >= 3 && k.length >= 3 && (k.startsWith(v) || (v === word && v.startsWith(k) && k.length >= v.length - 1)));
        if (!ok) continue;
        let id = 0;
        for (const x of shard[k]) { id += x >> 2; const f = x & 3; if ((out.get(id) ?? -1) < f) out.set(id, f); }
      }
    }
    return out;
  }

  function detectSheikh(q, list) {
    const n = ' ' + norm(q) + ' ';
    return list.find(s => [s.short, ...(s.aliases || [])].some(a => a && n.includes(' ' + norm(a) + ' ')))?.id || null;
  }

  async function search(q, sheikh, opts = {}) {
    const t0 = performance.now();
    const M = await meta(); const dsh = await load('dsh.json');
    const target = sheikh || detectSheikh(q, M.sheikhs);
    let qq = norm(q);
    for (const s of M.sheikhs) for (const a of [s.short, ...(s.aliases || [])]) if (a) qq = qq.replace(norm(a), ' ');
    const words = tokens(qq);
    const groups = concepts(words);
    const N = M.total || 1;
    // لكل مفهوم: الفتاوى التي يظهر فيها وموضعه، ووزنه حسب ندرته
    const W = await Promise.all(groups.map(async g => {
      const m = new Map();
      for (const p of await Promise.all(g.map(postings))) for (const [id, f] of p) if ((m.get(id) ?? -1) < f) m.set(id, f);
      return { m, df: m.size, w: Math.log(1 + N / (m.size + 1)) };
    }));
    const present = W.filter(c => c.df);
    let ranked = [];
    if (present.length) {
      const key = present.reduce((a, b) => (b.w > a.w ? b : a));
      const total = W.reduce((a, c) => a + c.w, 0);
      const cand = new Set(); for (const c of present) for (const id of c.m.keys()) cand.add(id);
      const sIdx = target ? M.sheikhs.findIndex(s => s.id === target) : -1;
      for (const id of cand) {
        if (opts.exclude === id) continue;
        if (sIdx >= 0 && dsh[id] !== sIdx) continue;
        let got = 0, inTitle = 0;
        for (const c of W) { const f = c.m.get(id); if (f === undefined) continue; got += c.w * (f > 0 ? 1 : .55); if (f === 2) inTitle += c.w; }
        if (!key.m.has(id)) continue;
        const cov = got / total;
        if (cov >= .6) ranked.push({ id, cov, inTitle });
      }
      ranked.sort((a, b) => (b.cov - a.cov) || (b.inTitle - a.inTitle) || (b.id - a.id));
    }
    // أفضل ثلاث فتاوى لكل شيخ
    const per = new Map(), pick = [];
    for (const r of ranked) { const s = dsh[r.id]; const n = per.get(s) || 0; if (n < 3) { per.set(s, n + 1); pick.push(r.id); } if (pick.length >= (opts.limit || 15)) break; }
    const docs = (await Promise.all(pick.map(doc))).filter(Boolean);
    const out = [], gm = new Map();
    for (const d of docs) { let g = gm.get(d.sheikh_id); if (!g) { g = { sheikh_id: d.sheikh_id, fatwas: [] }; gm.set(d.sheikh_id, g); out.push(g); } g.fatwas.push(d); }
    return { query: q, fusha: dialectToFusha(q), keywords: words, sheikh: target, groups: out, ms: Math.round(performance.now() - t0) };
  }

  function faq(text) {
    const t = norm(text), has = (...w) => w.some(x => t.includes(x));
    if (has('صوت', 'مايك', 'اتكلم')) return { reply: 'اضغط زر الميكروفون داخل خانة البحث وتكلم بسؤالك، وبعد ما تخلص يبدأ البحث تلقائياً.', search: null };
    if (has('قارن', 'مقارنه', 'اختلاف', 'اقوال')) return { reply: 'بعد ما تبحث، اضغط «مقارنة الأقوال» أعلى النتائج، ويطلع لك جواب كل شيخ في المسألة جنب بعض.', search: null };
    if (has('بعينه', 'شيخا', 'شيخ معين', 'شيخ محدد', 'صفحه الشيخ')) return { reply: 'تقدر تختار الشيخ من القائمة تحت خانة البحث، أو تدخل صفحته من «المشايخ»، أو تكتب اسمه في سؤالك مثل: «وش رأي ابن باز في…».', search: null };
    if (has('حفظ', 'مفضل', 'سجل')) return { reply: 'اضغط «حفظ» تحت أي فتوى، وتلقاها في «المحفوظات» مع أسئلتك السابقة. تنحفظ في جهازك فقط.', search: null };
    if (has('شارك', 'ارسل', 'واتس')) return { reply: 'تحت كل فتوى زر «مشاركة»: واتساب، إكس، نسخ الرابط، أو حفظ بطاقة صورة.', search: null };
    if (has('استمع', 'اسمع', 'قراءه')) return { reply: 'اضغط «استمع» تحت الفتوى. إذا لها صوتية في موقع الشيخ تشتغل، وإلا يقرأ لك الموقع النص.', search: null };
    if (has('موثوق', 'صحيح', 'رابط', 'مصدر', 'تاكد')) return { reply: 'كل جواب منقول بنصه من موقع الشيخ، وتحته رابط يوديك لصفحة الفتوى الأصلية عشان تتأكد بنفسك.', search: null };
    if (has('حكم', 'يجوز', 'حلال', 'حرام')) return { reply: 'أنا مساعد للموقع وما أفتي، لكن أقدر أبحث لك في فتاوى المشايخ عن سؤالك.', search: text };
    return { reply: 'أهلاً! أقدر أساعدك في استخدام الموقع: البحث، وسؤال شيخ بعينه، ومقارنة الأقوال، والأبواب، والمشاركة، والمحفوظات. وش تبي تعرف؟', search: null };
  }

  window.fetch = async (input, opts = {}) => {
    const u = typeof input === 'string' ? input : input.url;
    if (!u.startsWith('/api/')) return realFetch(input, opts);
    const url = new URL(u, 'http://x'), p = url.pathname, qs = url.searchParams;
    try {
      if (p === '/api/meta') return json(await meta());
      if (p === '/api/search') {
        const q = (qs.get('q') || '').trim();
        if (q.length < 2) return json({ error: 'اكتب سؤالك.' }, 400);
        return json(await search(q, qs.get('sheikh') || null));
      }
      let m;
      if ((m = p.match(/^\/api\/fatwa\/(\d+)$/))) {
        const f = await doc(Number(m[1]));
        if (!f) return json({ error: 'الفتوى غير موجودة' }, 404);
        const rel = await search(f.title, null, { exclude: f.id, limit: 6 });
        return json({ fatwa: f, related: rel.groups.flatMap(g => g.fatwas).slice(0, 5) });
      }
      if (p === '/api/browse') {
        const sh = qs.get('sheikh'), cat = qs.get('cat'), page = Number(qs.get('page')) || 0;
        const key = sh && cat ? `shcat/${sh}/${cat}` : sh ? `sh/${sh}` : cat ? `cat/${cat}` : 'all';
        return json(await load(`lists/${key}/${page}.json`) || { total: 0, page, items: [] });
      }
      if (p === '/api/assistant') { const { messages } = JSON.parse(opts.body || '{}'); return json(faq(messages?.at(-1)?.content || '')); }
      if (p.startsWith('/api/admin')) return json({ error: 'في النسخة المجانية يتم الجمع تلقائياً كل ليلة عبر GitHub Actions، ولا توجد لوحة إدارة.' }, 400);
      return json({ error: 'غير متاح' }, 404);
    } catch (e) { return json({ error: 'تعذر تحميل البيانات. تحقق من الإنترنت وأعد المحاولة.' }, 500); }
  };
})();
