/* 把根目录的 web 资源同步到 Capacitor 的 www/ 目录 */
const fs = require('fs');
const path = require('path');
const root = __dirname;
const web = path.join(root, 'www');

const files = [
  'index.html',
  'manifest.json',
  'sw.js',
  'css/style.css',
  'js/app.js',
  'js/db.js',
  'js/store.js',
  'js/native.js',
  'vendor/sql-wasm.js',
  'vendor/sql-wasm.wasm',
  'icons/icon-192.png',
  'icons/icon-512.png'
];

fs.mkdirSync(web, { recursive: true });
files.forEach(f => {
  const src = path.join(root, f);
  const dst = path.join(web, f);
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.copyFileSync(src, dst);
});
console.log(`已同步 ${files.length} 个文件到 www/`);
