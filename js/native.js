/* ============================================================
   原生能力适配层
   在 Capacitor APK 内走原生插件；在普通浏览器里走 Web 回退。
   业务代码只调用 Native.* 统一接口，无需关心运行环境。
   ============================================================ */
const Native = {
  _cap: null,
  _fs: null,
  _share: null,
  _camera: null,
  isNative: false,

  async init() {
    // Capacitor 在原生 WebView 中注入 window.Capacitor
    if (window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()) {
      this.isNative = true;
      this._cap = window.Capacitor;
      this._fs = window.Capacitor.Plugins && window.Capacitor.Plugins.Filesystem;
      this._share = window.Capacitor.Plugins && window.Capacitor.Plugins.Share;
      this._camera = window.Capacitor.Plugins && window.Capacitor.Plugins.Camera;
    }
    return this.isNative;
  },

  /* 保存文本文件到设备（APK: 写到 Documents 并可选分享；Web: 触发下载） */
  async saveTextFile(filename, content) {
    if (this.isNative && this._fs) {
      const { Directory } = this._cap.Plugins.Filesystem;
      await this._fs.writeFile({ directory: Directory.Documents, path: filename, data: content, encoding: 'utf8' });
      return { ok: true, native: true, uri: 'Documents/' + filename };
    }
    // Web 回退：Blob 下载
    try {
      const blob = new Blob([content], { type: 'application/json;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = filename;
      document.body.appendChild(a); a.click();
      setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1500);
      return { ok: true, native: false };
    } catch (e) { return { ok: false, msg: e.message }; }
  },

  /* 保存后调起系统分享（APK）。Web 端无操作。 */
  async shareSavedFile(filename) {
    if (!this.isNative || !this._fs || !this._share) return;
    try {
      const { Directory } = this._cap.Plugins.Filesystem;
      const res = await this._fs.getUri({ directory: Directory.Documents, path: filename });
      await this._share.share({ title: '星芽打卡备份', text: '星芽打卡数据备份文件', url: res.uri, dialogTitle: '保存备份到' });
    } catch (e) { /* 用户取消分享属正常 */ }
  },

  /* 选择并读取文本文件（APK: 用系统文件选择器拿到 content:// uri 后由 Filesystem 读；Web: input file） */
  pickTextFile() {
    return new Promise((resolve) => {
      const inp = document.createElement('input');
      inp.type = 'file'; inp.accept = '.json,application/json,text/plain'; inp.style.display = 'none';
      document.body.appendChild(inp);
      let done = false;
      const finish = (result) => { if (done) return; done = true; inp.remove(); resolve(result); };
      inp.addEventListener('change', async () => {
        const f = inp.files[0];
        if (!f) return finish({ ok: false, canceled: true });
        try {
          let text;
          if (this.isNative && this._fs && typeof f.path === 'string' && f.path) {
            // Capacitor Filesystem 可读 content:// uri
            const r = await this._fs.readFile({ path: f.path, encoding: 'utf8' });
            text = r.data;
          } else {
            text = await f.text();
          }
          finish({ ok: true, text });
        } catch (e) { finish({ ok: false, msg: e.message || '读取文件失败' }); }
      });
      inp.click();
    });
  },

  /* 拍照/选图，返回 dataURL（APK: Camera 插件；Web: input file + canvas 压缩） */
  async takePhoto() {
    if (this.isNative && this._camera) {
      try {
        const { CameraSource, CameraResultType } = this._cap.Plugins.Camera;
        const photo = await this._camera.getPhoto({
          quality: 72,
          allowEditing: false,
          resultType: CameraResultType.DataUrl,
          source: CameraSource.Prompt,   // 让用户选拍照或从相册选
          width: 1080
        });
        return { ok: true, data: photo.dataUrl };
      } catch (e) {
        // 用户取消
        return { ok: false, canceled: true };
      }
    }
    // Web 回退：沿用现有 pickPhoto 逻辑
    return new Promise((resolve) => {
      const inp = document.createElement('input');
      inp.type = 'file'; inp.accept = 'image/*'; inp.style.display = 'none';
      document.body.appendChild(inp);
      inp.addEventListener('change', () => {
        const f = inp.files[0]; inp.remove();
        if (!f) return resolve({ ok: false, canceled: true });
        const img = new Image(); const rd = new FileReader();
        rd.onload = () => {
          img.onload = () => {
            const MAX = 1080; let w = img.width, hh = img.height;
            if (w > MAX || hh > MAX) { const r = Math.min(MAX / w, MAX / hh); w = Math.round(w * r); hh = Math.round(hh * r); }
            const c = document.getElementById('compressCanvas'); c.width = w; c.height = hh;
            c.getContext('2d').drawImage(img, 0, 0, w, hh);
            resolve({ ok: true, data: c.toDataURL('image/jpeg', 0.72) });
          };
          img.src = rd.result;
        };
        rd.readAsDataURL(f);
      });
      inp.click();
    });
  }
};
