// الاتصال بـ Claude API مع مهلة زمنية صارمة، وكل وظيفة لها بديل محلي إذا تأخرت أو فشلت
const API_KEY = () => process.env.ANTHROPIC_API_KEY;
const FAST_MODEL = () => process.env.FAST_MODEL || 'claude-haiku-5-5';

const enabled = () => Boolean(API_KEY());

async function call({ system, messages, max_tokens = 600, timeoutMs = 2500, model }) {
  if (!enabled()) throw new Error('no-key');
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch((process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com') + '/v1/messages', {
      method: 'POST',
      signal: ctrl.signal,
      headers: { 'x-api-key': API_KEY(), 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: model || FAST_MODEL(), max_tokens, system, messages }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error?.message || `API ${res.status}`);
    return (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
  } finally { clearTimeout(t); }
}

function parseJSON(text) {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) throw new Error('no-json');
  return JSON.parse(m[0]);
}

// 1) فهم السؤال: من العامية إلى الفصحى + كلمات البحث + الشيخ المطلوب إن ذُكر
async function understand(question, sheikhs, categories) {
  const system = `أنت محلل أسئلة شرعية لمحرك بحث فتاوى. لا تُفتِ أبداً.
حوّل سؤال السائل (قد يكون عامياً أو فيه أخطاء) إلى سؤال فقهي فصيح موجز، واستخرج كلمات البحث.
المشايخ المتاحون (id: الاسم): ${sheikhs.map(s => `${s.id}: ${s.name}`).join('، ')}
الأبواب (id: الاسم): ${categories.map(c => `${c.id}: ${c.name}`).join('، ')}
أخرج JSON فقط:
{"fusha":"السؤال بالفصحى","core":["1-3 مصطلحات جوهرية تحدد موضوع المسألة بدقة، بلا كلمات عامة مثل حكم أو يجوز أو أكل أو فعل. مثال: سؤال «وش حكم اكل مال الربا» ← [\"الربا\"]"],"keywords":["6-10 كلمات ومصطلحات فقهية ومرادفات تُتوقع في نص الفتوى"],"sheikh_id":"id إن طلب السائل شيخاً بعينه وإلا null","category":"id الباب أو null"}`;
  const text = await call({ system, messages: [{ role: 'user', content: question }], max_tokens: 300, timeoutMs: 2200 });
  const j = parseJSON(text);
  return {
    fusha: String(j.fusha || '').slice(0, 300),
    keywords: (Array.isArray(j.keywords) ? j.keywords : []).map(String).slice(0, 12),
    core: (Array.isArray(j.core) ? j.core : []).map(String).slice(0, 3),
    sheikh_id: sheikhs.some(s => s.id === j.sheikh_id) ? j.sheikh_id : null,
    category: categories.some(c => c.id === j.category) ? j.category : null,
  };
}

// 2) ترتيب النتائج: يختار الفتاوى التي تجيب فعلاً عن السؤال (لا يكتب أي جواب)
async function rerank(fusha, candidates) {
  const list = candidates.map(c => `[${c.id}] ${c.title}\n${(c.question || '').slice(0, 160)}\n${c.answer.slice(0, 260)}`).join('\n---\n');
  const system = `أنت مدقق صارم: تختار من قائمة فتاوى ما يجيب عن المسألة نفسها التي سأل عنها المستخدم. لا تكتب جواباً ولا حكماً.
قواعد:
- اقبل الفتوى فقط إذا كان موضوعها هو موضوع السؤال (مثلاً سؤال عن الربا يقبل فتاوى الربا والفوائد البنكية فقط).
- ارفض أي فتوى تشترك مع السؤال في كلمة عامة فقط (مثل أكل أو حكم أو صلاة) وموضوعها مختلف.
- الخطأ بعرض فتوى في غير الموضوع أسوأ بكثير من عدم عرض شيء.
أخرج JSON فقط: {"ids":[أرقام الفتاوى المقبولة مرتبة من الأقرب]} وإن لم يكن شيء منها في الموضوع فأرجع [].`;
  const text = await call({ system, messages: [{ role: 'user', content: `السؤال: ${fusha}\n\nالفتاوى:\n${list}` }], max_tokens: 150, timeoutMs: 2300 });
  const j = parseJSON(text);
  const valid = new Set(candidates.map(c => c.id));
  return (Array.isArray(j.ids) ? j.ids : []).map(Number).filter(id => valid.has(id));
}

