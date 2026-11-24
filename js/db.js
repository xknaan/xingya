/* SQLite 数据层：基于 sql.js，数据持久化到 IndexedDB */
const DB = {
  sql: null,
  db: null,

  async init() {
    this.sql = await initSqlJs({ locateFile: (f) => 'vendor/' + f });
    const saved = await Store.load();
    const valid = saved && saved.byteLength > 0;
    this.db = valid ? new this.sql.Database(new Uint8Array(saved)) : new this.sql.Database();
    this._createSchema();
    if (!this.isInitialized()) this._seed();
    this._persist();
  },

  _createSchema() {
    this.db.run(`
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY, value TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS tasks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT DEFAULT '',
        points INTEGER NOT NULL,
        duration INTEGER NOT NULL,
        need_photo INTEGER NOT NULL DEFAULT 0,
        active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS checkins (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        task_id INTEGER NOT NULL,
        task_name TEXT NOT NULL,
        task_type TEXT NOT NULL,
        task_points INTEGER NOT NULL,
        task_duration INTEGER DEFAULT 0,
        photo TEXT DEFAULT '',
        status TEXT NOT NULL,
        grade TEXT,
        awarded INTEGER DEFAULT 0,
        claimed_at TEXT NOT NULL,
        submitted_at TEXT,
        reviewed_at TEXT,
        reviewer_note TEXT DEFAULT ''
      );
      CREATE TABLE IF NOT EXISTS points_ledger (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        delta INTEGER NOT NULL,
        reason TEXT NOT NULL,
        ref_type TEXT,
        ref_id INTEGER,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS exchanges (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        kind TEXT NOT NULL,
        points INTEGER NOT NULL,
        amount REAL NOT NULL,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        confirmed_at TEXT
      );
      CREATE TABLE IF NOT EXISTS consumptions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        exchange_id INTEGER NOT NULL,
        kind TEXT NOT NULL,
        amount REAL NOT NULL,
        note TEXT DEFAULT '',
        created_at TEXT NOT NULL
      );
    `);
  },

  _seed() {
    const now = this._now();
    this.db.run("INSERT OR REPLACE INTO settings VALUES ('initialized','1')");
    this.db.run("INSERT OR REPLACE INTO settings VALUES ('parent_pin',?)", [this.hashPin('')]);
    this.db.run("INSERT OR REPLACE INTO settings VALUES ('student_pin',?)", [this.hashPin('')]);
    this.db.run("INSERT OR REPLACE INTO settings VALUES ('rate_phone','1')");   // 1 积分 = 1 分钟
    this.db.run("INSERT OR REPLACE INTO settings VALUES ('rate_money','10')");  // 10 积分 = 1 元
    const defaults = [
      ['daily', '主动完成作业', '放学后主动、按时完成当天作业', 20, 60, 0],
      ['daily', '做一项家务', '洗碗/扫地/整理房间等任意一项', 15, 20, 1],
      ['daily', '语文阅读', '课外书或课文阅读', 15, 30, 0],
      ['daily', '英文阅读', '英文读物或单词阅读', 15, 30, 0],
      ['daily', '体育锻炼', '跑步/跳绳/球类等', 20, 30, 1]
    ];
    defaults.forEach(t => {
      this.db.run(
        'INSERT INTO tasks (type,name,description,points,duration,need_photo,active,created_at) VALUES (?,?,?,?,?,?,1,?)',
        [t[0], t[1], t[2], t[3], t[4], t[5], now]
      );
    });
  },

  _now() { return new Date().toISOString(); },

  hashPin(pin) {
    // 简单加盐哈希（本地单机密码，非高安全场景）
    let h = 5381;
    const s = 'kouqin#' + String(pin);
    for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
    return 'h' + (h >>> 0).toString(16);
  },

  _persist() {
    const bytes = this.db.export();
    return Store.save(bytes);
  },

  _rows(sql, params = []) {
    const res = this.db.exec(sql, params);
    if (!res.length) return [];
    const { columns, values } = res[0];
    return values.map(v => {
      const obj = {};
      columns.forEach((c, i) => obj[c] = v[i]);
      return obj;
    });
  },

  _one(sql, params = []) { const r = this._rows(sql, params); return r[0] || null; },

  // ---------- 设置 ----------
  isInitialized() {
    return !!this._one("SELECT value FROM settings WHERE key='initialized'");
  },
  getSetting(key) {
    const r = this._one('SELECT value FROM settings WHERE key=?', [key]);
    return r ? r.value : null;
  },
  setSetting(key, value) {
    this.db.run('INSERT OR REPLACE INTO settings VALUES (?,?)', [key, String(value)]);
    this._persist();
  },
  hasPin(role) {
    const hash = this.getSetting(role + '_pin');
    return hash && hash !== this.hashPin('');
  },
  verifyPin(role, pin) {
    return this.getSetting(role + '_pin') === this.hashPin(pin);
  },
  setPin(role, pin) { this.setSetting(role + '_pin', this.hashPin(pin)); },
  getRates() {
    return {
      phone: Number(this.getSetting('rate_phone')) || 1,
      money: Number(this.getSetting('rate_money')) || 10
    };
  },
  setRates(phone, money) {
    this.db.run("INSERT OR REPLACE INTO settings VALUES ('rate_phone',?)", [String(phone)]);
    this.db.run("INSERT OR REPLACE INTO settings VALUES ('rate_money',?)", [String(money)]);
    this._persist();
  },

  // ---------- 任务 ----------
  getTasks(type) {
    const sql = type ? 'SELECT * FROM tasks WHERE active=1 AND type=? ORDER BY id DESC' : 'SELECT * FROM tasks WHERE active=1 ORDER BY type,id DESC';
    return this._rows(sql, type ? [type] : []);
  },
  getTask(id) { return this._one('SELECT * FROM tasks WHERE id=?', [id]); },
  addTask(data) {
    this.db.run(
      'INSERT INTO tasks (type,name,description,points,duration,need_photo,active,created_at) VALUES (?,?,?,?,?,?,1,?)',
      [data.type, data.name, data.description || '', Number(data.points), Number(data.duration), data.need_photo ? 1 : 0, this._now()]
    );
    this._persist();
  },
  updateTask(id, data) {
    this.db.run(
      'UPDATE tasks SET type=?,name=?,description=?,points=?,duration=?,need_photo=? WHERE id=?',
      [data.type, data.name, data.description || '', Number(data.points), Number(data.duration), data.need_photo ? 1 : 0, id]
    );
    this._persist();
  },
  deleteTask(id) {
    this.db.run('UPDATE tasks SET active=0 WHERE id=?', [id]);
    this._persist();
  },

  // ---------- 打卡 ----------
  claimTask(taskId) {
    const t = this.getTask(taskId);
    if (!t) return { ok: false, msg: '任务不存在' };
    const dup = this._one("SELECT id FROM checkins WHERE task_id=? AND status IN ('claimed','submitted')", [taskId]);
    if (dup) return { ok: false, msg: '该任务已有进行中的打卡' };
    this.db.run(
      'INSERT INTO checkins (task_id,task_name,task_type,task_points,task_duration,photo,status,claimed_at) VALUES (?,?,?,?,?,?,\'claimed\',?)',
      [t.id, t.name, t.type, t.points, t.duration, '', this._now()]
    );
    this._persist();
    return { ok: true };
  },
  submitCheckin(id, photo) {
    this.db.run("UPDATE checkins SET status='submitted', photo=?, submitted_at=? WHERE id=? AND status='claimed'", [photo || '', this._now(), id]);
    this._persist();
  },
  getCheckins(status) {
    const sql = status ? 'SELECT * FROM checkins WHERE status=? ORDER BY id DESC' : 'SELECT * FROM checkins ORDER BY id DESC';
    return this._rows(sql, status ? [status] : []);
  },
  reviewCheckin(id, pass, grade, note) {
    const c = this._one('SELECT * FROM checkins WHERE id=?', [id]);
    if (!c || c.status !== 'submitted') return { ok: false, msg: '状态不允许评分' };
    if (pass) {
      const ratio = grade === 'perfect' ? 1 : grade === 'done' ? 0.75 : 0.5;
      const awarded = Math.round(c.task_points * ratio);
      this.db.run("UPDATE checkins SET status='confirmed', grade=?, awarded=?, reviewed_at=?, reviewer_note=? WHERE id=?",
        [grade, awarded, this._now(), note || '', id]);
      this.db.run('INSERT INTO points_ledger (delta,reason,ref_type,ref_id,created_at) VALUES (?,?,?,?,?)',
        [awarded, '任务打卡：' + c.task_name, 'checkin', id, this._now()]);
    } else {
      this.db.run("UPDATE checkins SET status='rejected', reviewed_at=?, reviewer_note=? WHERE id=?",
        [this._now(), note || '', id]);
    }
    this._persist();
    return { ok: true };
  },

  // ---------- 积分 ----------
  getBalance() {
    const r = this._one('SELECT COALESCE(SUM(delta),0) AS bal FROM points_ledger');
    return r ? r.bal : 0;
  },
  getLedger() { return this._rows('SELECT * FROM points_ledger ORDER BY id DESC'); },

  // ---------- 兑换与消费 ----------
  addExchange(kind, points) {
    points = Math.floor(Number(points));
    const bal = this.getBalance();
    if (!points || points <= 0) return { ok: false, msg: '请输入有效积分' };
    if (points > bal) return { ok: false, msg: '积分不足' };
    const rates = this.getRates();
    const amount = kind === 'phone' ? points / rates.phone : points / rates.money;
    this.db.run("INSERT INTO exchanges (kind,points,amount,status,created_at) VALUES (?,?,?,'pending',?)",
      [kind, points, amount, this._now()]);
    const eid = this._one('SELECT last_insert_rowid() AS id').id;
    this.db.run('INSERT INTO points_ledger (delta,reason,ref_type,ref_id,created_at) VALUES (?,?,?,?,?)',
      [-points, '兑换' + (kind === 'phone' ? '玩手机时长' : '零花钱'), 'exchange', eid, this._now()]);
    this._persist();
    return { ok: true, amount };
  },
  getExchanges() { return this._rows('SELECT * FROM exchanges ORDER BY id DESC'); },
  confirmExchange(id, note) {
    const e = this._one('SELECT * FROM exchanges WHERE id=?', [id]);
    if (!e || e.status !== 'pending') return { ok: false, msg: '状态不允许确认' };
    this.db.run("UPDATE exchanges SET status='confirmed', confirmed_at=? WHERE id=?", [this._now(), id]);
    this.db.run('INSERT INTO consumptions (exchange_id,kind,amount,note,created_at) VALUES (?,?,?,?,?)',
      [e.id, e.kind, e.amount, note || '', this._now()]);
    this._persist();
    return { ok: true };
  },
  rejectExchange(id, note) {
    const e = this._one('SELECT * FROM exchanges WHERE id=?', [id]);
    if (!e || e.status !== 'pending') return { ok: false, msg: '状态不允许操作' };
    this.db.run("UPDATE exchanges SET status='rejected', confirmed_at=? WHERE id=?", [this._now(), id]);
    this.db.run('INSERT INTO points_ledger (delta,reason,ref_type,ref_id,created_at) VALUES (?,?,?,?,?)',
      [e.points, '兑换取消退还积分', 'exchange', e.id, this._now()]);
    this._persist();
    return { ok: true };
  },
  getConsumptions() { return this._rows('SELECT * FROM consumptions ORDER BY id DESC'); },

  // ---------- 备份与恢复 ----------
  // 导出完整数据库字节 + 元信息，供打包成备份文件
  exportBackup() {
    const bytes = this.db.export();
    return {
      format: 'xingya-backup',
      version: 1,
      exportedAt: this._now(),
      balance: this.getBalance(),
      stats: {
        tasks: this.getTasks().length,
        checkins: this.getCheckins().length,
        ledger: this.getLedger().length,
        exchanges: this.getExchanges().length,
        consumptions: this.getConsumptions().length
      },
      dbBase64: this._bytesToBase64(bytes)
    };
  },

  // 校验备份对象结构是否合法，返回 {ok, msg, data}
  validateBackup(obj) {
    try {
      if (!obj || typeof obj !== 'object') return { ok: false, msg: '文件内容不是有效的备份数据' };
      if (obj.format !== 'xingya-backup') return { ok: false, msg: '不是星芽打卡的备份文件' };
      if (obj.version !== 1) return { ok: false, msg: '备份版本不兼容' };
      if (typeof obj.dbBase64 !== 'string' || !obj.dbBase64.length) return { ok: false, msg: '备份缺少数据库内容' };
      // 尝试用 SQLite 引擎打开，确认数据库本身有效
      const bytes = this._base64ToBytes(obj.dbBase64);
      const testDb = new this.sql.Database(bytes);
      const tables = testDb.exec("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('settings','tasks','checkins')");
      testDb.close();
      const names = tables.length ? tables[0].values.map(v => v[0]) : [];
      if (!names.includes('settings') || !names.includes('tasks') || !names.includes('checkins')) {
        return { ok: false, msg: '备份数据结构不完整' };
      }
      return { ok: true, bytes };
    } catch (e) {
      return { ok: false, msg: '备份文件已损坏或无法解析' };
    }
  },

  // 恢复：将校验通过的字节写回本地数据库
  async restoreBackup(bytes) {
    await Store.save(new Uint8Array(bytes));
    this.db = new this.sql.Database(new Uint8Array(bytes));
    this._createSchema();
    this._persist();
    return true;
  },

  _bytesToBase64(bytes) {
    let binary = '';
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    }
    return btoa(binary);
  },
  _base64ToBytes(b64) {
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }
};
