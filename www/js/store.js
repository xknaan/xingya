/* IndexedDB 持久化：把 sql.js 导出的数据库二进制存到本地 */
const DB_STORE_NAME = 'kouqin_db';
const DB_NAME = 'kouqin_storage';

const Store = {
  _db: null,

  _open() {
    return new Promise((resolve, reject) => {
      if (this._db) return resolve(this._db);
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(DB_STORE_NAME)) {
          db.createObjectStore(DB_STORE_NAME);
        }
      };
      req.onsuccess = () => { this._db = req.result; resolve(this._db); };
      req.onerror = () => reject(req.error);
    });
  },

  async load() {
    const db = await this._open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(DB_STORE_NAME, 'readonly');
      const req = tx.objectStore(DB_STORE_NAME).get('data');
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  },

  async save(bytes) {
    const db = await this._open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(DB_STORE_NAME, 'readwrite');
      tx.objectStore(DB_STORE_NAME).put(bytes, 'data');
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }
};