// 3) المساعد الآلي للموقع
const SITE_GUIDE = `أنت «دليل»، المساعد الآلي لموقع «جامع الفتاوى». تشرح للزوار طريقة استخدام الموقع بلطف واختصار وبالعربية.
خدمات الموقع:
- البحث العام: يكتب السائل سؤاله بأي لهجة، فيظهر جواب كل شيخ منقولاً من موقعه مع رابط الفتوى الأصلية.
- السؤال الموجه لشيخ: من صفحة الشيخ، أو باختيار الشيخ تحت خانة البحث، أو بكتابة اسمه في السؤال.
- مقارنة أقوال المشايخ: زر «قارن الأقوال» في صفحة النتائج.
- الأبواب الفقهية: تصفح الفتاوى حسب الباب.
- السؤال بالصوت: زر الميكروفون في خانة البحث.
- الاستماع: زر «استمع» يقرأ الفتوى، أو يشغل الصوتية إن كانت في موقع الشيخ.
- المشاركة: زر «شارك» لواتساب وإكس ونسخ الرابط وحفظ بطاقة صورة.
- المفضلة والسجل: زر النجمة للحفظ، وصفحة «محفوظاتي» فيها المفضلة والأسئلة السابقة (تُحفظ في جهاز الزائر فقط).
- فتوى اليوم والأكثر بحثاً في الصفحة الرئيسية، و«فتاوى ذات صلة» تحت كل فتوى.
قواعد: لا تُفتِ أبداً ولا تذكر حكماً شرعياً من عندك. إذا سأل الزائر سؤالاً شرعياً فقل إنك دليل للموقع، واقترح البحث عنه.
أخرج JSON فقط: {"reply":"ردك","search":"نص سؤال شرعي مقترح للبحث إن وُجد وإلا null"}`;

async function assistant(messages) {
  const text = await call({ system: SITE_GUIDE, messages, max_tokens: 400, timeoutMs: 8000 });
  try { const j = parseJSON(text); return { reply: String(j.reply || ''), search: j.search ? String(j.search) : null }; }
  catch { return { reply: text.trim(), search: null }; }
}

// 4) عند الجمع (اختياري): يحدد مواضع السؤال والجواب في نص الصفحة، والقص يتم برمجياً
//    فلا يعيد النموذج كتابة النص، وهذا أرخص بكثير ويضمن بقاء ألفاظ الشيخ كما هي
async function extractPage(title, text, categories) {
  const src = text.slice(0, 14000);
  const system = `تحدد مواضع فتوى داخل نص صفحة ويب. لا تعد كتابة النص.
أخرج JSON فقط:
{"is_fatwa":true|false,
 "q_start":"أول 6-8 كلمات من السؤال حرفياً أو null إن لم يوجد سؤال",
 "a_start":"أول 6-8 كلمات من الجواب حرفياً",
 "a_end":"آخر 6-8 كلمات من الجواب حرفياً",
 "summary":"جملة واحدة تلخص جواب الشيخ كما ورد دون إضافة",
 "category":"واحد من: ${categories.map(c => c.id).join(', ')}"}
is_fatwa=false إذا كانت الصفحة درساً طويلاً أو شرح كتاب أو ليست سؤالاً وجواباً.`;
  const t = await call({ system, messages: [{ role: 'user', content: `العنوان: ${title}\n\n${src}` }], max_tokens: 400, timeoutMs: 45000 });
  const j = parseJSON(t);
  const find = (needle, from = 0) => { if (!needle) return -1; const n = String(needle).trim(); let i = src.indexOf(n, from);
    if (i < 0) { const short = n.split(/\s+/).slice(0, 4).join(' '); i = src.indexOf(short, from); } return i; };
  const out = { is_fatwa: j.is_fatwa !== false, summary: j.summary ? String(j.summary).slice(0, 400) : null,
    category: categories.some(c => c.id === j.category) ? j.category : null };
  const a0 = find(j.a_start);
  if (a0 >= 0) {
    let a1 = j.a_end ? src.indexOf(String(j.a_end).trim(), a0) : -1;
    a1 = a1 >= 0 ? a1 + String(j.a_end).trim().length : src.length;
    out.answer = src.slice(a0, a1).trim();
    const q0 = find(j.q_start);
    if (q0 >= 0 && q0 < a0) out.question = src.slice(q0, a0).replace(/\n?\s*(الجواب|الشيخ|ج\d*)\s*[:：]?\s*$/, '').trim();
  }
  return out;
}

