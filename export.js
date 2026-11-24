// يصدّر الفتاوى الجديدة إلى data/corpus (يُستخدم في GitHub Actions بعد الجمع)
const { exportNew } = require('../server/corpus');
const r = exportNew();
console.log(`صُدّرت ${r.fatwas} فتوى جديدة و${r.crawled} رابطاً مُعالجاً`);
