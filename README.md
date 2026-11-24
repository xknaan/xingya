# 星芽打卡 · 成长积分

一款面向初一学生的单机打卡积分应用。学生完成日常/临时任务积累积分，兑换玩手机时长或零花钱；家长通过密码登录后确认打卡、评分、调整兑换比例并确认消费。**所有数据仅存于本机，无需联网、无需账号、无需服务器。**

## 功能一览

**双角色 + 独立密码**

- 底部 Tabbar 区分「学生端」与「家长端」，各自独立密码
- 首次打开引导设置两个密码；家长端可随时修改

**学生端**（淡粉→淡紫）

- 任务大厅：领取日常任务 / 家长发布的临时任务
- 打卡：完成后确定打卡，可上传佐证照片，等待家长确认
- 积分：查看总积分、兑换手机时长 / 零花钱（按实时比例换算）
- 记录：积分明细、消费记录

**家长端**（淡蓝→淡黑）

- 待审：给待确认的打卡评分（完美 100% / 完成 75% / 一般 50%，四舍五入发放积分）、确认或驳回兑换
- 任务：发布 / 编辑 / 删除日常与临时任务
- 兑换：随时调整兑换比例、查看兑换记录与消费记录
- 设置：修改密码、数据概览、切换角色、**数据备份/恢复**、清空重置

**数据安全**（家长端"设置"页）
- **备份并下载**：一键把全部数据打包成备份文件（JSON），自动下载到手机「下载」目录，可自行保存到网盘/微信/电脑
- **从备份文件恢复**：选择此前下载的备份文件即可完整还原（任务、打卡、积分、兑换记录、密码）；恢复前会校验文件有效性
- **密码二次确认**：恢复数据和清空数据都必须输入家长密码，输错会拒绝并清空输入框，防止误操作
- 备份文件包含佐证照片，注意妥善保管避免泄露

**完整留痕**：积分明细、兑换情况、消费情况全部记录，可随时追溯。

## 在安卓手机上使用

本应用是 PWA（渐进式网页应用），用手机浏览器打开后「添加到主屏幕」，即可像原生 App 一样全屏运行，且支持离线。

### 方式一：部署到任意静态托管（推荐）

把整个 `kouqin-app` 目录上传到任意静态托管（如 GitHub Pages、Netlify、Vercel、腾讯云静态托管等），用手机浏览器访问该网址 → 菜单 → 「添加到主屏幕」。

### 方式二：局域网内直接访问

1. 在电脑上进入本目录，启动一个静态服务器：


   ```
   python3 -m http.server 8765
   ```
2. 让手机和电脑连同一个 WiFi，手机浏览器访问 `http://<电脑局域网IP>:8765`
3. 浏览器菜单 → 「添加到主屏幕」/「安装应用」

> 注意：必须通过 `http://` 或 `https://` 访问，**不能直接双击 index.html 用 `file://` 打开**——浏览器在 file 协议下会禁止本地数据库和离线缓存。

## 打包成 APK（Capacitor + GitHub Actions）

本项目已配置好 Capacitor 8 工程和 GitHub Actions，**无需在本机安装 Android Studio / JDK 21 / Android SDK**，云端会自动编译出 APK。

### 自动出包（推荐）

1. 把本目录推送到 GitHub 仓库的 `main` 或 `master` 分支
2. GitHub Actions 会自动触发 `.github/workflows/build-apk.yml`：配置 JDK 21 → `npm ci` → `cap sync` → `gradle assembleDebug`
3. 构建完成后，进入仓库的 Actions 页面，点开对应运行记录，在 **Artifacts** 里下载 `xingya-debug-apk`
4. 解压后把 `app-debug.apk` 传到安卓手机，允许安装未知来源应用后安装即可

也可在 Actions 页面手动点 "Run workflow" 触发构建。debug 包可直接安装；如需正式签名上架包，再配置 keystore 并用 `assembleRelease`。

### 本地出包（需要 Android 环境）

若本机已装 Android Studio / JDK 21 / Android SDK：

```
npm ci
npm run build:web       # 同步 web 资源到 www/
npx cap sync android
cd android && ./gradlew assembleDebug
```

产物在 `android/app/build/outputs/apk/debug/app-debug.apk`。

### 原生适配说明

- `js/native.js` 是原生能力适配层：在 APK 内调用相机插件拍照、Filesystem + Share 保存备份到手机；在普通浏览器自动回退到 Web 方案。PWA 版与 APK 版共用同一套业务代码。
- APK 内禁用了 Service Worker（避免拦截 Capacitor 桥接），PWA 版仍保留离线缓存。
- `www/` 是 Capacitor 的 webDir；改动 `js/`、`css/`、`index.html` 后需运行 `npm run build:web` 重新同步。

## 目录结构

```
kouqin-app/
├── index.html          # 入口（PWA 版）
├── manifest.json       # PWA 安装配置
├── sw.js               # 离线缓存
├── capacitor.config.ts # Capacitor 配置
├── sync-web.js         # web 资源同步脚本
├── css/style.css       # 双主题样式
├── js/
│   ├── native.js       # 原生能力适配层（相机/文件/分享）
│   ├── store.js        # IndexedDB 持久化
│   ├── db.js           # SQLite 数据层（业务核心）
│   └── app.js          # 界面与交互
├── vendor/             # SQLite WASM 引擎
├── icons/              # PWA 图标
├── www/                # Capacitor webDir（由 sync-web 同步）
├── android/            # Android 原生工程
├── .github/workflows/  # 自动出包配置
└── tests/              # 自动化测试脚本与截图
```

## 数据存储说明

- 数据库为真正的 SQLite（sql.js 编译的 WASM 版本），数据文件持久化在浏览器的 IndexedDB 中。
- 数据只在当前浏览器/设备上，**清除浏览器数据会导致记录丢失**。
- 拍照佐证会自动压缩到合理尺寸后存入数据库，避免占用过多空间。

## 测试

`tests/` 目录包含回归测试脚本（Node + Puppeteer）：

- `test_logic.js`：数据库业务流测试（Node 环境 mock IndexedDB）
- `test_browser.js`：浏览器端到端测试（需本机 Chrome + 本地服务器）
- `test_backup_browser.js`：备份/恢复/密码确认专项测试

历史开发由自动化测试验证，覆盖初始化、领取、打卡、三档评分、积分四舍五入、兑换、确认消费、驳回退还、持久化、备份、恢复、密码二次确认等核心流程，全部通过。
