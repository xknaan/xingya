/* Node 端到端逻辑测试：mock 浏览器环境，验证 db.js 核心业务流 */
const fs = require('fs');
let mem = null; // 模拟 IndexedDB 存储

global.indexedDB = {
  open() {
    const req = {};
    setTimeout(() => {
      const db = {
        objectStoreNames: { contains: () => false },
        createObjectStore: () => {},
        transaction() {
          return {
            objectStore() {
              return {
                get() { const r = {}; setTimeout(() => { r.result = mem; r.onsuccess && r.onsuccess(); }, 0); return r; },
                put(v) { mem = v; return {}; }
              };
            },
            set oncomplete(fn) { setTimeout(fn, 0); }
          };
        }
      };
      req.result = db;
      req.onupgradeneeded && req.onupgradeneeded();
      req.onsuccess && req.onsuccess();
    }, 0);
    return req;
  }
};

// 加载 sql.js
const initSqlJs = require('../node_modules/sql.js');
let Store, DB;

function ok(cond, msg) { if (cond) console.log('  ✓ ' + msg); else { console.log('  ✗ ' + msg); process.exitCode = 1; } }

(async () => {
  const SQL = await initSqlJs();
  global.initSqlJs = () => Promise.resolve(SQL);

  // 载入 store.js 与 db.js 到全局
  eval(fs.readFileSync(require('path').join(__dirname,'../js/store.js'), 'utf8').replace(/^const DB_STORE_NAME/m, 'var DB_STORE_NAME').replace(/^const DB_NAME/m, 'var DB_NAME').replace(/^const Store/m, 'var Store'));
  eval(fs.readFileSync(require('path').join(__dirname,'../js/db.js'), 'utf8').replace(/^const DB/m, 'var DB'));
  global.Store = Store; global.DB = DB;

  console.log('\n[1] 初始化数据库');
  await DB.init();
  ok(DB.isInitialized(), '数据库已初始化');
  ok(DB.getTasks().length === 5, '预置 5 个日常任务');
  ok(DB.getBalance() === 0, '初始积分为 0');
  ok(!DB.hasPin('parent') && !DB.hasPin('student'), '初始未设置密码');

  console.log('\n[2] 密码与比例设置');
  DB.setPin('parent', '8888'); DB.setPin('student', '1234');
  ok(DB.verifyPin('parent', '8888'), '家长密码校验通过');
  ok(DB.verifyPin('parent', 'xxxx') === false, '错误密码被拒绝');
  DB.setRates(2, 20);
  ok(DB.getRates().phone === 2 && DB.getRates().money === 20, '兑换比例更新成功');

  console.log('\n[3] 领取与打卡流程');
  const task = DB.getTasks().find(t => t.name === '主动完成作业'); // 20分
  ok(DB.claimTask(task.id).ok, '领取任务成功');
  ok(DB._one("SELECT id FROM checkins WHERE task_id=? AND status='claimed'", [task.id]), '打卡记录为已领取');
  ok(DB.claimTask(task.id).ok === false, '重复领取被拦截');
  const ck = DB._one("SELECT * FROM checkins WHERE task_id=? AND status='claimed'", [task.id]);
  DB.submitCheckin(ck.id, 'data:image/jpeg;base64,xxx');
  ok(DB._one('SELECT status FROM checkins WHERE id=?', [ck.id]).status === 'submitted', '提交后状态为待确认');

  console.log('\n[4] 评分与积分发放（20分任务）');
  DB.reviewCheckin(ck.id, true, 'perfect');
  ok(DB._one('SELECT status FROM checkins WHERE id=?', [ck.id]).status === 'confirmed', '状态变为已通过');
  ok(DB.getBalance() === 20, '完美评分得 20 分');
  // 完成 75% = 15 分
  const t2 = DB.getTasks().find(t => t.name === '语文阅读');
  DB.claimTask(t2.id);
  const ck2 = DB._one("SELECT * FROM checkins WHERE task_id=? AND status='claimed'", [t2.id]);
  DB.submitCheckin(ck2.id, '');
  DB.reviewCheckin(ck2.id, true, 'done');
  ok(DB.getBalance() === 31, '语文阅读15分的75%=11.25≈11分，累计31');
  // 一般 50% = 7.5 四舍五入 = 8 分
  const t3 = DB.getTasks().find(t => t.name === '英文阅读');
  DB.claimTask(t3.id);
  const ck3 = DB._one("SELECT * FROM checkins WHERE task_id=? AND status='claimed'", [t3.id]);
  DB.submitCheckin(ck3.id, '');
  DB.reviewCheckin(ck3.id, true, 'normal');
  ok(DB.getBalance() === 39, '英文阅读15分的50%=7.5四舍五入为8分，累计39');

  console.log('\n[5] 兑换流程（比例：2分=1分钟，20分=1元）');
  const r = DB.addExchange('phone', 20);
  ok(r.ok && r.amount === 10, '20积分兑换 10 分钟手机时间');
  ok(DB.getBalance() === 19, '兑换后积分扣除至 19');
  ok(DB.getExchanges().filter(e => e.status === 'pending').length === 1, '产生 1 条待确认兑换');
  ok(DB.getLedger().length === 4, '积分明细记录 4 条（3次获得+1次兑换）');
  ok(DB.addExchange('money', 999).ok === false, '积分不足时兑换被拒绝');

  console.log('\n[6] 确认消费与退还');
  const ex = DB.getExchanges()[0];
  ok(DB.confirmExchange(ex.id, '已使用').ok, '确认消费成功');
  ok(DB.getConsumptions().length === 1, '产生 1 条消费记录');
  ok(DB.getConsumptions()[0].amount === 10, '消费记录金额为 10 分钟');
  const r2 = DB.addExchange('money', 10); // 20分=1元, 19-10=9
  ok(r2.ok && r2.amount === 0.5, '10积分兑换 0.5 元');
  const ex2 = DB.getExchanges()[0]; // 最新的是 money 10分
  ok(DB.rejectExchange(ex2.id).ok, '驳回兑换成功');
  ok(DB.getBalance() === 19, '驳回后积分退还 10，余额回到 19');

  console.log('\n[7] 数据持久化');
  await new Promise(r => setTimeout(r, 50));
  ok(mem && mem.byteLength > 0, '数据库二进制已存储到 IndexedDB');
  await DB.init();
  ok(DB.getBalance() === 19, '重新加载后积分保持 19');

  console.log('\n[8] 数据备份与恢复');
  const backup = DB.exportBackup();
  ok(backup.format === 'xingya-backup' && backup.version === 1, '备份对象格式正确');
  ok(backup.balance === 19, '备份包含当前积分 19');
  ok(backup.stats.checkins === 3 && backup.stats.ledger === 6, '备份包含正确的统计信息');
  ok(typeof backup.dbBase64 === 'string' && backup.dbBase64.length > 0, '备份包含 base64 数据库内容');
  const v = DB.validateBackup(backup);
  ok(v.ok && v.bytes && v.bytes.length > 0, '备份校验通过');
  ok(DB.validateBackup({format:'wrong'}).ok === false, '非法格式备份被拒绝');
  ok(DB.validateBackup({format:'xingya-backup',version:1,dbBase64:'!!!!'}).ok === false, '损坏的数据库备份被拒绝');
  // 篡改数据后再恢复
  await new Promise(r => setTimeout(r, 30));
  DB.setSetting('rate_phone', '999');
  ok(DB.getRates().phone === 999, '恢复前比例被改为 999');
  await DB.restoreBackup(v.bytes);
  ok(DB.getRates().phone === 2, '恢复后比例还原为备份中的 2');
  ok(DB.getBalance() === 19, '恢复后积分仍为 19');

  console.log('\n=== 测试完成 ===');
})().catch(e => { console.error('测试异常:', e); process.exitCode = 1; });
