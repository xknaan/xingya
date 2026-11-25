/* 浏览器端到端测试：走完整流程并截图，捕获 JS 错误 */
const puppeteer = require('puppeteer-core');
const path = require('path');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = 'http://127.0.0.1:8765/index.html';
const OUT = path.join(__dirname, 'screenshots');
const fs = require('fs');
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT);

const sleep = ms => new Promise(r => setTimeout(r, ms));
let errors = [];
let step = 0;

async function shot(page, name) {
  await sleep(200);
  await page.screenshot({ path: path.join(OUT, `${++step}_${name}.png`) });
  console.log('  📷 截图:', name);
}

async function tapText(page, text) {
  const clicked = await page.evaluate((t) => {
    const els = [...document.querySelectorAll('[data-action],[role=button],button')];
    const el = els.find(e => e.textContent.trim().includes(t) && !e.disabled);
    if (el) { el.click(); return true; }
    return false;
  }, text);
  if (!clicked) throw new Error('未找到可点击元素: ' + text);
  await sleep(150);
}

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=430,900']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 430, height: 900, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));

  try {
    console.log('\n[A] 首次打开 → 引导设置');
    await page.goto(BASE, { waitUntil: 'networkidle2' });
    // 清空 IndexedDB 和缓存，保证从首次状态开始
    await page.evaluate(async () => {
      if (window.indexedDB.databases) {
        const dbs = await indexedDB.databases();
        dbs.forEach(d => indexedDB.deleteDatabase(d.name));
      } else {
        indexedDB.deleteDatabase('kouqin_storage');
      }
      if (window.caches) (await caches.keys()).forEach(k => caches.delete(k));
    });
    await page.reload({ waitUntil: 'networkidle2' });
    await sleep(600);
    await shot(page, 'setup');
    const hasSetup = await page.$('#setupParent');
    if (!hasSetup) throw new Error('未出现首次设置页');

    await page.type('#setupParent', '8888');
    await page.type('#setupStudent', '1234');
    await tapText(page, '完成设置');
    await sleep(300);
    await shot(page, 'login');

    console.log('\n[B] 学生登录');
    await page.type('#loginPin', '1234');
    await tapText(page, '进入学生端');
    await sleep(400);
    await shot(page, 'student_tasks');
    const taskCount = await page.$$eval('.task-card', els => els.length);
    console.log('  任务卡数量:', taskCount);
    if (taskCount < 5) throw new Error('任务列表不足5个');

    console.log('\n[C] 领取任务并打卡');
    await page.evaluate(() => {
      const btn = [...document.querySelectorAll('[data-action="claim"]')][0];
      btn.click();
    });
    await sleep(300);
    await tapText(page, '去打卡');
    await sleep(300);
    await shot(page, 'student_checkins');
    await page.evaluate(() => document.querySelector('[data-action="open-submit"]').click());
    await sleep(300);
    await shot(page, 'submit_sheet');
    await page.type('#submitNote', '今天认真完成了作业');
    await tapText(page, '确认提交');
    await sleep(300);
    await shot(page, 'student_submitted');

    console.log('\n[D] 切换到家长端');
    await page.evaluate(() => document.querySelector('[data-action="switch-role"]').click());
    await sleep(200);
    await page.evaluate(() => document.querySelector('[data-action="confirm-ok"]').click());
    await sleep(300);
    // 登录页默认学生，切到家长
    await page.evaluate(() => document.querySelector('[data-action="login-role"][data-role="parent"]').click());
    await sleep(200);
    await page.type('#loginPin', '8888');
    await tapText(page, '进入家长端');
    await sleep(400);
    await shot(page, 'parent_review');
    const reviewBtns = await page.$$('[data-action="review-open"]');
    console.log('  待评分数量:', reviewBtns.length);
    if (reviewBtns.length < 1) throw new Error('家长端未看到待评分打卡');

    console.log('\n[E] 评分（完美）');
    await page.evaluate(() => document.querySelector('[data-action="review-open"]').click());
    await sleep(300);
    await shot(page, 'review_sheet');
    await page.type('#reviewNote', '很棒，继续保持！');
    await tapText(page, '确认通过');
    await sleep(300);
    await shot(page, 'parent_after_review');

    console.log('\n[F] 家长端任务管理与兑换比例');
    await page.evaluate(() => document.querySelector('[data-action="parent-tab"][data-tab="tasks"]').click());
    await sleep(300);
    await shot(page, 'parent_tasks');
    await page.evaluate(() => document.querySelector('[data-action="parent-tab"][data-tab="exchange"]').click());
    await sleep(300);
    await shot(page, 'parent_exchange');

    console.log('\n[G] 切回学生端验证积分到账');
    await page.evaluate(() => document.querySelector('[data-action="switch-role"]').click());
    await sleep(200);
    await page.evaluate(() => document.querySelector('[data-action="confirm-ok"]').click());
    await sleep(200);
    await page.type('#loginPin', '1234');
    await tapText(page, '进入学生端');
    await sleep(300);
    await page.evaluate(() => document.querySelector('[data-action="student-tab"][data-tab="points"]').click());
    await sleep(300);
    await shot(page, 'student_points');
    const balance = await page.$eval('.big-num', el => el.textContent.trim());
    console.log('  当前积分:', balance);
    if (balance !== '20') throw new Error('积分未正确到账，期望20，实际' + balance);

    console.log('\n[H] 学生兑换手机时长');
    await page.type('#exPhonePts', '10');
    await page.evaluate(() => document.querySelector('[data-action="do-exchange"][data-kind="phone"]').click());
    await sleep(300);
    await shot(page, 'student_after_exchange');

    console.log('\n[I] 刷新页面验证持久化 + PWA');
    await page.reload({ waitUntil: 'networkidle2' });
    await sleep(500);
    await page.type('#loginPin', '1234');
    await tapText(page, '进入学生端');
    await sleep(300);
    const balance2 = await page.$eval('.points-badge b', el => el.textContent.trim());
    console.log('  刷新后积分:', balance2);
    if (balance2 !== '10') throw new Error('刷新后积分异常，期望10，实际' + balance2);

    console.log('\n[J] 检查主题作用域与安全区');
    const theme = await page.$eval('body', el => el.className);
    console.log('  body 主题:', theme);
    if (!theme.includes('theme-student')) throw new Error('body 学生端主题错误');
    const appTheme = await page.$eval('#app', el => el.className);
    if (appTheme.includes('theme-')) throw new Error('主题 class 不应再挂载在 #app 上');
    // 验证挂在 body 上的弹窗能继承 --primary 等主题变量
    const primaryInSheet = await page.evaluate(() => {
      const m = document.createElement('div'); m.className = 'mask'; m.id = '__testMask';
      m.innerHTML = '<div class="sheet"><button class="btn" id="__testBtn">t</button></div>';
      document.body.appendChild(m);
      const v = getComputedStyle(document.getElementById('__testBtn')).getPropertyValue('--primary').trim();
      m.remove();
      return v;
    });
    console.log('  弹窗内 --primary:', primaryInSheet || '(空)');
    if (!primaryInSheet) throw new Error('弹窗未继承到 --primary 变量');

    await browser.close();
    console.log('\n=== 浏览器测试全部通过 ===');
    if (errors.length) {
      console.log('\n⚠️ 捕获到控制台错误:');
      errors.forEach(e => console.log('  - ' + e));
    } else {
      console.log('✓ 无 JS 控制台错误');
    }
  } catch (e) {
    console.error('\n✗ 测试失败:', e.message);
    if (errors.length) { console.log('控制台错误:'); errors.forEach(x => console.log('  - ' + x)); }
    await page.screenshot({ path: path.join(OUT, 'FAIL.png') }).catch(()=>{});
    await browser.close();
    process.exitCode = 1;
  }
})();
