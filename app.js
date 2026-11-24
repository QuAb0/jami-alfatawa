{
// ================= أدوات =================
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const safeUrl = u => /^https?:\/\//i.test(u || '') ? u : '#';
const fmt = n => Number(n || 0).toLocaleString('ar-SA');
const view = $('#view');
const PREVIEW = Boolean(window.__PREVIEW);
const BASE = window.__BASE || '/';
const ORIGIN = PREVIEW ? 'https://fatwa-hub.example' : location.origin + BASE.replace(/\/$/, '');
const store = {
  get(k, d) { try { return JSON.parse(localStorage.getItem('fh:' + k)) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem('fh:' + k, JSON.stringify(v)); } catch { /* التخزين غير متاح */ } },
};
async function api(path, opts = {}) {
  const res = await fetch(path, { ...opts, headers: { 'content-type': 'application/json', ...(opts.headers || {}) } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'تعذر الاتصال بالخادم. تحقق من الإنترنت ثم أعد المحاولة.');
  return data;
}
function toast(t) { const el = $('#toast'); el.textContent = t; el.classList.add('on'); clearTimeout(el._t); el._t = setTimeout(() => el.classList.remove('on'), 2300); }

// ================= الأيقونات (خط واحد 1.7) =================
const sv = (d, extra = '') => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra}>${d}</svg>`;
const I = {
  send: sv('<path d="M19 12H5M11 5l-7 7 7 7"/>'),
  mic: sv('<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21"/>'),
  search: sv('<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4-4"/>'),
  ext: sv('<path d="M14 4h6v6M20 4l-8.5 8.5M18 13.5V19a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5.5"/>'),
  play: sv('<path d="M10 8.5v7l5.5-3.5z" fill="currentColor"/><circle cx="12" cy="12" r="9"/>'),
  stop: sv('<rect x="9" y="9" width="6" height="6" rx="1" fill="currentColor"/><circle cx="12" cy="12" r="9"/>'),
  share: sv('<path d="M12 15V4M8 8l4-4 4 4M5 13v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5"/>'),
  save: sv('<path d="M6.5 4h11a1 1 0 0 1 1 1v15l-6.5-4-6.5 4V5a1 1 0 0 1 1-1z"/>'),
  saved: sv('<path d="M6.5 4h11a1 1 0 0 1 1 1v15l-6.5-4-6.5 4V5a1 1 0 0 1 1-1z" fill="currentColor"/>'),
  chev: sv('<path d="m15 6-6 6 6 6"/>'),
  down: sv('<path d="m6 9 6 6 6-6"/>'),
  arrow: sv('<path d="M19 12H5M10 7l-5 5 5 5"/>'),
  empty: sv('<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4-4M8.5 11h5"/>'),
  quote: sv('<path d="M9.5 7H6a1 1 0 0 0-1 1v4h4.5V7zM9.5 12c0 2.5-1.2 4.2-3.5 5M19 7h-3.5a1 1 0 0 0-1 1v4H19V7zM19 12c0 2.5-1.2 4.2-3.5 5"/>'),
  link: sv('<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>'),
  shield: sv('<path d="M12 3 5 6v5c0 4.5 3 8.3 7 10 4-1.7 7-5.5 7-10V6z"/><path d="m9 12 2 2 4-4"/>'),
  spark: sv('<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/>'),
  check: sv('<path d="m5 12.5 4.5 4.5L19 7.5"/>', 'stroke-width="2.6"'),
  brain: sv('<path d="M9 4a3 3 0 0 0-3 3 3 3 0 0 0-2 5 3 3 0 0 0 2 5 3 3 0 0 0 3 3h1V4zM15 4a3 3 0 0 1 3 3 3 3 0 0 1 2 5 3 3 0 0 1-2 5 3 3 0 0 1-3 3h-1V4z"/>'),
  globe: sv('<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z"/>'),
  rank: sv('<path d="M4 6h16M4 12h10M4 18h6"/><path d="m17 15 2 2 3-4"/>'),
  doc: sv('<path d="M7 3h7l4 4v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"/><path d="M14 3v4h4M9 12h6M9 16h4"/>'),
  // الأبواب
  star: sv('<path d="m12 3.5 2.6 5.3 5.9.9-4.2 4.1 1 5.8-5.3-2.8-5.3 2.8 1-5.8-4.2-4.1 5.9-.9z"/>'),
  drop: sv('<path d="M12 3.5s6 6.4 6 10.6a6 6 0 0 1-12 0c0-4.2 6-10.6 6-10.6z"/>'),
  arch: sv('<path d="M5 20v-9a7 7 0 0 1 14 0v9M3.5 20h17M9.5 20v-5a2.5 2.5 0 0 1 5 0v5"/>'),
  coin: sv('<ellipse cx="12" cy="7" rx="7" ry="3"/><path d="M5 7v5c0 1.7 3.1 3 7 3s7-1.3 7-3V7M5 12v5c0 1.7 3.1 3 7 3s7-1.3 7-3v-5"/>'),
  moon: sv('<path d="M19.5 14.5A7.5 7.5 0 1 1 9.5 4.5a6 6 0 0 0 10 10z"/>'),
  kaaba: sv('<path d="M4 8l8-4 8 4v10l-8 3-8-3z"/><path d="M4 8l8 3 8-3M12 11v10M4 11.5l8 3 8-3"/>'),
  scale: sv('<path d="M12 4v16M8 20h8M5 7h14M5 7l-2.5 6a2.5 2.5 0 0 0 5 0zM19 7l-2.5 6a2.5 2.5 0 0 0 5 0z"/>'),
  home: sv('<path d="M4 11l8-7 8 7v9H4z"/><path d="M12 17.5s-2.8-1.7-2.8-3.6a1.5 1.5 0 0 1 2.8-.8 1.5 1.5 0 0 1 2.8.8c0 1.9-2.8 3.6-2.8 3.6z"/>'),
  leaf: sv('<path d="M5 19C5 10.5 10 5.5 19.5 4.5 18.5 14 13.5 19 5 19z"/><path d="M5 19l7.5-7.5"/>'),
  heart: sv('<path d="M12 19.5s-7.5-4.4-7.5-9.7A4 4 0 0 1 12 7.4a4 4 0 0 1 7.5 2.4c0 5.3-7.5 9.7-7.5 9.7z"/>'),
  book: sv('<path d="M5 5.5A1.5 1.5 0 0 1 6.5 4H19v14H6.5A1.5 1.5 0 0 0 5 19.5z"/><path d="M5 19.5V5.5"/>'),
};

// ================= البيانات العامة =================
let META = { sheikhs: [], categories: [], total: 0 };
const sheikhById = id => META.sheikhs.find(s => s.id === id) || { id, name: id, short: id, color: '#19e3a5', site: {} };
const catById = id => META.categories.find(c => c.id === id);
const color = s => /^#[0-9a-f]{3,8}$/i.test(s.color || '') ? s.color : '#19e3a5';
function initial(s) { const w = (s.short || s.name || '').split(/\s+/).filter(x => !/^(الشيخ|ابن|بن)$/.test(x))[0] || ''; return esc(w.replace(/^ال(?=..)/, '').charAt(0)); }
const av = (s, cls = '') => `<span class="av ${cls}" style="--c:${color(s)}" aria-hidden="true">${initial(s)}</span>`;
const who = (s, sub) => `<div class="who">${av(s)}<div><b>${esc(s.name)}</b>${sub !== false ? `<small>${esc(sub || s.site?.domain || '')}</small>` : ''}</div></div>`;

// ================= المحفوظات والسجل =================
const favs = () => store.get('fav', {});
const isFav = id => Boolean(favs()[id]);
function toggleFav(f) {
  const all = favs();
  if (all[f.id]) delete all[f.id]; else all[f.id] = { id: f.id, title: f.title, sheikh_id: f.sheikh_id, excerpt: (f.answer || '').slice(0, 220), at: Date.now() };
  store.set('fav', all); updateSavedCount();
  return Boolean(all[f.id]);
}
function addHistory(q, sheikh) {
  const h = store.get('hist', []).filter(x => !(x.q === q && x.sheikh === sheikh));
  h.unshift({ q, sheikh, at: Date.now() }); store.set('hist', h.slice(0, 50));
}
function updateSavedCount() { const n = Object.keys(favs()).length; const b = $('#savedCount'); b.hidden = !n; b.textContent = fmt(n); }

// ================= خانة السؤال =================
let askN = 0;
function ask({ q = '', sheikh = '', fixed = null, placeholder } = {}) {
  const ph = placeholder || 'اكتب سؤالك كما تقوله، مثلاً: وش حكم اني اجمع الصلاة وانا مسافر؟';
  const opts = META.sheikhs.map(s => `<option value="${esc(s.id)}" ${s.id === sheikh ? 'selected' : ''}>${esc(s.name)}</option>`).join('');
  const f = fixed ? sheikhById(fixed) : null, id = 'askq' + (++askN);
  return `<div class="ask-wrap"><form class="ask" data-ask ${f ? `data-fixed="${esc(f.id)}"` : ''} role="search">
    <label class="sr" for="${id}">سؤالك</label>
    <textarea id="${id}" name="q" rows="1" maxlength="600" placeholder="${esc(ph)}" required>${esc(q)}</textarea>
    <div class="ask-row">
      ${f ? `<span class="pick-fixed">${av(f, 'av-sm')} من فتاوى ${esc(f.short)}</span>` : `<select class="pick" name="sheikh" aria-label="من فتاوى"><option value="">من فتاوى جميع المشايخ</option>${opts}</select>`}
      <span class="grow"></span>
      <button type="button" class="mic" data-mic aria-label="اسأل بصوتك" title="اسأل بصوتك">${I.mic}</button>
      <button class="go" aria-label="ابحث">${I.send}</button>
    </div>
  </form></div>`;
}
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
function grow(ta) { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 220) + 'px'; }
function bindAsk(root = view) {
  for (const form of $$('[data-ask]', root)) {
    const ta = $('textarea', form);
    grow(ta); ta.addEventListener('input', () => grow(ta));
    ta.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); form.requestSubmit(); } });
    form.addEventListener('submit', e => {
      e.preventDefault();
      const q = ta.value.trim(); if (!q) { ta.focus(); return; }
      const sh = form.dataset.fixed || form.sheikh?.value || '';
      go(`/search?q=${encodeURIComponent(q)}${sh ? '&sheikh=' + encodeURIComponent(sh) : ''}`);
    });
    const mic = $('[data-mic]', form);
    if (!SR) { mic.hidden = true; continue; }
    let rec = null;
    mic.addEventListener('click', () => {
      if (rec) { rec.stop(); return; }
      rec = new SR(); rec.lang = 'ar-SA'; rec.interimResults = true;
      const base = ta.value ? ta.value + ' ' : '';
      rec.onresult = ev => { ta.value = base + [...ev.results].map(r => r[0].transcript).join(''); grow(ta); };
      rec.onerror = ev => toast(ev.error === 'not-allowed' ? 'اسمح للموقع باستخدام الميكروفون من إعدادات المتصفح' : 'لم نلتقط الصوت بوضوح، حاول مرة أخرى');
      rec.onend = () => { mic.classList.remove('rec'); mic.setAttribute('aria-label', 'اسأل بصوتك'); rec = null; if (ta.value.trim().length > 3) form.requestSubmit(); };
      try { rec.start(); mic.classList.add('rec'); mic.setAttribute('aria-label', 'إيقاف التسجيل'); toast('تكلم الآن'); } catch { rec = null; }
    });
  }
}

// شريط البحث العلوي (في كل الصفحات غير الرئيسية)
$('#barSearch').addEventListener('submit', e => { e.preventDefault(); const q = $('#barQ').value.trim(); if (q) go('/search?q=' + encodeURIComponent(q)); });

// ================= جواب الشيخ =================
const CACHE = new Map();
function answer(f, { others = [], i = 0 } = {}) {
  CACHE.set(f.id, f);
  const s = sheikhById(f.sheikh_id), c = catById(f.category);
  const long = f.answer.length > 650;
  return `<article class="ans glass" id="f${f.id}" style="--c:${color(s)};animation-delay:${i * 110}ms">
    <div class="ans-head">${who(s)}${c ? `<a class="tag" href="/bab/${esc(c.id)}" data-link>${esc(c.name)}</a>` : ''}</div>
    <h2><a href="/fatwa/${f.id}" data-link>${esc(f.title)}</a></h2>
    ${f.question ? `<p class="asked"><b>السؤال:</b>${esc(f.question)}</p>` : ''}
    <p class="read ${long ? 'clip' : ''}">${esc(f.answer)}</p>
    ${long ? `<button class="expand" data-act="expand">إظهار الجواب كاملاً</button>` : ''}
    <div class="ans-foot">
      <a class="src" href="${esc(safeUrl(f.url))}" target="_blank" rel="noopener">${I.ext} اقرأ الفتوى في موقع الشيخ <span>${esc(s.site?.domain || '')}</span></a>
      ${actions(f)}
    </div>
    ${others.length ? `<details class="more-from"><summary>${I.down} ${fmt(others.length)} ${others.length > 2 ? 'فتاوى أخرى' : 'فتوى أخرى'} للشيخ في المسألة</summary>
      ${others.map(o => `<a href="/fatwa/${o.id}" data-link>${esc(o.title)}</a>`).join('')}</details>` : ''}
  </article>`;
}
const actions = f => `<div class="acts">
  <button class="act" data-act="listen" data-id="${f.id}" aria-label="${f.audio_url ? 'استمع للصوتية' : 'استمع'}">${I.play}<span>استمع</span></button>
  <button class="act" data-act="share" data-id="${f.id}">${I.share}<span>مشاركة</span></button>
  <button class="act ${isFav(f.id) ? 'on' : ''}" data-act="fav" data-id="${f.id}" aria-pressed="${isFav(f.id)}">${isFav(f.id) ? I.saved : I.save}<span>${isFav(f.id) ? 'محفوظة' : 'حفظ'}</span></button>
</div>`;

// الاستماع
let audio = null, speakBtn = null;
function stopListen() {
  if (audio) { audio.pause(); audio = null; }
  if ('speechSynthesis' in window) speechSynthesis.cancel();
  if (speakBtn) { speakBtn.innerHTML = `${I.play}<span>استمع</span>`; speakBtn = null; }
}
function listen(btn, f) {
  if (speakBtn === btn) { stopListen(); return; }
  stopListen(); speakBtn = btn; btn.innerHTML = `${I.stop}<span>إيقاف</span>`;
  if (f.audio_url) {
    audio = new Audio(f.audio_url); audio.onended = stopListen;
    audio.play().catch(() => { toast('تعذر تشغيل الصوتية. افتحها من موقع الشيخ'); stopListen(); });
    return;
  }
  if (!('speechSynthesis' in window)) { toast('المتصفح لا يدعم القراءة الصوتية'); stopListen(); return; }
  const u = new SpeechSynthesisUtterance(`${f.title}. أجاب ${sheikhById(f.sheikh_id).name}: ${f.answer}`);
  u.lang = 'ar-SA'; u.rate = .95;
  const v = speechSynthesis.getVoices().find(v => v.lang?.startsWith('ar')); if (v) u.voice = v;
  u.onend = stopListen; u.onerror = stopListen; speechSynthesis.speak(u);
}

// المشاركة
async function share(f) {
  const s = sheikhById(f.sheikh_id);
  const link = `${ORIGIN}/fatwa/${f.id}`;
  const excerpt = f.answer.replace(/\s+/g, ' ').slice(0, 240);
  const text = `${f.title}\n\nأجاب ${s.name}:\n«${excerpt}…»\n\nالفتوى كاملة: ${link}`;
  $('#shWa').href = 'https://wa.me/?text=' + encodeURIComponent(text);
  $('#shX').href = 'https://twitter.com/intent/tweet?text=' + encodeURIComponent(`${f.title}، ${s.name}`) + '&url=' + encodeURIComponent(link);
  $('#shCopy').onclick = async () => { try { await navigator.clipboard.writeText(link); toast('نُسخ الرابط'); } catch { toast(link); } };
  const cv = $('#shareCanvas');
  $('#shImg').onclick = () => { const a = document.createElement('a'); a.href = cv.toDataURL('image/png'); a.download = `fatwa-${f.id}.png`; a.click(); };
  $('#share').showModal();
  try { await Promise.all(['600 64px "Readex Pro"', '44px "Noto Naskh Arabic"'].map(x => document.fonts.load(x))); } catch { /* خط بديل */ }
  drawCard(cv, f, s, excerpt);
}
function lines(ctx, text, maxW, max) {
  const words = text.split(' '), out = []; let line = '';
  for (const w of words) { const t = line ? line + ' ' + w : w; if (ctx.measureText(t).width > maxW && line) { out.push(line); line = w; if (out.length === max) break; } else line = t; }
  if (out.length < max && line) out.push(line);
  if (out.length === max && out.join(' ').length < text.length) out[max - 1] = out[max - 1].replace(/\s*\S*$/, '') + '…';
  return out;
}
function drawCard(cv, f, s, excerpt) {
  const c = cv.getContext('2d'), W = 1080, H = 1350, P = 110, R = W - P;
  c.fillStyle = '#060a12'; c.fillRect(0, 0, W, H);
  const blob = (x, y, r, col) => { const g = c.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, col); g.addColorStop(1, 'rgba(6,10,18,0)'); c.fillStyle = g; c.fillRect(0, 0, W, H); };
  blob(W, 0, 700, 'rgba(25,227,165,.35)'); blob(0, 420, 620, 'rgba(42,123,255,.26)'); blob(W * .7, H, 640, 'rgba(122,92,255,.26)');
  const grad = c.createLinearGradient(P, 0, R, 0); grad.addColorStop(0, '#8b7bff'); grad.addColorStop(.5, '#3cc8ff'); grad.addColorStop(1, '#19e3a5');
  c.fillStyle = 'rgba(255,255,255,.05)'; c.strokeStyle = 'rgba(255,255,255,.13)'; c.lineWidth = 2;
  c.beginPath(); c.roundRect(56, 56, W - 112, H - 112, 44); c.fill(); c.stroke();
  c.direction = 'rtl'; c.textAlign = 'right';
  c.fillStyle = color(s); c.beginPath(); c.arc(R - 40, 170, 40, 0, 7); c.fill();
  c.fillStyle = '#fff'; c.font = '600 38px "Readex Pro", sans-serif'; c.textAlign = 'center'; c.fillText(initial(s).replace(/&[^;]+;/g, ''), R - 40, 184);
  c.textAlign = 'right'; c.fillStyle = '#eef2f8'; c.font = '600 34px "Readex Pro", sans-serif'; c.fillText(s.name, R - 104, 162);
  c.fillStyle = '#a3aec2'; c.font = '28px "Readex Pro", sans-serif'; c.fillText(s.site?.name || '', R - 104, 206);
  c.fillStyle = grad; c.font = '700 62px "Readex Pro", sans-serif';
  let y = 350; for (const l of lines(c, f.title, W - 2 * P, 3)) { c.fillText(l, R, y); y += 90; }
  c.fillStyle = grad; c.fillRect(R - 120, y - 30, 120, 5); y += 56;
  c.fillStyle = '#dfe6f0'; c.font = '44px "Noto Naskh Arabic", serif';
  for (const l of lines(c, excerpt, W - 2 * P, 8)) { c.fillText(l, R, y); y += 84; }
  c.fillStyle = grad; c.font = '700 36px "Readex Pro", sans-serif'; c.fillText('جامع الفتاوى', R, H - 116);
  c.fillStyle = '#6d7890'; c.font = '28px "Readex Pro", sans-serif'; c.textAlign = 'left'; c.direction = 'ltr';
  c.fillText(ORIGIN.replace(/^https?:\/\//, '') + '/fatwa/' + f.id, P, H - 118);
}

view.addEventListener('click', e => {
  const b = e.target.closest('[data-act]'); if (!b) return;
  const f = CACHE.get(Number(b.dataset.id)), act = b.dataset.act;
  if (act === 'expand') { b.previousElementSibling.classList.remove('clip'); b.remove(); }
  if (act === 'listen' && f) listen(b, f);
  if (act === 'share' && f) share(f);
  if (act === 'fav' && f) { const on = toggleFav(f); b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); b.innerHTML = `${on ? I.saved : I.save}<span>${on ? 'محفوظة' : 'حفظ'}</span>`; toast(on ? 'حُفظت في المحفوظات' : 'أُزيلت من المحفوظات'); }
});

// ================= الصفحات =================
const row = f => { const s = sheikhById(f.sheikh_id), c = catById(f.category);
  return `<a class="row glass" href="/fatwa/${f.id}" data-link><b>${esc(f.title)}</b><p>${esc(f.question || f.answer)}</p>
    <span class="meta">${av(s)}${esc(s.short)}${c ? `<span class="faint">في ${esc(c.name)}</span>` : ''}</span></a>`; };
const skeleton = () => `<div class="glass" style="padding:24px;margin-top:18px"><div class="sk" style="width:36%"></div><div class="sk" style="width:94%"></div><div class="sk" style="width:80%"></div></div>`;
const stateBlock = (title, text, btn = '') => `<div class="state glass"><div class="si">${I.empty}</div><b>${esc(title)}</b><p>${esc(text)}</p>${btn}</div>`;

// ---------- الكوكبة: نجمة ثمانية من نقاط ضوء ----------
let starsRAF = 0;
function stars(cv) {
  cancelAnimationFrame(starsRAF);
  const ctx = cv.getContext('2d'), reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let W, H, S, pts = [], links = [], mx = 0, my = 0, t = 0;
  const build = () => {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    W = cv.clientWidth; H = cv.clientHeight; cv.width = W * dpr; cv.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    S = Math.min(W * .46, H * .5);
    pts = []; links = [];
    const loop = (arr) => { const b = pts.length; arr.forEach(p => pts.push(p)); for (let i = 0; i < arr.length; i++) links.push([b + i, b + (i + 1) % arr.length]); };
    // ضلعا المربعين المتداخلين (النجمة الثمانية)
    for (const rot of [0, Math.PI / 4]) { const arr = [];
      for (let k = 0; k < 4; k++) { const a1 = rot + k * Math.PI / 2 + Math.PI / 4, a2 = a1 + Math.PI / 2;
        for (let i = 0; i < 8; i++) { const u = i / 8; arr.push({ x: Math.cos(a1) * (1 - u) + Math.cos(a2) * u, y: Math.sin(a1) * (1 - u) + Math.sin(a2) * u, r: i ? 1.4 : 2.6, o: Math.random() * 6 }); } }
      loop(arr); }
    loop(Array.from({ length: 40 }, (_, i) => { const a = i / 40 * Math.PI * 2; return { x: Math.cos(a) * .5, y: Math.sin(a) * .5, r: i % 5 ? 1 : 1.8, o: Math.random() * 6 }; }));
    loop(Array.from({ length: 8 }, (_, i) => { const a = i / 8 * Math.PI * 2 + Math.PI / 8; return { x: Math.cos(a) * .24, y: Math.sin(a) * .24, r: 2, o: Math.random() * 6 }; }));
    for (let i = 0; i < 8; i++) links.push([pts.length - 8 + i, (i * 8 + 4) % 32]);   // خيوط من المركز إلى رؤوس النجمة
    for (let i = 0; i < (W < 640 ? 40 : 90); i++) pts.push({ x: (Math.random() - .5) * 3.4, y: (Math.random() - .5) * 2.4, r: Math.random() * 1.2 + .3, o: Math.random() * 6, free: true });
  };
  const frame = () => {
    t += reduce ? 0 : .0016;
    ctx.clearRect(0, 0, W, H);
    const cx = W / 2 + mx * 18, cy = H * .5 + my * 14, rot = t * .9, cs = Math.cos(rot), sn = Math.sin(rot);
    const P = pts.map(p => {
      const wob = p.free ? 0 : Math.sin(t * 40 + p.o) * .012;
      let x = p.x * (1 + wob), y = p.y * (1 + wob);
      if (!p.free) { const X = x * cs - y * sn; y = x * sn + y * cs; x = X; } else { x += Math.sin(t * 8 + p.o) * .02; y += Math.cos(t * 7 + p.o) * .02; }
      return { x: cx + x * S, y: cy + y * S, r: p.r, free: p.free, o: p.o };
    });
    const pulse = (Math.sin(t * 25) + 1) / 2;
    ctx.lineWidth = 1.1;
    for (const [a, b2] of links) { const A = P[a], B = P[b2];
      const g = ctx.createLinearGradient(A.x, A.y, B.x, B.y);
      g.addColorStop(0, `rgba(25,227,165,${.22 + .14 * pulse})`); g.addColorStop(1, `rgba(120,140,255,${.22 + .14 * pulse})`);
      ctx.strokeStyle = g; ctx.beginPath(); ctx.moveTo(A.x, A.y); ctx.lineTo(B.x, B.y); ctx.stroke(); }
    // خيوط خافتة بين النجوم الحرة القريبة
    const free = P.filter(p => p.free), lim = 110;
    ctx.lineWidth = .6;
    for (let i = 0; i < free.length; i++) for (let j = i + 1; j < free.length; j++) { const d = Math.hypot(free[i].x - free[j].x, free[i].y - free[j].y);
      if (d < lim) { ctx.strokeStyle = `rgba(140,170,255,${(1 - d / lim) * .12})`; ctx.beginPath(); ctx.moveTo(free[i].x, free[i].y); ctx.lineTo(free[j].x, free[j].y); ctx.stroke(); } }
    for (const p of P) {
      const tw = .55 + .45 * Math.sin(t * 60 + p.o);
      ctx.fillStyle = p.free ? `rgba(180,210,255,${.25 + .35 * tw})` : `rgba(160,245,225,${.6 + .4 * tw})`;
      ctx.shadowColor = p.free ? 'transparent' : 'rgba(60,200,255,.9)'; ctx.shadowBlur = p.free ? 0 : 8;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 7); ctx.fill();
    }
    ctx.shadowBlur = 0;
    if (!reduce && document.body.contains(cv)) starsRAF = requestAnimationFrame(frame);
  };
  build(); frame();
  const ro = new ResizeObserver(() => { build(); if (reduce) frame(); }); ro.observe(cv);
  cv.closest('.hero').addEventListener('pointermove', e => { const b = cv.getBoundingClientRect(); mx = (e.clientX - b.left) / b.width - .5; my = (e.clientY - b.top) / b.height - .5; });
}

// ---------- كتابة حية: العامية ثم الفصحى ----------
const EXAMPLES = [
  ['وش حكم اني امسح على الشراب وهو مشقوق؟', 'حكم المسح على الجورب المخرق'],
  ['نسيت ركعة في الظهر وش اسوي؟', 'حكم من نسي ركعة من الصلاة'],
  ['عليها زكاة الذهب اللي تلبسه زوجتي؟', 'زكاة الذهب المعد للاستعمال'],
  ['ينفع اجمع الصلاة وانا مسافر بس جالس بالفندق؟', 'جمع الصلاة للمسافر النازل'],
];
let typeTimer;
function typewriter(btn) {
  clearTimeout(typeTimer);
  const from = $('.cv-from', btn), to = $('.cv-to', btn), reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let i = 0;
  const type = (el, text, speed, done) => { let k = 0; el.innerHTML = '<span class="caret"></span>';
    const step = () => { if (!document.body.contains(btn)) return; k++; el.innerHTML = esc(text.slice(0, k)) + '<span class="caret"></span>';
      if (k < text.length) typeTimer = setTimeout(step, speed); else { el.innerHTML = esc(text); done(); } };
    step(); };
  const run = () => {
    const [a, b] = EXAMPLES[i]; btn.dataset.q = a;
    if (reduce) { from.textContent = a; to.textContent = b; return; }
    to.textContent = '';
    type(from, a, 38, () => { typeTimer = setTimeout(() => type(to, b, 45, () => { typeTimer = setTimeout(() => { i = (i + 1) % EXAMPLES.length; run(); }, 2600); }), 350); });
  };
  run();
}

function countUp(root) {
  for (const el of $$('[data-count]', root)) {
    const end = Number(el.dataset.count), t0 = performance.now();
    const tick = now => { const k = Math.min(1, (now - t0) / 1400), e = 1 - Math.pow(1 - k, 3); el.textContent = fmt(Math.round(end * e)); if (k < 1) requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  }
}

function home() {
  const d = META.daily, top = META.top || [];
  view.innerHTML = `
  <section class="hero">
    <canvas id="stars" aria-hidden="true"></canvas>
    <div class="hero-in">
      <span class="pill"><span class="pulse"></span>بحث ذكي في المواقع الرسمية للمشايخ</span>
      <h1><span class="gt">اسأل بلغتك.</span><br>نجيبك بكلام أهل العلم.</h1>
      <p class="lede">يفهم سؤالك مهما كانت صيغته، ويبحث في فتاوى المشايخ خلال ثوانٍ، ويعرض لك جواب كل شيخ بنصه مع رابط فتواه.</p>
      ${ask()}
      <button type="button" class="convert" id="convert" aria-label="جرّب سؤالاً مثالاً">
        <span class="cv-from"></span><span class="cv-ai">${I.spark} يفهمها</span><span class="cv-to"></span>
      </button>
      <p class="people-label">أو اسأل شيخاً بعينه</p>
      <div class="people">${META.sheikhs.map(s => `<a class="person" href="/sheikh/${esc(s.id)}" data-link>${av(s)}<span>${esc(s.short)}</span></a>`).join('')}</div>
    </div>
  </section>

  <div class="page" style="padding-top:0">
    <div class="glass stats" id="stats">
      <div><b class="gt" data-count="${META.total}">${fmt(META.total)}</b><span>فتوى مفهرسة</span></div>
      <div><b class="gt" data-count="${META.sheikhs.length}">${fmt(META.sheikhs.length)}</b><span>من المشايخ وجهات الفتوى</span></div>
      <div><b class="gt">${META.ai ? '&lt; ٦' : fmt(META.categories.length)}</b><span>${META.ai ? 'ثوانٍ حتى يصلك الجواب' : 'باباً فقهياً'}</span></div>
    </div>

    <section class="sec">
      <div class="sec-head"><div><h2 class="h-sec">من سؤالك إلى جواب الشيخ</h2><p>ثلاث خطوات تتم خلال ثوانٍ.</p></div></div>
      <div class="flow">
        <div class="glass stage-card"><div class="stage-ic">${I.brain}<small>١</small></div><b>يفهم سؤالك</b><p>يحوّل العامية إلى صيغة فقهية، ويعرف الشيخ إن ذكرته.</p>
          <div class="eg">«ينفع اجمع وانا مسافر؟» ← <b>جمع الصلاة للمسافر</b></div></div>
        <div class="glass stage-card"><div class="stage-ic">${I.globe}<small>٢</small></div><b>يبحث في المصادر</b><p>في فتاوى المواقع الرسمية للمشايخ فقط، ولا شيء غيرها.</p>
          <div class="eg">${META.sheikhs.slice(0, 3).map(s => esc(s.site?.domain)).join('، ')}</div></div>
        <div class="glass stage-card"><div class="stage-ic">${I.rank}<small>٣</small></div><b>يعرض جواب كل شيخ</b><p>بنصه كما هو، وتحته رابط يفتح الفتوى في موقعها.</p>
          <div class="eg">أجاب <b>الشيخ ابن باز</b>: «…»</div></div>
      </div>
    </section>

    <section class="sec">
      <div class="sec-head"><div><h2 class="h-sec">كل ما تحتاجه في مكان واحد</h2><p>خدمات تخدم السائل وطالب العلم.</p></div></div>
      <div class="bento">
        <div class="glass tile t-wide"><div class="art"><div class="mini-cmp">${META.sheikhs.slice(0, 3).map(s => `<div>${av(s, 'av-sm')}${esc(s.short)}<i></i></div>`).join('')}</div></div>
          <b>مقارنة أقوال المشايخ</b><p>اعرض جواب كل شيخ في المسألة نفسها جنباً إلى جنب، بزر واحد.</p></div>
        <div class="glass tile t-sm"><div class="art"><div class="wave">${'<i></i>'.repeat(7)}</div></div><b>اسأل بصوتك</b><p>تكلم بسؤالك بدل كتابته.</p></div>
        <a class="glass tile t-sm" href="/abwab" data-link><div class="art"><span class="big-ic">${I.book}</span></div><b>الأبواب الفقهية</b><p>تصفح الفتاوى حسب الباب.</p></a>
        <div class="glass tile t-sm"><div class="art"><span class="big-ic">${I.play}</span></div><b>استمع للفتوى</b><p>الصوتية الأصلية أو قراءة النص.</p></div>
        <div class="glass tile t-sm"><div class="art"><span class="big-ic">${I.share}</span></div><b>شارك ببطاقة</b><p>واتساب وإكس وصورة جاهزة.</p></div>
        <a class="glass tile t-mid" href="/sheikhs" data-link><div class="art"><div class="people" style="margin:0;gap:0">${META.sheikhs.slice(0, 4).map(s => av(s)).join('')}</div></div><b>اسأل شيخاً بعينه</b><p>ادخل صفحة الشيخ واسأله، ويأتيك الجواب من فتاواه هو.</p></a>
        <a class="glass tile t-mid" href="/saved" data-link><div class="art"><span class="big-ic">${I.save}</span></div><b>محفوظاتك وسجلك</b><p>احفظ الفتاوى المهمة وارجع لأسئلتك السابقة متى شئت.</p></a>
      </div>
    </section>

    ${d ? `<section class="sec glass today">
      <div class="today-main"><span class="label">${I.spark} فتوى اليوم</span><h3><a href="/fatwa/${d.id}" data-link>${esc(d.title)}</a></h3><p class="read fade">${esc(d.answer)}</p></div>
      <div class="today-side">${who(sheikhById(d.sheikh_id))}<a class="b b-pri" href="/fatwa/${d.id}" data-link>اقرأ الفتوى كاملة</a></div>
    </section>` : ''}

    ${top.length ? `<section class="sec"><div class="sec-head"><h2 class="h-sec">الأكثر بحثاً</h2></div>
      <ul class="trending">${top.map(t => `<li><a href="/search?q=${encodeURIComponent(t.shown)}" data-link>${I.search}${esc(t.shown)}</a></li>`).join('')}</ul></section>` : ''}

    <section class="sec"><div class="sec-head"><h2 class="h-sec">الأبواب الفقهية</h2><a href="/abwab" data-link>كل الأبواب</a></div>
      <div class="topics">${META.categories.map(topic).join('')}</div></section>

    <section class="sec glass cta">
      <h2>عندك سؤال الآن؟</h2><p>اكتبه كما يخطر في بالك، والباقي علينا.</p>${ask()}
    </section>
  </div>`;
  bindAsk();
  stars($('#stars'));
  const cv = $('#convert'); typewriter(cv);
  cv.onclick = () => go('/search?q=' + encodeURIComponent(cv.dataset.q || EXAMPLES[0][0]));
  const io = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) { countUp($('#stats')); io.disconnect(); } }); io.observe($('#stats'));
}
const topic = c => `<a class="topic glass" href="/bab/${esc(c.id)}" data-link><span class="ti">${I[c.icon] || I.book}</span><span><b>${esc(c.name)}</b><small>${fmt(c.count)} فتوى</small></span></a>`;

let seq = 0, forceLive = false;
async function searchPage(params) {
  const forceStored = false;
  const q = params.get('q') || '', sheikh = params.get('sheikh') || '', cat = params.get('cat') || '';
  const my = ++seq, target = sheikh ? sheikhById(sheikh) : null;
  $('#barQ').value = q;
  document.title = `${q} | جامع الفتاوى`;
  const srcs = target ? [target] : META.sheikhs;
  view.innerHTML = `<div class="page"><div class="results"><div id="main">
      <h1 class="q-title">${esc(q)}</h1>
      <div class="glass thinking"><ol class="steps" id="steps">
        <li class="now"><span class="s">${I.check}</span>نفهم سؤالك ونحوّله إلى صيغة فقهية</li>
        <li><span class="s">${I.check}</span>${target ? `نبحث في فتاوى ${esc(target.name)}` : 'نبحث في فتاوى المشايخ'}</li>
        <li><span class="s">${I.check}</span>نختار الأجوبة الأقرب لسؤالك</li></ol>
        <div class="scan">${srcs.map((s, i) => `<span style="animation-delay:${i * .25}s">${esc(s.site?.domain)} ${av(s, 'av-sm')}</span>`).join('')}</div>
      </div>${skeleton()}
    </div><aside class="side" id="side"></aside></div></div>`;
  let st = 0; const timer = setInterval(() => { const li = $$('#steps li'); if (!li.length || st >= 2) return; li[st].className = 'done'; li[++st].className = 'now'; }, 900);
  let d;
  try { d = await api(`/api/search?q=${encodeURIComponent(q)}${sheikh ? '&sheikh=' + sheikh : ''}${cat ? '&cat=' + cat : ''}`); }
  catch (e) { clearInterval(timer); if (my === seq) $('#main').innerHTML = `<h1 class="q-title">${esc(q)}</h1>` + stateBlock('لم يكتمل البحث', e.message, `<a class="b" href="${esc('/search?' + params)}" data-link>أعد المحاولة</a>`); return; }
  // نكمل حركة الخطوات قبل عرض النتائج
  while (st < 2 && my === seq) { await new Promise(r => setTimeout(r, 260)); const li = $$('#steps li'); if (!li.length) break; li[st].className = 'done'; li[++st].className = 'now'; }
  await new Promise(r => setTimeout(r, 260)); clearInterval(timer);
  if (my !== seq) return;
  if (forceLive) { forceLive = false; d.groups = []; }
  addHistory(q, sheikh);
  const w = d.sheikh ? sheikhById(d.sheikh) : null; let n = d.groups.length;
  const timeTxt = d.cached ? 'نتيجة محفوظة' : d.ms < 1000 ? 'في أقل من ثانية' : `في ${(d.ms / 1000).toLocaleString('ar-SA', { maximumFractionDigits: 1 })} ثانية`;
  const head = `<h1 class="q-title">${esc(q)}</h1>
    <div class="glass understood"><span class="lbl">${I.spark} فهمنا سؤالك هكذا</span><div class="fusha" id="fusha"></div>
      <div class="meta">${w ? `<span>في فتاوى <b>${esc(w.name)}</b></span>` : `<span>في فتاوى <b>${fmt(META.sheikhs.length)} من المشايخ</b></span>`}<span>${timeTxt}</span></div></div>`;
  const typeFusha = () => { const el = $('#fusha'); if (!el) return; const t = d.fusha || q; let k = 0;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) { el.textContent = t; return; }
    const step = () => { if (!document.body.contains(el)) return; el.innerHTML = esc(t.slice(0, ++k)) + (k < t.length ? '<span class="caret"></span>' : ''); if (k < t.length) setTimeout(step, 22); }; step(); };

  // لم نجدها في المخزون: نبحث مباشرة في مواقع المشايخ
  let liveErr = '';
  if (!n && META.live && !forceStored) {
    const doms = (w ? [w] : META.sheikhs).map(s => `<span>${esc(s.site?.domain)} ${av(s, 'av-sm')}</span>`).join('');
    $('#main').innerHTML = head + `<div class="glass thinking"><ol class="steps"><li class="done"><span class="s">${I.check}</span>لم نجدها في الفتاوى المحفوظة</li>
      <li class="now"><span class="s">${I.check}</span>نبحث الآن مباشرة في مواقع المشايخ (قد يستغرق ٢٠ إلى ٤٠ ثانية)</li></ol><div class="scan">${doms}</div></div>${skeleton()}`;
    typeFusha();
    try { const L = await api(`/api/live?q=${encodeURIComponent(q)}${sheikh ? '&sheikh=' + sheikh : ''}`); if (my !== seq) return;
      if (L.groups.length) { d.groups = L.groups; d.live = true; n = L.groups.length; } }
    catch (e) { if (my !== seq) return; liveErr = e.message; }
  }
  if (!n) {
    $('#main').innerHTML = head + stateBlock('لم نجد فتوى تجيب عن هذا السؤال',
      liveErr || (META.live ? 'بحثنا في الفتاوى المحفوظة وفي مواقع المشايخ مباشرة، ولم نجد فتوى في هذه المسألة. جرّب صياغة أخرى.'
        : w ? 'قد لا تكون للشيخ فتوى في هذه المسألة ضمن ما جمعناه. ابحث في فتاوى جميع المشايخ.' : 'جرّب صياغة أخرى أو كلمات أوضح، أو اكتب المسألة باسمها الفقهي إن كنت تعرفه.'),
      w ? `<a class="b b-pri" href="/search?q=${encodeURIComponent(q)}" data-link>ابحث في جميع المشايخ</a>` : '');
    $('#side').innerHTML = ''; typeFusha(); return;
  }
  $('#main').innerHTML = head + `<div class="tabs" role="tablist">
      <button role="tab" class="on" data-tab="all">${n > 1 ? `أجوبة ${fmt(n)} من المشايخ` : 'جواب الشيخ'}</button>
      ${n > 1 ? '<button role="tab" data-tab="cmp">مقارنة الأقوال</button>' : ''}</div>
      ${d.live ? `<p class="live-note">${I.globe} نتائج من البحث المباشر في مواقع المشايخ، وحُفظت لتظهر فوراً في المرات القادمة.</p>` : ''}
      <div id="out"></div>
      ${META.live && !d.live ? `<button class="b more-live" id="moreLive">${I.globe} لم تجد ما تريد؟ ابحث مباشرة في مواقع المشايخ</button>` : ''}`;
  typeFusha();
  $('#moreLive')?.addEventListener('click', () => { forceLive = true; route(); });
  let filter = '';
  const render = tab => {
    $$('.tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
    const groups = d.groups.filter(g => !filter || g.sheikh_id === filter);
    $('#out').innerHTML = tab === 'cmp' ? compare(groups) : groups.map((g, i) => answer(g.fatwas[0], { others: g.fatwas.slice(1), i })).join('');
  };
  $$('.tabs button').forEach(b => b.onclick = () => render(b.dataset.tab));
  const filterHtml = n > 1 ? `<div class="filter"><button class="on" data-f="">الكل <span class="n">${fmt(n)}</span></button>
      ${d.groups.map(g => { const s = sheikhById(g.sheikh_id); return `<button data-f="${esc(s.id)}">${av(s, 'av-sm')}${esc(s.short)}<span class="n">${fmt(g.fatwas.length)}</span></button>`; }).join('')}</div>` : '';
  $('#side').innerHTML = `${n > 1 ? `<div class="glass"><h3>المشايخ في النتائج</h3>${filterHtml}</div>` : ''}
    <div class="glass side-note"><b>${I.shield} تأكد من المصدر</b>نعرض نص الفتوى كما في موقع الشيخ. افتح الرابط تحت كل جواب لتقرأها في موقعها الأصلي.</div>`;
  $('#out').insertAdjacentHTML('beforebegin', `<div class="m-filter">${filterHtml}</div>`);
  $$('.filter button').forEach(b => b.onclick = () => { filter = b.dataset.f; $$('.filter button').forEach(x => x.classList.toggle('on', x.dataset.f === filter)); render($('.tabs .on').dataset.tab); });
  render('all');
}

function firstSentences(t) { return t.replace(/\s+/g, ' ').split(/(?<=[.؟!])\s/).slice(0, 2).join(' ').slice(0, 320); }
function compare(groups) {
  return `<div class="cmp">${groups.map((g, i) => { const f = g.fatwas[0], s = sheikhById(f.sheikh_id); CACHE.set(f.id, f);
    return `<div class="glass cmp-row" style="animation-delay:${i * 90}ms">${who(s)}<div><p class="read">${esc(f.summary || firstSentences(f.answer))}</p>
      <small>${f.summary ? 'خلاصة آلية من نص الفتوى.' : 'من بداية الجواب.'} <a href="/fatwa/${f.id}" data-link>النص كاملاً</a>، أو <a href="${esc(safeUrl(f.url))}" target="_blank" rel="noopener">الفتوى في موقع الشيخ</a></small></div></div>`; }).join('')}
    </div><p class="cmp-note">المقارنة لعرض أقوال أهل العلم في المسألة، ولا تعني ترجيحاً من الموقع.</p>`;
}

async function fatwaPage(id) {
  view.innerHTML = `<div class="page"><div class="col">${skeleton()}${skeleton()}</div></div>`;
  let d; try { d = await api('/api/fatwa/' + id); } catch (e) { return notFound(e.message); }
  const f = d.fatwa, s = sheikhById(f.sheikh_id), c = catById(f.category);
  CACHE.set(f.id, f);
  document.title = `${f.title} | جامع الفتاوى`;
  view.innerHTML = `<div class="page"><article class="col fatwa">
      <nav class="crumbs" aria-label="المسار"><a href="/sheikh/${esc(s.id)}" data-link>${esc(s.name)}</a>${c ? `${I.chev}<a href="/bab/${esc(c.id)}" data-link>${esc(c.name)}</a>` : ''}</nav>
      <h1 class="fatwa-title">${esc(f.title)}</h1>
      <div class="glass fatwa-by">${who(s)}${actions(f)}</div>
      <div class="glass fatwa-body">
        ${f.question ? `<p class="asked"><b>السؤال:</b>${esc(f.question)}</p>` : ''}
        <p class="read">${esc(f.answer)}</p>
      </div>
      <div class="glass verify"><p><b>اقرأها في مصدرها</b>هذه الفتوى منقولة من ${esc(s.site?.name || 'موقع الشيخ')}. افتح الصفحة الأصلية للتأكد من النص.</p>
        <a class="src" href="${esc(safeUrl(f.url))}" target="_blank" rel="noopener">${I.ext} افتح الفتوى في موقع الشيخ</a></div>
      ${d.related.length ? `<section class="sec" style="margin-top:64px"><div class="sec-head"><h2 class="h-sec">فتاوى ذات صلة</h2></div><div class="rows">${d.related.map(row).join('')}</div></section>` : ''}
      <section class="sec" style="margin-top:64px"><div class="sec-head"><h2 class="h-sec">اسأل عن مسألة أخرى</h2></div>${ask()}</section>
    </article></div>`;
  bindAsk();
}

function sheikhsPage() {
  document.title = 'المشايخ والمصادر | جامع الفتاوى';
  view.innerHTML = `<div class="page">
    <h1 class="h-page">المشايخ والمصادر</h1><p class="lede">كل الفتاوى في الموقع منقولة من هذه المواقع الرسمية.</p>
    <div class="people-grid" style="margin-top:36px">${META.sheikhs.map(s => `<a class="glass p-card" href="/sheikh/${esc(s.id)}" data-link>${av(s)}
      <b>${esc(s.name)}</b><p>${esc(s.site?.name || '')}</p><span class="n"><strong>${fmt(s.count)}</strong> فتوى</span></a>`).join('')}</div>
  </div>`;
}

async function sheikhPage(id, params) {
  if (!META.sheikhs.some(x => x.id === id)) return notFound();
  const s = sheikhById(id), cat = params.get('cat') || '', page = Number(params.get('page')) || 0;
  document.title = `${s.name} | جامع الفتاوى`;
  view.innerHTML = `<div class="page"><div class="col">
    <header class="glass profile" style="--c:${color(s)}">${av(s, 'av-lg')}<div style="flex:1">
      <h1>${esc(s.name)}</h1>${s.about ? `<p>${esc(s.about)}</p>` : ''}
      <div class="facts"><span><b>${fmt(s.count)}</b>فتوى في الموقع</span>${s.years ? `<span><b>${esc(s.years)}</b>الميلاد والوفاة</span>` : ''}
        <span><b><a href="https://${esc(s.site.domain)}" target="_blank" rel="noopener">${esc(s.site.domain)}</a></b>الموقع الرسمي</span></div>
    </div></header>
    <div class="scoped">${ask({ fixed: s.id, placeholder: `اسأل، ونجيبك من فتاوى ${s.short}` })}</div>
    <div class="sec-head"><h2 class="h-sec">من فتاوى ${esc(s.short)}</h2></div>
    <div class="chips"><a class="chip ${!cat ? 'on' : ''}" href="/sheikh/${esc(s.id)}" data-link>الكل</a>
      ${META.categories.filter(c => c.count).map(c => `<a class="chip ${cat === c.id ? 'on' : ''}" href="/sheikh/${esc(s.id)}?cat=${c.id}" data-link>${esc(c.name)}</a>`).join('')}</div>
    <div id="list" class="rows">${skeleton()}</div>
  </div></div>`;
  bindAsk();
  browse($('#list'), { sheikh: id, cat, page }, p => `/sheikh/${id}?${cat ? 'cat=' + cat + '&' : ''}page=${p}`);
}

async function browse(el, { sheikh, cat, page }, url) {
  let d; try { d = await api(`/api/browse?page=${page}${sheikh ? '&sheikh=' + sheikh : ''}${cat ? '&cat=' + cat : ''}`); }
  catch (e) { el.innerHTML = stateBlock('تعذر تحميل الفتاوى', e.message); return; }
  const pages = Math.ceil(d.total / 20);
  el.innerHTML = d.items.length ? d.items.map(row).join('') : stateBlock('لا توجد فتاوى هنا بعد', 'تظهر الفتاوى هنا بعد جمعها من مواقع المشايخ.');
  if (pages > 1) el.insertAdjacentHTML('afterend', `<nav class="pager">${page > 0 ? `<a class="b b-sm" href="${url(page - 1)}" data-link>السابق</a>` : ''}<span>صفحة ${fmt(page + 1)} من ${fmt(pages)}</span>${page < pages - 1 ? `<a class="b b-sm" href="${url(page + 1)}" data-link>التالي</a>` : ''}</nav>`);
}

function abwabPage() {
  document.title = 'الأبواب الفقهية | جامع الفتاوى';
  view.innerHTML = `<div class="page"><h1 class="h-page">الأبواب الفقهية</h1><p class="lede">تصفح الفتاوى مرتبة على أبواب الفقه.</p>
    <div class="topics" style="margin-top:36px">${META.categories.map(topic).join('')}</div></div>`;
}

function babPage(id, params) {
  const c = catById(id); if (!c) return notFound();
  const sh = params.get('sheikh') || '', page = Number(params.get('page')) || 0;
  document.title = `${c.name} | جامع الفتاوى`;
  view.innerHTML = `<div class="page"><div class="col">
    <nav class="crumbs"><a href="/abwab" data-link>الأبواب الفقهية</a></nav>
    <h1 class="h-page">${esc(c.name)}</h1><p class="lede">${fmt(c.count)} فتوى من فتاوى المشايخ في هذا الباب.</p>
    <div class="chips" style="margin-top:26px"><a class="chip ${!sh ? 'on' : ''}" href="/bab/${c.id}" data-link>كل المشايخ</a>
      ${META.sheikhs.map(s => `<a class="chip ${sh === s.id ? 'on' : ''}" href="/bab/${c.id}?sheikh=${esc(s.id)}" data-link>${esc(s.short)}</a>`).join('')}</div>
    <div id="list" class="rows">${skeleton()}</div>
  </div></div>`;
  browse($('#list'), { sheikh: sh, cat: id, page }, p => `/bab/${id}?${sh ? 'sheikh=' + sh + '&' : ''}page=${p}`);
}

function savedPage() {
  document.title = 'المحفوظات | جامع الفتاوى';
  const f = Object.values(favs()).sort((a, b) => b.at - a.at), h = store.get('hist', []);
  view.innerHTML = `<div class="page"><h1 class="h-page">المحفوظات</h1><p class="lede">الفتاوى التي حفظتها وأسئلتك السابقة. تُحفظ في هذا الجهاز فقط.</p>
    <div class="two-col" style="margin-top:36px">
      <section><div class="sec-head"><h2 class="h-sec">الفتاوى المحفوظة</h2></div>
        ${f.length ? `<div class="rows">${f.map(x => row({ ...x, answer: x.excerpt })).join('')}</div>` : stateBlock('لا توجد فتاوى محفوظة', 'اضغط «حفظ» تحت أي فتوى لتجدها هنا.')}</section>
      <section class="glass" style="padding:22px"><div class="sec-head" style="margin-bottom:8px"><h2 class="h-sec" style="font-size:20px">أسئلتك السابقة</h2>${h.length ? '<button class="b b-sm" id="clrH">مسح السجل</button>' : ''}</div>
        ${h.length ? `<ul class="list">${h.slice(0, 20).map(x => `<li><a href="/search?q=${encodeURIComponent(x.q)}${x.sheikh ? '&sheikh=' + encodeURIComponent(x.sheikh) : ''}" data-link>${I.search}<span>${esc(x.q)}${x.sheikh ? ` <span class="faint">في فتاوى ${esc(sheikhById(x.sheikh).short)}</span>` : ''}</span></a></li>`).join('')}</ul>` : '<p class="muted">لم تبحث عن شيء بعد.</p>'}</section>
    </div></div>`;
  $('#clrH')?.addEventListener('click', () => { store.set('hist', []); savedPage(); toast('مُسح السجل'); });
}

// ---------- الإدارة ----------
let admTimer;
const adminH = () => ({ 'x-admin-password': sessionStorage.getItem('fh-admin') || '' });
function adminPage() {
  document.title = 'الإدارة | جامع الفتاوى';
  view.innerHTML = `<div class="page"><h1 class="h-page">لوحة الإدارة</h1><div id="adm" style="margin-top:28px">
    <form class="controls" id="login"><input class="field" type="password" id="pw" placeholder="كلمة المرور" autocomplete="current-password"><button class="b b-pri">دخول</button></form></div></div>`;
  $('#login').onsubmit = e => { e.preventDefault(); sessionStorage.setItem('fh-admin', $('#pw').value); loadAdmin(); };
  if (sessionStorage.getItem('fh-admin')) loadAdmin();
}
async function loadAdmin() {
  let d; try { d = await api('/api/admin/stats', { headers: adminH() }); } catch (e) { toast(e.message); return; }
  const by = Object.fromEntries(d.bySheikh.map(x => [x.sheikh_id, x.n]));
  $('#adm').innerHTML = `<div class="admin-grid">
    <div class="stat-row glass"><div><b>${fmt(d.total)}</b><span>فتوى مفهرسة</span></div><div><b>${fmt(d.searches.t)}</b><span>عملية بحث</span></div><div><b>${d.ai ? 'مفعّل' : 'غير مفعّل'}</b><span>الذكاء الاصطناعي</span></div><div><b>${d.crawling ? 'يعمل الآن' : 'متوقف'}</b><span>الجمع</span></div></div>
    <section><div class="sec-head"><h2 class="h-sec">جمع الفتاوى</h2></div>
      <div class="controls" style="margin-bottom:14px">
        <select class="pick" id="cSh" style="height:44px"><option value="">كل المشايخ</option>${d.sheikhs.map(s => `<option value="${esc(s.id)}">${esc(s.name)} (${fmt(by[s.id] || 0)})</option>`).join('')}</select>
        <label class="muted">حتى <input class="field" type="number" id="cLim" value="200" min="1" style="width:110px"> صفحة</label>
        <label class="muted"><input type="checkbox" id="cAi" ${d.ai ? '' : 'disabled'}> تحليل ذكي للصفحات</label>
        <button class="b b-pri" id="cGo" ${d.crawling ? 'disabled' : ''}>ابدأ الجمع</button><button class="b" id="cStop">إيقاف</button>
      </div>
      <pre class="log" id="log">${esc(d.log.join('\n') || 'لا يوجد سجل بعد.')}</pre>
      <button class="b b-sm" id="clrDemo" style="margin-top:12px">حذف البيانات التجريبية</button></section>
    <section><div class="sec-head"><h2 class="h-sec">المشايخ والمواقع</h2></div>
      <p class="muted" style="margin-top:0">لكل شيخ: id، name، short، aliases (أسماء يُذكر بها في الأسئلة)، site.domain، site.sitemaps، site.include (أنماط روابط الفتاوى).</p>
      <textarea class="code" id="shJson" spellcheck="false">${esc(JSON.stringify(d.sheikhs, null, 2))}</textarea>
      <button class="b b-pri" id="shSave" style="margin-top:12px">حفظ التعديلات</button></section></div>`;
  $('#cGo').onclick = async () => { try { await api('/api/admin/crawl', { method: 'POST', headers: adminH(), body: JSON.stringify({ sheikh: $('#cSh').value, limit: Number($('#cLim').value), ai: $('#cAi').checked }) }); toast('بدأ الجمع'); $('#cGo').disabled = true; poll(); } catch (e) { toast(e.message); } };
  $('#cStop').onclick = async () => { await api('/api/admin/crawl/stop', { method: 'POST', headers: adminH() }); toast('أُوقف الجمع'); };
  $('#clrDemo').onclick = async () => { const r = await api('/api/admin/clear-demo', { method: 'POST', headers: adminH() }); toast(`حُذفت ${fmt(r.removed)} فتوى تجريبية`); await loadMeta(); };
  $('#shSave').onclick = async () => { let list; try { list = JSON.parse($('#shJson').value); } catch { toast('صيغة JSON غير صحيحة'); return; }
    try { await api('/api/admin/sheikhs', { method: 'POST', headers: adminH(), body: JSON.stringify({ sheikhs: list }) }); toast('حُفظت التعديلات'); await loadMeta(); } catch (e) { toast(e.message); } };
  if (d.crawling) poll();
}
function poll() {
  clearInterval(admTimer);
  admTimer = setInterval(async () => {
    if (loc().pathname !== '/admin') return clearInterval(admTimer);
    try { const d = await api('/api/admin/stats', { headers: adminH() }); const el = $('#log');
      if (el) { el.textContent = d.log.join('\n'); el.scrollTop = el.scrollHeight; }
      if (!d.crawling) { clearInterval(admTimer); if ($('#cGo')) $('#cGo').disabled = false; loadMeta(); }
    } catch { clearInterval(admTimer); }
  }, 3000);
}

function notFound(msg) { view.innerHTML = `<div class="page">${stateBlock('الصفحة غير موجودة', msg || 'ربما تغير الرابط. ابدأ من الصفحة الرئيسية.', '<a class="b b-pri" href="/" data-link>الصفحة الرئيسية</a>')}</div>`; }

// ================= التوجيه =================
let vurl = '/';
const loc = () => {
  if (PREVIEW) return new URL(vurl, 'http://x');
  let p = location.pathname;
  p = p.startsWith(BASE) ? '/' + p.slice(BASE.length) : (p + '/' === BASE ? '/' : p);
  return new URL(p.replace(/\/index\.html$/, '/') + location.search, 'http://x');
};
function route() {
  stopListen();
  const { pathname } = loc(), params = new URLSearchParams(loc().search);
  $('#barSearch').hidden = pathname === '/' || (innerWidth < 640 && pathname !== '/search');
  $$('.nav a').forEach(a => a.classList.toggle('on', pathname.startsWith(a.getAttribute('href'))));
  let m;
  if (pathname === '/') { document.title = 'جامع الفتاوى'; home(); }
  else if (pathname === '/search') searchPage(params);
  else if ((m = pathname.match(/^\/fatwa\/(\d+)/))) fatwaPage(m[1]);
  else if (pathname === '/sheikhs') sheikhsPage();
  else if ((m = pathname.match(/^\/sheikh\/([\w-]+)/))) sheikhPage(m[1], params);
  else if (pathname === '/abwab') abwabPage();
  else if ((m = pathname.match(/^\/bab\/([\w-]+)/))) babPage(m[1], params);
  else if (pathname === '/saved') savedPage();
  else if (pathname === '/admin') adminPage();
  else notFound();
  window.scrollTo(0, 0);
}
function go(url) { if (PREVIEW) vurl = url; else history.pushState(null, '', BASE + url.replace(/^\//, '')); route(); }
document.addEventListener('click', e => {
  const a = e.target.closest('a[data-link]');
  if (!a || e.ctrlKey || e.metaKey || e.shiftKey || e.button) return;
  e.preventDefault(); go(a.getAttribute('href'));
});
window.addEventListener('popstate', route);

// ================= مساعد الموقع =================
const bot = { open: false, msgs: store.get('bot', []) };
function botRender() {
  const all = bot.msgs.length ? bot.msgs : [{ role: 'assistant', content: 'أهلاً بك. أنا مساعد الموقع، أجيبك عن طريقة استخدامه: البحث، وسؤال شيخ بعينه، ومقارنة الأقوال، والمشاركة.' }];
  $('#botLog').innerHTML = all.map(m => `<div class="msg ${m.role === 'user' ? 'me' : 'it'}">${esc(m.content)}${m.search ? `<br><a class="b b-sm b-soft" href="/search?q=${encodeURIComponent(m.search)}" data-link>${I.search} ابحث عن: ${esc(m.search.slice(0, 50))}</a>` : ''}</div>`).join('');
  $('#botLog').scrollTop = 1e6;
  $('#botQuick').innerHTML = bot.msgs.length ? '' : ['كيف أسأل شيخاً بعينه؟', 'كيف أقارن بين الأقوال؟', 'كيف أتأكد من الجواب؟', 'هل أقدر أسأل بصوتي؟'].map(x => `<button type="button">${esc(x)}</button>`).join('');
}
function botToggle(open) {
  bot.open = open ?? !bot.open;
  $('#bot').hidden = !bot.open; $('#botFab').setAttribute('aria-expanded', bot.open);
  if (bot.open) { botRender(); setTimeout(() => $('#botIn').focus(), 60); }
}
async function botSend(text) {
  text = text.trim(); if (!text) return;
  bot.msgs.push({ role: 'user', content: text }); botRender();
  $('#botLog').insertAdjacentHTML('beforeend', '<div class="msg it"><span class="typing"><i></i><i></i><i></i></span></div>'); $('#botLog').scrollTop = 1e6;
  try { const r = await api('/api/assistant', { method: 'POST', body: JSON.stringify({ messages: bot.msgs.map(({ role, content }) => ({ role, content })) }) });
    bot.msgs.push({ role: 'assistant', content: r.reply || '', search: r.search });
  } catch (e) { bot.msgs.push({ role: 'assistant', content: e.message }); }
  bot.msgs = bot.msgs.slice(-20); store.set('bot', bot.msgs); botRender();
}
$('#botFab').onclick = () => botToggle();
$('#botClose').onclick = () => botToggle(false);
$('#botForm').onsubmit = e => { e.preventDefault(); const v = $('#botIn').value; $('#botIn').value = ''; botSend(v); };
$('#botQuick').onclick = e => { if (e.target.tagName === 'BUTTON') botSend(e.target.textContent); };
$('#botLog').addEventListener('click', e => { if (e.target.closest('a[data-link]') && innerWidth < 640) botToggle(false); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && bot.open) botToggle(false); });
$('#share').addEventListener('click', e => { if (e.target === $('#share')) $('#share').close(); });

// ================= البدء =================
async function loadMeta() {
  try { META = await api('/api/meta'); } catch (e) { toast(e.message); }
  $('#demoBar').hidden = !META.demo && !META.loading;
  if (META.static) $('#adminLink')?.remove();
  if (META.static && !META.total) { $('#demoBar').hidden = false; $('#demoBar span').textContent = 'لم تُجمع الفتاوى بعد. من GitHub افتح تبويب Actions وشغّل «جمع الفتاوى»، وبعد انتهائه تظهر الفتاوى هنا.'; }
  if (META.loading) { $('#demoBar span').textContent = 'نجهّز الفتاوى بعد التحديث، قد يستغرق دقيقة. حدّث الصفحة بعد قليل.'; setTimeout(loadMeta, 8000); }
}
updateSavedCount();
loadMeta().then(route);
}
