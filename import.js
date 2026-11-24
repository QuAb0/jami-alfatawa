// يحمّل data/corpus إلى قاعدة البيانات المحلية
const { importAll } = require('../server/corpus');
const t = Date.now();
const n = importAll(console.log);
console.log(`حُمّلت ${n} فتوى في ${((Date.now() - t) / 1000).toFixed(1)} ثانية`);
