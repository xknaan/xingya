/* 原生适配层单元测试：mock Capacitor 环境，验证状态栏高度与备份调用 */
const fs = require('fs');
let pass = 0, fail = 0;
function ok(cond, name) { if (cond) { console.log('  ✓ ' + name); pass++; } else { console.error('  ✗ ' + name); fail++; } }

(async () => {
  // 构造 mock window
  const calls = { getInfo: 0, setStyle: 0, writeFile: [], getUri: 0, share: 0 };
  let writeShouldFail = false;
  const statusBar = {
    getInfo: async () => { calls.getInfo++; return { visible: true, height: 44, overlays: true, style: 'DEFAULT', color: '#000' }; },
    setStyle: async (o) => { calls.setStyle++; calls.lastStyle = o; }
  };
  const filesystem = {
    writeFile: async (o) => { calls.writeFile.push(o); if (writeShouldFail) throw new Error('no permission'); return {}; },
    getUri: async () => { calls.getUri++; return { uri: 'content://backup.json' }; }
  };
  const share = { share: async (o) => { calls.share++; calls.lastShare = o; } };

  const cssVars = {};
  global.window = {
    Capacitor: {
      isNativePlatform: () => true,
      Plugins: { StatusBar: statusBar, Filesystem: filesystem, Share: share, Camera: {} }
    }
  };
  global.document = {
    documentElement: { style: { setProperty: (k, v) => { cssVars[k] = v; } } }
  };

  // 加载 native.js（把 const Native 改为挂载到 globalThis 以便断言访问）
  const src = fs.readFileSync(__dirname + '/../js/native.js', 'utf8').replace(/^const Native/m, 'globalThis.Native');
  eval(src);
  const Native = globalThis.Native;

  console.log('\n[A] 初始化与状态栏高度');
  const isNative = await Native.init();
  ok(isNative === true, '识别为原生环境');
  ok(calls.getInfo === 1, '调用了 getInfo 读取状态栏信息');
  ok(cssVars['--status-bar-h'] === '44px', '状态栏高度写入 CSS 变量 --status-bar-h=44px');
  ok(calls.setStyle === 1 && calls.lastStyle.style === 'DARK', '状态栏样式设为深色图标');

  console.log('\n[B] 备份写入 Documents');
  const r = await Native.saveTextFile('backup.json', '{"a":1}');
  ok(r.ok === true && r.native === true, '备份写入成功且标记为原生');
  ok(calls.writeFile.length === 1, 'writeFile 调用一次');
  ok(calls.writeFile[0].directory === 'DOCUMENTS', 'directory 使用字符串常量 DOCUMENTS（非 undefined）');
  ok(calls.writeFile[0].path === 'backup.json' && calls.writeFile[0].data === '{"a":1}', '文件名与内容正确');

  console.log('\n[C] 分享已保存文件');
  await Native.shareSavedFile('backup.json');
  ok(calls.getUri === 1 && calls.share === 1, 'getUri + share 各调用一次');
  ok(calls.lastShare.url === 'content://backup.json', '分享的 url 为文件 uri');

  console.log('\n[D] 写入失败时返回错误（不再静默抛错）');
  writeShouldFail = true;
  const r2 = await Native.saveTextFile('backup.json', 'x');
  ok(r2.ok === false && /写入手机存储失败/.test(r2.msg), '失败时返回 ok=false 并带错误信息');

  console.log('\n=== 原生适配层测试完成 ===');
  if (fail) { console.error(fail + ' 项失败'); process.exit(1); }
  else console.log('✓ 全部 ' + pass + ' 项通过');
})();
