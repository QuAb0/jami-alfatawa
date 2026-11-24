// نقطة التشغيل: قبل فتح قاعدة البيانات، ننزّل النسخة الجاهزة التي يبنيها GitHub بعد كل جمع
// (الاستضافة المجانية تمسح ملفاتها عند كل نوم أو تحديث، فالتنزيل أسرع بكثير من إعادة البناء)
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { pipeline } = require('stream/promises');
const { Readable } = require('stream');

const envFile = path.join(__dirname, '..', '.env');
if (fs.existsSync(envFile)) for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
  if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const DB = path.join(DATA_DIR, 'fatwas.db');
// رابط قاعدة البيانات الجاهزة: DB_URL، أو يُستنتج من مستودع GitHub الذي يربطه Render تلقائياً
const slug = process.env.RENDER_GIT_REPO_SLUG;
const DB_URL = process.env.DB_URL || (slug ? `https://github.com/${slug}/releases/download/db-latest/fatwas.db.gz` : '');

(async () => {
  if (DB_URL && !(fs.existsSync(DB) && fs.statSync(DB).size > 0)) {
    const t = Date.now();
    try {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      const ctrl = new AbortController(); const timer = setTimeout(() => ctrl.abort(), 180000);
      const res = await fetch(DB_URL, { signal: ctrl.signal, redirect: 'follow' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      await pipeline(Readable.fromWeb(res.body), zlib.createGunzip(), fs.createWriteStream(DB + '.tmp'));
      clearTimeout(timer);
      fs.renameSync(DB + '.tmp', DB);
      console.log(`نُزّلت قاعدة الفتاوى الجاهزة في ${((Date.now() - t) / 1000).toFixed(1)} ثانية`);
    } catch (e) {
      try { fs.unlinkSync(DB + '.tmp'); } catch { /* لا شيء */ }
      console.log('لم تُنزّل القاعدة الجاهزة (' + e.message + ')، سيُبنى المخزون من data/corpus');
    }
  }
  require('./index').listen();
})();