// 5) البحث المباشر: يبحث في مواقع المشايخ نفسها عبر أداة بحث Claude ويعيد روابط الفتاوى فقط
//    (النص يُجلب من الصفحة نفسها لاحقاً، فلا يكتب النموذج شيئاً على لسان الشيخ)
async function liveSearch(question, fusha, sheikhs) {
  if (!enabled()) throw new Error('no-key');
  const domains = sheikhs.map(s => s.site.domain);
  const system = `تبحث عن فتاوى منشورة في مواقع المشايخ التالية فقط:
${sheikhs.map(s => `- ${s.site.domain} (${s.name})`).join('\n')}
ابحث بعدة صيغ فقهية وعامية حتى تجد صفحات فتاوى تجيب عن المسألة نفسها.
لا تذكر إلا صفحات ظهرت فعلاً في نتائج البحث، وموضوعها هو موضوع السؤال نفسه (لا موضوع يشترك معه في كلمة عامة).
أخرج في النهاية JSON فقط بين <result> و</result>:
{"pages":[{"url":"رابط صفحة الفتوى كما ظهر","title":"عنوانها"}]}  بحد أقصى 6 صفحات، وقائمة فارغة إن لم تجد.`;
  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 60000);
  const body = { model: process.env.LIVE_MODEL || process.env.FAST_MODEL || 'claude-haiku-5-5', max_tokens: 1500, system,
    messages: [{ role: 'user', content: `السؤال: ${question}\nبالفصحى: ${fusha}` }],
    tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 5, allowed_domains: domains }] };
  const seen = new Set(); let text = '';
  try {
    for (let i = 0; i < 3; i++) {
      const res = await fetch((process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com') + '/v1/messages', { method: 'POST', signal: ctrl.signal,
        headers: { 'x-api-key': API_KEY(), 'anthropic-version': '2023-06-01', 'content-type': 'application/json' }, body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message || `API ${res.status}`);
      for (const b of data.content || []) {
        if (b.type === 'web_search_tool_result' && Array.isArray(b.content)) for (const r of b.content) if (r.url) seen.add(r.url.replace(/\/+$/, ''));
        if (b.type === 'text') text += b.text;
      }
      if (data.stop_reason !== 'pause_turn') break;
      body.messages = [...body.messages, { role: 'assistant', content: data.content }];
    }
  } finally { clearTimeout(t); }
  const m = text.match(/<result>([\s\S]*?)<\/result>/) || text.match(/(\{[\s\S]*\})/);
  let pages = [];
  try { pages = JSON.parse(m[1]).pages || []; } catch { pages = []; }
  // نقبل فقط روابط ظهرت فعلاً في نتائج البحث
  return pages.filter(p => p && typeof p.url === 'string' && seen.has(p.url.replace(/\/+$/, ''))).slice(0, 6);
}

module.exports = { enabled, understand, rerank, assistant, extractPage, liveSearch };
