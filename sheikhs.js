// قائمة المشايخ ومواقعهم (config/sheikhs.json)
const fs = require('fs');
const path = require('path');
const FILE = process.env.SHEIKHS_FILE || path.join(__dirname, '..', 'config', 'sheikhs.json');

let list = [];
function load() { list = JSON.parse(fs.readFileSync(FILE, 'utf8')); return list; }
load();

module.exports = {
  all: () => list,
  get: id => list.find(s => s.id === id),
  save(next) {
    if (!Array.isArray(next)) throw new Error('يجب أن تكون قائمة');
    for (const s of next) {
      if (!/^[a-z0-9-]{2,40}$/.test(s.id || '')) throw new Error(`معرّف غير صالح: ${s.id}`);
      if (!s.name || !s.site?.domain) throw new Error(`بيانات ناقصة للشيخ ${s.id}`);
    }
    fs.writeFileSync(FILE, JSON.stringify(next, null, 2));
    load();
  },
};
