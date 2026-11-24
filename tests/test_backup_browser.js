/* 浏览器端到端测试：家长端数据备份、恢复、清空密码确认 */
const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = 'http://127.0.0.1:8765/index.html';
const OUT = path.join(__dirname, 'screenshots');
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT);
const sleep = ms => new Promise(r => setTimeout(r, ms));
let errors = [], step = 0;

async function shot(page, name){ await sleep(200); await page.screenshot({path:path.join(OUT,`B${++step}_${name}.png`)}); console.log('  📷',name); }
async function tapText(page,text){
  const ok=await page.evaluate(t=>{const els=[...document.querySelectorAll('[data-action]')];const el=els.find(e=>e.textContent.trim().includes(t)&&!e.disabled);if(el){el.click();return true}return false},text);
  if(!ok)throw new Error('未找到:'+text);await sleep(150);
}
async function loginParent(page,pin){
  await page.evaluate(()=>document.querySelector('[data-action="login-role"][data-role="parent"]').click());
  await sleep(150);
  await page.type('#loginPin',pin);
  await tapText(page,'进入家长端');
  await sleep(300);
}

(async()=>{
  const browser=await puppeteer.launch({executablePath:CHROME,headless:'new',args:['--no-sandbox','--disable-setuid-sandbox']});
  const page=await browser.newPage();
  await page.setViewport({width:430,height:900,isMobile:true,hasTouch:true});
  page.on('console',m=>{if(m.type()==='error')errors.push('console: '+m.text())});
  page.on('pageerror',e=>errors.push('pageerror: '+e.message));
  let backupJson=null;
  try{
    console.log('\n[A] 初始化并登录家长端');
    await page.goto(BASE,{waitUntil:'networkidle2'});
    await page.evaluate(async()=>{indexedDB.deleteDatabase('kouqin_storage');if(window.caches)(await caches.keys()).forEach(k=>caches.delete(k))});
    await page.reload({waitUntil:'networkidle2'});await sleep(500);
    await page.type('#setupParent','8888');await page.type('#setupStudent','1234');
    await tapText(page,'完成设置');await sleep(200);
    await loginParent(page,'8888');
    await page.evaluate(()=>document.querySelector('[data-action="parent-tab"][data-tab="settings"]').click());
    await sleep(300);
    await shot(page,'settings');
    const hasBackup=await page.$('[data-action="backup-data"]');
    if(!hasBackup)throw new Error('设置页缺少备份入口');

    console.log('\n[B] 备份并下载');
    // 拦截 Blob 下载，抓取备份 JSON
    await page.evaluateOnNewDocument(()=>{});
    const client=await page.createCDPSession();
    await client.send('Browser.setDownloadBehavior',{behavior:'allow',downloadPath:path.join(OUT,'downloads')});
    await tapText(page,'备份并下载数据');
    await sleep(500);
    await shot(page,'backup_info');
    const infoText=await page.$eval('.sheet-title',el=>el.textContent);
    if(!infoText.includes('备份已生成'))throw new Error('未出现备份结果弹窗');
    // 直接从 DB 导出备份 JSON（用于后续伪造上传）
    backupJson=await page.evaluate(()=>JSON.stringify(DB.exportBackup()));
    console.log('  备份大小:',backupJson.length,'字符');

    console.log('\n[C] 清空数据 - 密码错误应被拒绝');
    await tapText(page,'知道了');
    await sleep(200);
    await tapText(page,'清空所有数据并重置');
    await sleep(200);
    await shot(page,'reset_pin_prompt');
    await page.type('#confirmPin','wrong');
    await tapText(page,'确认执行');
    await sleep(300);
    const stillHere=await page.$('#confirmPin');
    if(stillHere)console.log('  ✓ 错误密码被拒绝，弹窗仍在');
    else throw new Error('错误密码竟然通过了');
    const toastTxt=await page.$eval('.toast',el=>el.textContent).catch(()=>'');
    console.log('  提示:',toastTxt);

    console.log('\n[D] 恢复数据 - 错误密码被拒绝');
    // 关闭密码弹窗
    await tapText(page,'取消');
    await sleep(200);
    // 先篡改数据：加一条任务
    await page.evaluate(()=>document.querySelector('[data-action="parent-tab"][data-tab="tasks"]').click());
    await sleep(200);
    await page.evaluate(()=>document.querySelector('[data-action="task-form"]').click());
    await sleep(200);
    await page.type('#tkName','临时测试任务');
    await tapText(page,'保存');
    await sleep(200);
    const before=await page.evaluate(()=>DB.getTasks().length);
    console.log('  篡改后任务数:',before);
    // 回到设置页
    await page.evaluate(()=>document.querySelector('[data-action="parent-tab"][data-tab="settings"]').click());
    await sleep(200);
    // Hook file input 的 click：自动注入备份文件并触发 change（模拟用户选文件）
    await page.evaluate((json)=>{
      const origClick=HTMLInputElement.prototype.click;
      HTMLInputElement.prototype.click=function(){
        if(this.type==='file'){
          const file=new File([json],'backup.json',{type:'application/json'});
          const dt=new DataTransfer();dt.items.add(file);this.files=dt.files;
          this.dispatchEvent(new Event('change'));
          return;
        }
        return origClick.call(this);
      };
    },backupJson);
    await tapText(page,'从备份文件恢复');
    await sleep(700);
    const pinShown=await page.$('#confirmPin');
    if(!pinShown)throw new Error('恢复流程未出现密码确认弹窗');
    await shot(page,'restore_pin_prompt');
    // 错误密码
    await page.type('#confirmPin','bad');
    await tapText(page,'确认执行');
    await sleep(300);
    const afterWrong=await page.evaluate(()=>DB.getTasks().length);
    if(afterWrong!==before)throw new Error('错误密码下数据被改了');
    console.log('  ✓ 错误密码未恢复数据，任务数仍为',afterWrong);

    console.log('\n[E] 恢复数据 - 正确密码执行');
    await page.type('#confirmPin','8888');
    await tapText(page,'确认执行');
    // 恢复成功后页面会 reload，需重新登录
    await sleep(1200);
    await page.waitForSelector('#loginPin',{timeout:5000});
    await loginParent(page,'8888'); // 恢复的备份里家长密码是 8888
    await page.evaluate(()=>document.querySelector('[data-action="parent-tab"][data-tab="tasks"]').click());
    await sleep(300);
    const after=await page.evaluate(()=>DB.getTasks().length);
    console.log('  恢复后任务数:',after);
    // 备份时有5个任务，篡改后6个，恢复应回到5
    if(after!==5)throw new Error('恢复后任务数异常，期望5，实际'+after);

    console.log('\n[F] 清空数据 - 正确密码执行');
    await page.evaluate(()=>document.querySelector('[data-action="parent-tab"][data-tab="settings"]').click());
    await sleep(200);
    await tapText(page,'清空所有数据并重置');
    await sleep(200);
    await page.type('#confirmPin','8888');
    await tapText(page,'确认执行');
    await sleep(800);
    // 清空后应回到引导设置页
    const setup=await page.$('#setupParent');
    if(!setup)throw new Error('清空后未回到引导设置页');
    console.log('  ✓ 清空后回到首次设置页');
    await shot(page,'after_reset');

    await browser.close();
    console.log('\n=== 备份/恢复/密码确认 浏览器测试全部通过 ===');
    if(errors.length){console.log('⚠️ 控制台错误:');errors.forEach(e=>console.log('  - '+e))}
    else console.log('✓ 无 JS 控制台错误');
  }catch(e){
    console.error('\n✗ 测试失败:',e.message);
    if(errors.length){console.log('控制台错误:');errors.forEach(x=>console.log('  - '+x))}
    await page.screenshot({path:path.join(OUT,'B_FAIL.png')}).catch(()=>{});
    await browser.close();process.exitCode=1;
  }
})();
