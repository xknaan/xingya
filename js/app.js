/* ============================================================
   星芽打卡 · 应用主逻辑
   ============================================================ */
const S = {
  role: null,          // 'student' | 'parent'
  loginRole: 'student',
  stuTab: 'tasks',
  parTab: 'review',
  recordTab: 'points',
  exTab: 'exchange',
  pendingPhoto: '',
  pendingRestore: null,
  ready: false
};
const $app = document.getElementById('app');

/* ---------- 工具 ---------- */
function h(s){return String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function fmtTime(iso){
  if(!iso) return '-';
  const d=new Date(iso);
  const p=n=>String(n).padStart(2,'0');
  return `${d.getMonth()+1}/${d.getDate()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
function durText(min){return min>=60?`${Math.floor(min/60)}小时${min%60?min%60+'分':''}`:`${min}分钟`}
function toast(msg){
  const t=document.createElement('div');t.className='toast';t.textContent=msg;
  document.body.appendChild(t);setTimeout(()=>t.remove(),2200);
}
function closeSheet(){const m=document.getElementById('sheetMask');if(m)m.remove()}
function openSheet(inner){
  closeSheet();
  const m=document.createElement('div');m.className='mask';m.id='sheetMask';
  m.innerHTML=`<div class="sheet">${inner}</div>`;
  m.addEventListener('click',e=>{if(e.target===m)closeSheet()});
  document.body.appendChild(m);
}
function openConfirm(title,msg,onOk){
  closeSheet();
  const m=document.createElement('div');m.className='mask fade';m.id='sheetMask';
  m.innerHTML=`<div class="dialog"><div class="sheet-title">${h(title)}</div>
    <div class="note" style="margin-bottom:18px">${h(msg)}</div>
    <div class="btn-row"><button class="btn ghost" data-action="close-sheet">取消</button>
    <button class="btn danger" data-action="confirm-ok">确定</button></div></div>`;
  m._onOk=onOk;
  document.body.appendChild(m);
}
function gradeText(g){return {perfect:'完美',done:'完成',normal:'一般'}[g]||'-'}
function statusText(s){return {claimed:'已领取',submitted:'待确认',confirmed:'已通过',rejected:'未通过',pending:'待确认消费',cancelled:'已取消'}[s]||s}

/* ---------- 图片压缩 ---------- */
function pickPhoto(cb){
  const inp=document.createElement('input');inp.type='file';inp.accept='image/*';
  inp.style.display='none';document.body.appendChild(inp);
  inp.addEventListener('change',()=>{
    const f=inp.files[0];if(!f){inp.remove();return}
    const img=new Image();
    const rd=new FileReader();
    rd.onload=()=>{
      img.onload=()=>{
        const MAX=1080;let w=img.width,hh=img.height;
        if(w>MAX||hh>MAX){const r=Math.min(MAX/w,MAX/hh);w=Math.round(w*r);hh=Math.round(hh*r)}
        const c=document.getElementById('compressCanvas');c.width=w;c.height=hh;
        c.getContext('2d').drawImage(img,0,0,w,hh);
        cb(c.toDataURL('image/jpeg',0.72));inp.remove();
      };
      img.src=rd.result;
    };
    rd.readAsDataURL(f);
  });
  inp.click();
}

/* ============================================================
   渲染入口
   ============================================================ */
function render(){
  if(!S.ready){renderLoading();return}
  if(!S.role){ renderAuth(); return }
  if(S.role==='student') renderStudent(); else renderParent();
}
function renderLoading(){
  $app.className='theme-student';
  $app.innerHTML=`<div class="loading"><div class="spinner"></div><div class="sub">正在准备你的成长空间…</div></div>`;
}
function setTheme(role){ $app.className='theme-'+(role==='student'?'student':'parent'); }

/* ---------- 引导设置 ---------- */
function renderAuth(){
  const first=!DB.hasPin('parent') && !DB.hasPin('student');
  first ? renderSetup() : renderLogin();
}
function renderSetup(){
  setTheme('parent');
  $app.innerHTML=`<div class="auth">
    <div class="logo">🌱</div>
    <div class="brand">星芽打卡</div>
    <div class="slogan">每一步努力，都值得被看见</div>
    <div class="auth-card">
      <div class="sheet-title">首次使用 · 设置密码</div>
      <div class="note" style="margin-bottom:16px">请分别设置 <b>家长</b> 与 <b>学生</b> 的进入密码，用于区分权限。请牢记，忘记密码可在家长端重置。</div>
      <div class="field"><label>👨‍👩‍👧 家长密码（管理员）</label><input class="input" id="setupParent" type="password" inputmode="numeric" placeholder="设置家长密码"></div>
      <div class="field"><label>🧒 学生密码</label><input class="input" id="setupStudent" type="password" inputmode="numeric" placeholder="设置学生密码"></div>
      <button class="btn block mt8" data-action="setup-save">完成设置，开始使用</button>
    </div>
  </div>`;
}
function renderLogin(){
  setTheme(S.loginRole);
  const r=S.loginRole;
  $app.innerHTML=`<div class="auth">
    <div class="logo">🌱</div>
    <div class="brand">星芽打卡</div>
    <div class="slogan">日常打卡 · 积累积分 · 兑换成长</div>
    <div class="auth-card">
      <div class="role-switch">
        <div class="role-btn ${r==='student'?'on':''}" data-action="login-role" data-role="student"><span class="em">🧒</span>学生</div>
        <div class="role-btn ${r==='parent'?'on':''}" data-action="login-role" data-role="parent"><span class="em">👨‍👩‍👧</span>家长</div>
      </div>
      <div class="field"><label>${r==='student'?'学生':'家长'}密码</label><input class="input" id="loginPin" type="password" inputmode="numeric" placeholder="请输入密码"></div>
      <button class="btn block mt8" data-action="login-submit">进入${r==='student'?'学生':'家长'}端</button>
    </div>
  </div>`;
}

/* ============================================================
   学生端
   ============================================================ */
function renderStudent(){
  setTheme('student');
  const bal=DB.getBalance();
  let body='';
  if(S.stuTab==='tasks') body=stuTasks();
  else if(S.stuTab==='checkins') body=stuCheckins();
  else if(S.stuTab==='points') body=stuPoints(bal);
  else body=stuRecords();
  $app.innerHTML=`<div class="screen">
    <div class="header"><div class="header-row">
      <div><div class="hello"> Hi，小朋友 👋</div><div class="title">今天也要加油呀</div></div>
      <div style="text-align:right">
        <div class="points-badge">⭐ <b>${bal}</b> 分</div>
        <button class="switch-link" data-action="switch-role">🔄 家长入口</button>
      </div>
    </div></div>
    <div class="section">${body}</div>
    ${tabbar('student')}
  </div>`;
}
function tabsDef(role){
  return role==='student'
    ? [['tasks','📋','任务'],['checkins','✅','打卡'],['points','⭐','积分'],['records','📜','记录']]
    : [['review','🔔','待审'],['tasks','📋','任务'],['exchange','💱','兑换'],['settings','⚙️','设置']];
}
function tabbar(role){
  const cur=role==='student'?S.stuTab:S.parTab;
  return `<div class="tabbar">${tabsDef(role).map(([k,ic,label])=>
    `<button class="${cur===k?'on':''}" data-action="${role}-tab" data-tab="${k}"><span class="ic">${ic}</span>${label}</button>`
  ).join('')}</div>`;
}
function stuTasks(){
  const tasks=DB.getTasks();
  if(!tasks.length) return `<div class="card"><div class="empty"><span class="em">📭</span>暂时没有任务，等家长发布吧</div></div>`;
  const groups=[['daily','🌞 日常任务'],['temp','⚡ 临时任务']];
  return groups.map(([type,label])=>{
    const list=tasks.filter(t=>t.type===type);
    if(!list.length) return '';
    return `<div class="card-title" style="padding:6px 4px 0">${label}</div>`+list.map(t=>{
      const busy=DB._one("SELECT status FROM checkins WHERE task_id=? AND status IN ('claimed','submitted') ORDER BY id DESC LIMIT 1",[t.id]);
      let btn;
      if(!busy) btn=`<button class="btn sm" data-action="claim" data-id="${t.id}">领取任务</button>`;
      else if(busy.status==='claimed') btn=`<button class="btn sm ghost" data-action="goto-checkins">去打卡</button>`;
      else btn=`<span class="chip s-submitted">待家长确认</span>`;
      return `<div class="card task-card">
        <div class="between"><div class="task-name">${h(t.name)}</div><span class="chip ${type}">${type==='daily'?'日常':'临时'}</span></div>
        <div class="sub" style="margin-top:3px">${h(t.description)||'暂无描述'}</div>
        <div class="meta"><span class="meta-pill">⭐ ${t.points} 分</span><span class="meta-pill">⏱ ${durText(t.duration)}</span>
          ${t.need_photo?'<span class="meta-pill">📷 需照片</span>':''}</div>
        <div class="between">${btn}</div>
      </div>`;
    }).join('');
  }).join('');
}
function stuCheckins(){
  const list=DB.getCheckins();
  if(!list.length) return `<div class="card"><div class="empty"><span class="em">📝</span>还没有打卡记录<br><span class="sub">领取任务后即可打卡</span></div></div>`;
  return list.map(c=>{
    let action='';
    if(c.status==='claimed') action=`<button class="btn sm block mt8" data-action="open-submit" data-id="${c.id}">确定打卡</button>`;
    else if(c.status==='submitted') action=`<div class="note mt8">⏳ 已提交，等待家长确认</div>`;
    else if(c.status==='confirmed') action=`<div class="note mt8">🎉 已通过，获得 <b class="plus">+${c.awarded}</b> 积分${c.reviewer_note?' · '+h(c.reviewer_note):''}</div>`;
    else action=`<div class="note mt8">💬 未通过${c.reviewer_note?'：'+h(c.reviewer_note):''}</div>`;
    return `<div class="card task-card">
      <div class="between"><div class="task-name">${h(c.task_name)}</div><span class="chip s-${c.status}">${statusText(c.status)}</span></div>
      <div class="sub" style="margin-top:3px">领取 ${fmtTime(c.claimed_at)}${c.submitted_at?' · 提交 '+fmtTime(c.submitted_at):''}</div>
      <div class="meta"><span class="meta-pill">⭐ ${c.task_points} 分</span>${c.grade?`<span class="meta-pill g-${c.grade}">${gradeText(c.grade)}</span>`:''}</div>
      ${c.photo?`<img class="photo-thumb" src="${c.photo}" data-action="view-photo" data-src="${c.photo}">`:''}
      ${action}
    </div>`;
  }).join('');
}
function stuPoints(bal){
  const rates=DB.getRates();
  const exs=DB.getExchanges().slice(0,5);
  return `<div class="card center" style="background:var(--grad-soft)">
      <div class="sub">当前可用积分</div>
      <div class="big-num">${bal}</div>
      <div class="sub mt8">可兑换 <b>${(bal/rates.phone).toFixed(1)}</b> 分钟手机时间 或 <b>${(bal/rates.money).toFixed(2)}</b> 元零花钱</div>
    </div>
    <div class="card">
      <div class="card-title"><span class="bar"></span>积分兑换</div>
      <div class="field"><label>📱 兑换玩手机时长 <span class="sub">(${rates.phone}分=1分钟)</span></label>
        <div class="row"><input class="input" id="exPhonePts" type="number" min="1" placeholder="输入积分" oninput="updatePreview('phone')">
          <button class="btn sm" data-action="do-exchange" data-kind="phone">兑换</button></div>
        <div class="sub mt8" id="prePhone">≈ 0 分钟</div></div>
      <div class="divider"></div>
      <div class="field" style="margin-bottom:0"><label>💰 兑换零花钱 <span class="sub">(${rates.money}分=1元)</span></label>
        <div class="row"><input class="input" id="exMoneyPts" type="number" min="1" placeholder="输入积分" oninput="updatePreview('money')">
          <button class="btn sm" data-action="do-exchange" data-kind="money">兑换</button></div>
        <div class="sub mt8" id="preMoney">≈ 0.00 元</div></div>
    </div>
    <div class="card">
      <div class="card-title"><span class="bar"></span>最近兑换</div>
      ${exs.length?exs.map(e=>`<div class="record-item between">
        <div><span class="chip k-${e.kind}">${e.kind==='phone'?'手机时长':'零花钱'}</span>
          <div class="sub mt8">${fmtTime(e.created_at)} · ${e.points}积分</div></div>
        <div style="text-align:right"><b>${e.kind==='phone'?e.amount.toFixed(0)+'分钟':'¥'+e.amount.toFixed(2)}</b>
          <div><span class="chip s-${e.status}">${statusText(e.status)}</span></div></div>
      </div>`).join(''):'<div class="sub center" style="padding:12px">暂无兑换记录</div>'}
    </div>`;
}
function stuRecords(){
  const ledger=DB.getLedger();
  const cons=DB.getConsumptions();
  let body='';
  if(S.recordTab==='points'){
    body=ledger.length?ledger.map(l=>`<div class="record-item between">
      <div><div style="font-weight:600">${h(l.reason)}</div><div class="sub">${fmtTime(l.created_at)}</div></div>
      <div class="${l.delta>=0?'plus':'minus'}">${l.delta>=0?'+':''}${l.delta}</div></div>`).join('')
      :'<div class="sub center" style="padding:16px">暂无积分明细</div>';
  }else{
    body=cons.length?cons.map(c=>`<div class="record-item between">
      <div><span class="chip k-${c.kind}">${c.kind==='phone'?'手机时长':'零花钱'}</span>
        <div class="sub mt8">${fmtTime(c.created_at)}${c.note?' · '+h(c.note):''}</div></div>
      <div><b>${c.kind==='phone'?c.amount.toFixed(0)+'分钟':'¥'+c.amount.toFixed(2)}</b></div></div>`).join('')
      :'<div class="sub center" style="padding:16px">暂无消费记录</div>';
  }
  return `<div class="seg" style="margin-bottom:12px">
      <button class="${S.recordTab==='points'?'on':''}" data-action="record-tab" data-sub="points">积分明细</button>
      <button class="${S.recordTab==='consume'?'on':''}" data-action="record-tab" data-sub="consume">消费记录</button>
    </div>
    <div class="card">${body}</div>`;
}
function updatePreview(kind){
  const rates=DB.getRates();
  if(kind==='phone'){
    const p=Number(document.getElementById('exPhonePts')?.value)||0;
    const el=document.getElementById('prePhone');if(el)el.textContent=`≈ ${(p/rates.phone).toFixed(1)} 分钟`;
  }else{
    const p=Number(document.getElementById('exMoneyPts')?.value)||0;
    const el=document.getElementById('preMoney');if(el)el.textContent=`≈ ¥${(p/rates.money).toFixed(2)}`;
  }
}

/* ============================================================
   家长端
   ============================================================ */
function renderParent(){
  setTheme('parent');
  let body='';
  if(S.parTab==='review') body=parReview();
  else if(S.parTab==='tasks') body=parTasks();
  else if(S.parTab==='exchange') body=parExchange();
  else body=parSettings();
  const pend=DB.getCheckins('submitted').length+DB.getExchanges().filter(e=>e.status==='pending').length;
  $app.innerHTML=`<div class="screen">
    <div class="header"><div class="header-row">
      <div><div class="hello">家长中心 · 管理员</div><div class="title">成长看板 ${pend?`<span class="chip" style="vertical-align:middle">${pend} 项待处理</span>`:''}</div></div>
      <button class="points-badge" data-action="switch-role" title="切换角色">🔄 切换</button>
    </div></div>
    <div class="section">${body}</div>
    ${tabbar('parent')}
  </div>`;
}
function parReview(){
  const subs=DB.getCheckins('submitted');
  const pends=DB.getExchanges().filter(e=>e.status==='pending');
  const recent=DB.getCheckins().filter(c=>c.status==='confirmed').slice(0,3);
  let html=`<div class="card">
    <div class="card-title"><span class="bar"></span>待评分打卡 <span class="chip">${subs.length}</span></div>`;
  html+=subs.length?subs.map(c=>{
    const mins=c.submitted_at&&c.claimed_at?Math.max(0,Math.round((new Date(c.submitted_at)-new Date(c.claimed_at))/60000)):0;
    const over=mins>c.task_duration;
    return `<div class="card task-card" style="box-shadow:none;border:1px solid var(--line)">
      <div class="between"><div class="task-name">${h(c.task_name)}</div><span class="chip s-submitted">待评分</span></div>
      <div class="sub mt8">领取 ${fmtTime(c.claimed_at)} · 提交 ${fmtTime(c.submitted_at)} · 耗时约 ${mins} 分钟${over?' ⚠️超时':''}</div>
      ${c.photo?`<img class="photo-thumb mt8" src="${c.photo}" data-action="view-photo" data-src="${c.photo}">`:'<div class="sub mt8">📷 未上传佐证照片</div>'}
      ${c._note?'':''}
      <button class="btn sm block mt8" data-action="review-open" data-id="${c.id}">查看并评分</button>
    </div>`;
  }).join(''):'<div class="sub center" style="padding:12px">暂无待评分打卡</div>';
  html+=`</div><div class="card">
    <div class="card-title"><span class="bar"></span>待确认兑换 <span class="chip">${pends.length}</span></div>`;
  html+=pends.length?pends.map(e=>`<div class="card task-card" style="box-shadow:none;border:1px solid var(--line)">
    <div class="between"><div class="task-name">${e.kind==='phone'?'📱 手机时长':'💰 零花钱'}</div><span class="chip s-pending">待确认</span></div>
    <div class="sub mt8">${e.points} 积分 → <b>${e.kind==='phone'?e.amount.toFixed(0)+' 分钟':'¥'+e.amount.toFixed(2)}</b> · ${fmtTime(e.created_at)}</div>
    <div class="btn-row mt8"><button class="btn sm ok" data-action="confirm-ex" data-id="${e.id}">确认已消费</button>
      <button class="btn sm ghost" data-action="reject-ex" data-id="${e.id}">驳回退还</button></div>
  </div>`).join(''):'<div class="sub center" style="padding:12px">暂无待确认兑换</div>';
  html+=`</div>`;
  if(recent.length) html+=`<div class="card"><div class="card-title"><span class="bar"></span>最近通过</div>${recent.map(c=>
    `<div class="record-item between"><div>${h(c.task_name)}<div class="sub">${fmtTime(c.reviewed_at)}</div></div>
     <div style="text-align:right"><span class="chip g-${c.grade}">${gradeText(c.grade)}</span><div class="plus mt8">+${c.awarded}</div></div></div>`).join('')}</div>`;
  return html;
}
function parTasks(){
  const tasks=DB.getTasks();
  const groups=[['daily','🌞 日常任务'],['temp','⚡ 临时任务']];
  let html=`<button class="btn block" data-action="task-form">＋ 发布新任务</button><div class="mt12"></div>`;
  if(!tasks.length) return html+`<div class="card"><div class="empty"><span class="em">📭</span>暂无任务</div></div>`;
  html+=groups.map(([type,label])=>{
    const list=tasks.filter(t=>t.type===type);if(!list.length)return '';
    return `<div class="card-title" style="padding:6px 4px 0">${label}</div>`+list.map(t=>`<div class="card task-card">
      <div class="between"><div class="task-name">${h(t.name)}</div><span class="chip ${type}">${type==='daily'?'日常':'临时'}</span></div>
      <div class="sub mt8">${h(t.description)||'暂无描述'}</div>
      <div class="meta"><span class="meta-pill">⭐ ${t.points}分</span><span class="meta-pill">⏱ ${durText(t.duration)}</span>
        ${t.need_photo?'<span class="meta-pill">📷 需照片</span>':''}</div>
      <div class="btn-row"><button class="btn sm ghost" data-action="task-form" data-id="${t.id}">编辑</button>
        <button class="btn sm outline" data-action="task-del" data-id="${t.id}">删除</button></div>
    </div>`).join('');
  }).join('');
  return html;
}
function parExchange(){
  const rates=DB.getRates();
  const exs=DB.getExchanges();
  const cons=DB.getConsumptions();
  return `<div class="card">
      <div class="card-title"><span class="bar"></span>兑换比例</div>
      <div class="note" style="margin-bottom:12px">比例可随时调整；调整后学生端立即按新比例兑换。</div>
      <div class="rate-box"><span class="grow">每 <b id="ratePhoneLabel">${rates.phone}</b> 积分 = 1 分钟手机</span>
        <button class="btn sm ghost" data-action="rate-edit" data-kind="phone">修改</button></div>
      <div class="rate-box"><span class="grow">每 <b id="rateMoneyLabel">${rates.money}</b> 积分 = 1 元零花钱</span>
        <button class="btn sm ghost" data-action="rate-edit" data-kind="money">修改</button></div>
    </div>
    <div class="card"><div class="card-title"><span class="bar"></span>兑换记录 <span class="chip">${exs.length}</span></div>
      ${exs.length?exs.map(e=>`<div class="record-item between">
        <div><span class="chip k-${e.kind}">${e.kind==='phone'?'手机时长':'零花钱'}</span>
          <div class="sub mt8">${e.points}分 · ${fmtTime(e.created_at)}</div></div>
        <div style="text-align:right"><b>${e.kind==='phone'?e.amount.toFixed(0)+'分钟':'¥'+e.amount.toFixed(2)}</b>
          <div class="chip s-${e.status}">${statusText(e.status)}</div></div></div>`).join(''):'<div class="sub center" style="padding:12px">暂无兑换记录</div>'}
    </div>
    <div class="card"><div class="card-title"><span class="bar"></span>消费记录 <span class="chip">${cons.length}</span></div>
      ${cons.length?cons.map(c=>`<div class="record-item between">
        <div><span class="chip k-${c.kind}">${c.kind==='phone'?'手机时长':'零花钱'}</span>
          <div class="sub mt8">${fmtTime(c.created_at)}${c.note?' · '+h(c.note):''}</div></div>
        <b>${c.kind==='phone'?c.amount.toFixed(0)+'分钟':'¥'+c.amount.toFixed(2)}</b></div>`).join(''):'<div class="sub center" style="padding:12px">暂无消费记录</div>'}
    </div>`;
}
function parSettings(){
  const bal=DB.getBalance();
  return `<div class="card">
      <div class="card-title"><span class="bar"></span>数据概览</div>
      <div class="stat-grid">
        <div class="s"><b>${bal}</b><span>当前积分</span></div>
        <div class="s"><b>${DB.getCheckins('confirmed').length}</b><span>通过打卡</span></div>
        <div class="s"><b>${DB.getConsumptions().length}</b><span>已消费</span></div>
      </div>
    </div>
    <div class="card">
      <div class="card-title"><span class="bar"></span>密码管理</div>
      <button class="btn ghost block" data-action="pin-form" data-role="parent" style="margin-bottom:10px">修改家长密码</button>
      <button class="btn ghost block" data-action="pin-form" data-role="student">修改学生密码</button>
    </div>
    <div class="card">
      <div class="card-title"><span class="bar"></span>数据备份与恢复</div>
      <div class="note" style="margin-bottom:12px">数据仅存于本设备。建议定期备份，备份文件可下载保存到手机，换机或误删后可用于恢复。</div>
      <button class="btn ghost block" data-action="backup-data" style="margin-bottom:10px">⬇️ 备份并下载数据</button>
      <button class="btn outline block" data-action="restore-data">⬆️ 从备份文件恢复</button>
    </div>
    <div class="card">
      <div class="card-title"><span class="bar"></span>其他</div>
      <button class="btn outline block" data-action="switch-role" style="margin-bottom:10px">🔄 切换到学生端</button>
      <button class="btn danger block" data-action="reset-data">⚠️ 清空所有数据并重置</button>
      <div class="note mt12">提示：恢复与清空均为高危操作，需输入家长密码确认，防止误操作。</div>
    </div>`;
}

/* ============================================================
   表单 / 弹窗
   ============================================================ */
function openSubmitForm(id){
  const c=DB._one('SELECT * FROM checkins WHERE id=?',[id]);if(!c)return;
  S.pendingPhoto='';
  openSheet(`<div class="sheet-title">确定打卡</div>
    <div class="note" style="margin-bottom:14px">任务：<b>${h(c.task_name)}</b> · ${c.need_photo?'需上传佐证照片':'如实完成即可'}</div>
    <div class="field"><label>完成说明（选填）</label><textarea class="input" id="submitNote" placeholder="说说你完成了什么…"></textarea></div>
    <div class="field"><label>佐证照片 ${c.need_photo?'<span style="color:var(--danger)">*必填</span>':'（选填）'}</label>
      <button class="btn ghost block" data-action="pick-photo">📷 拍照 / 从相册选择</button>
      <div id="photoPreview" class="mt8"></div></div>
    <div class="btn-row"><button class="btn ghost" data-action="close-sheet">取消</button>
      <button class="btn" data-action="do-submit" data-id="${id}">确认提交</button></div>`);
}
function renderPhotoPreview(){
  const box=document.getElementById('photoPreview');if(!box)return;
  box.innerHTML=S.pendingPhoto?`<img class="photo-thumb" src="${S.pendingPhoto}"> <button class="btn sm ghost" data-action="remove-photo">移除</button>`:'';
}
function openReviewForm(id){
  const c=DB._one('SELECT * FROM checkins WHERE id=?',[id]);if(!c)return;
  const calc=g=>Math.round(c.task_points*({perfect:1,done:.75,normal:.5}[g]));
  openSheet(`<div class="sheet-title">评分 · ${h(c.task_name)}</div>
    ${c.photo?`<div class="center mt8"><img src="${c.photo}" style="max-height:180px;border-radius:12px"></div>`:''}
    <div class="note mt12">任务分值 <b>${c.task_points}</b> 分 · ${fmtTime(c.submitted_at)} 提交${c.claimed_at?' · 耗时约'+Math.max(0,Math.round((new Date(c.submitted_at)-new Date(c.claimed_at))/60000))+'分钟':''}</div>
    <div class="field mt12"><label>完成情况</label>
      <div class="seg" data-seg="grade">
        <button class="on" data-action="seg" data-val="perfect" data-gseg="grade">完美 +${calc('perfect')}</button>
        <button data-action="seg" data-val="done" data-gseg="grade">完成 +${calc('done')}</button>
        <button data-action="seg" data-val="normal" data-gseg="grade">一般 +${calc('normal')}</button>
      </div></div>
    <div class="field"><label>评语（选填）</label><input class="input" id="reviewNote" placeholder="给孩子的鼓励或建议"></div>
    <button class="btn block" data-action="do-review" data-id="${id}" data-pass="1">确认通过</button>
    <button class="btn ghost block mt8" data-action="do-review" data-id="${id}" data-pass="0">判定未通过</button>`);
}
function openTaskForm(id){
  const t=id?DB.getTask(id):null;
  openSheet(`<div class="sheet-title">${t?'编辑':'发布'}任务</div>
    <div class="field"><label>任务类型</label>
      <div class="seg" data-seg="type">
        <button class="${(!t||t.type==='daily')?'on':''}" data-action="seg" data-val="daily" data-gseg="type">日常任务</button>
        <button class="${t&&t.type==='temp'?'on':''}" data-action="seg" data-val="temp" data-gseg="type">临时任务</button>
      </div></div>
    <div class="field"><label>任务名称</label><input class="input" id="tkName" value="${h(t?t.name:'')}" placeholder="如：整理书桌"></div>
    <div class="field"><label>任务描述</label><textarea class="input" id="tkDesc" placeholder="具体要求…">${h(t?t.description:'')}</textarea></div>
    <div class="field"><label>积分分值</label><input class="input" id="tkPoints" type="number" min="1" value="${t?t.points:15}"></div>
    <div class="field"><label>预计完成时长（分钟）</label><input class="input" id="tkDur" type="number" min="1" value="${t?t.duration:30}"></div>
    <div class="field"><label>是否需要佐证照片</label>
      <div class="seg" data-seg="photo">
        <button class="${(!t||!t.need_photo)?'on':''}" data-action="seg" data-val="0" data-gseg="photo">不需要</button>
        <button class="${t&&t.need_photo?'on':''}" data-action="seg" data-val="1" data-gseg="photo">需要</button>
      </div></div>
    <div class="btn-row"><button class="btn ghost" data-action="close-sheet">取消</button>
      <button class="btn" data-action="save-task" data-id="${id||''}">保存</button></div>`);
}
function openRateForm(kind){
  const rates=DB.getRates();const cur=kind==='phone'?rates.phone:rates.money;
  openSheet(`<div class="sheet-title">修改兑换比例</div>
    <div class="note" style="margin-bottom:14px">设置每多少积分可兑换 ${kind==='phone'?'1 分钟手机时间':'1 元零花钱'}。</div>
    <div class="field"><label>${kind==='phone'?'每 ___ 积分 = 1 分钟':'每 ___ 积分 = 1 元'}</label>
      <input class="input" id="rateVal" type="number" min="1" value="${cur}"></div>
    <div class="btn-row"><button class="btn ghost" data-action="close-sheet">取消</button>
      <button class="btn" data-action="save-rate" data-kind="${kind}">保存</button></div>`);
}
function openPinForm(role){
  openSheet(`<div class="sheet-title">修改${role==='parent'?'家长':'学生'}密码</div>
    <div class="field"><label>新密码</label><input class="input" id="newPin" type="password" inputmode="numeric" placeholder="输入新密码"></div>
    <div class="field"><label>再次输入</label><input class="input" id="newPin2" type="password" inputmode="numeric" placeholder="确认新密码"></div>
    <div class="btn-row"><button class="btn ghost" data-action="close-sheet">取消</button>
      <button class="btn" data-action="save-pin" data-role="${role}">保存</button></div>`);
}

/* 密码二次确认弹窗：验证家长密码后才执行敏感操作 */
function openPinConfirm(title, msg, onOk){
  openSheet(`<div class="sheet-title">${h(title)}</div>
    <div class="note" style="margin-bottom:14px">${h(msg)}</div>
    <div class="field"><label>请输入家长密码以确认</label>
      <input class="input" id="confirmPin" type="password" inputmode="numeric" placeholder="家长密码"></div>
    <div class="btn-row"><button class="btn ghost" data-action="close-sheet">取消</button>
      <button class="btn danger" data-action="pin-confirm-ok">确认执行</button></div>`);
  const m=document.getElementById('sheetMask');
  if(m) m._onOk=onOk;
}
function openBackupInfo(data){
  const s=data.stats;
  openSheet(`<div class="sheet-title">✅ 备份已生成</div>
    <div class="note" style="margin-bottom:12px">备份文件已开始下载，请到手机的「下载」目录查收并妥善保存。</div>
    <div class="card task-card" style="box-shadow:none;border:1px solid var(--line);margin-bottom:14px">
      <div class="record-item between"><span class="sub">备份时间</span><b>${fmtTime(data.exportedAt)}</b></div>
      <div class="record-item between"><span class="sub">当前积分</span><b>${data.balance} 分</b></div>
      <div class="record-item between"><span class="sub">任务 / 打卡</span><b>${s.tasks} / ${s.checkins}</b></div>
      <div class="record-item between"><span class="sub">积分明细 / 兑换 / 消费</span><b>${s.ledger} / ${s.exchanges} / ${s.consumptions}</b></div>
    </div>
    <button class="btn block" data-action="close-sheet">知道了</button>`);
}

/* ============================================================
   事件委托
   ============================================================ */
document.addEventListener('click',async e=>{
  const el=e.target.closest('[data-action]');if(!el)return;
  const a=el.dataset.action,id=Number(el.dataset.id);
  switch(a){
    /* 引导 / 登录 */
    case 'setup-save':{
      const p=document.getElementById('setupParent').value.trim();
      const s=document.getElementById('setupStudent').value.trim();
      if(!p||!s){toast('请设置两个密码');return}
      if(p.length<3||s.length<3){toast('密码至少 3 位');return}
      DB.setPin('parent',p);DB.setPin('student',s);
      S.loginRole='student';render();toast('设置完成，请用学生密码登录');break;
    }
    case 'login-role': S.loginRole=el.dataset.role;renderLogin();break;
    case 'login-submit':{
      const pin=document.getElementById('loginPin').value.trim();
      if(!pin){toast('请输入密码');return}
      if(DB.verifyPin(S.loginRole,pin)){S.role=S.loginRole;S.stuTab='tasks';S.parTab='review';render()}
      else toast('密码不正确');break;
    }
    case 'switch-role':
      openConfirm('切换角色','切换后需要输入对应角色的密码，确定继续？',()=>{S.role=null;S.loginRole='student';render()});break;
    case 'student-tab': S.stuTab=el.dataset.tab;render();break;
    case 'parent-tab': S.parTab=el.dataset.tab;render();break;
    case 'record-tab': S.recordTab=el.dataset.sub;render();break;

    /* 学生 */
    case 'claim':{
      const r=DB.claimTask(id);toast(r.msg||'领取成功，请尽快完成打卡');render();break;
    }
    case 'goto-checkins': S.stuTab='checkins';render();break;
    case 'open-submit': openSubmitForm(id);break;
    case 'pick-photo':{
      const r=await Native.takePhoto();
      if(r.ok){S.pendingPhoto=r.data;renderPhotoPreview()}
      else if(!r.canceled)toast('拍照失败，请重试');
      break;
    }
    case 'remove-photo': S.pendingPhoto='';renderPhotoPreview();break;
    case 'do-submit':{
      const c=DB._one('SELECT * FROM checkins WHERE id=?',[id]);
      if(c.need_photo&&!S.pendingPhoto){toast('请上传佐证照片');return}
      DB.submitCheckin(id,S.pendingPhoto);closeSheet();toast('打卡已提交，等待家长确认');render();break;
    }
    case 'do-exchange':{
      const kind=el.dataset.kind;
      const inp=document.getElementById(kind==='phone'?'exPhonePts':'exMoneyPts');
      const pts=Number(inp?.value)||0;
      const r=DB.addExchange(kind,pts);
      if(!r.ok){toast(r.msg);return}
      toast('兑换申请已提交，等待家长确认');render();break;
    }
    case 'view-photo':{
      const src=el.dataset.src;
      const m=document.createElement('div');m.className='mask fade';m.id='sheetMask';
      m.innerHTML=`<div class="dialog" style="text-align:center"><img src="${src}" style="max-width:100%;max-height:70vh;border-radius:12px"><div class="btn-row mt12"><button class="btn block" data-action="close-sheet">关闭</button></div></div>`;
      m.addEventListener('click',ev=>{if(ev.target===m)m.remove()});document.body.appendChild(m);break;
    }

    /* 家长 · 评分 */
    case 'review-open': openReviewForm(id);break;
    case 'seg':{
      const seg=el.parentElement.querySelectorAll('[data-gseg]');seg.forEach(b=>b.classList.remove('on'));el.classList.add('on');break;
    }
    case 'do-review':{
      const pass=el.dataset.pass==='1';
      const onEl=el.closest('.sheet')?.querySelector('[data-gseg="grade"].on');
      const grade=onEl?onEl.dataset.val:'perfect';
      const note=document.getElementById('reviewNote')?.value.trim()||'';
      DB.reviewCheckin(id,pass,grade,note);closeSheet();toast(pass?'评分完成，积分已发放':'已判定未通过');render();break;
    }
    case 'confirm-ex':{
      const note=window.prompt('备注（选填，如"今日已使用30分钟"）：','')||'';
      const r=DB.confirmExchange(id,note);toast(r.ok?'已确认消费':r.msg);render();break;
    }
    case 'reject-ex':{
      openConfirm('驳回兑换','驳回后积分将退还给孩子，确定吗？',()=>{DB.rejectExchange(id);toast('已驳回并退还积分');render()});break;
    }

    /* 家长 · 任务 */
    case 'task-form': openTaskForm(id||null);break;
    case 'save-task':{
      const seg=s=>document.querySelector(`[data-gseg="${s}"].on`)?.dataset.val;
      const data={type:seg('type')||'daily',name:document.getElementById('tkName').value.trim(),
        description:document.getElementById('tkDesc').value.trim(),
        points:Number(document.getElementById('tkPoints').value)||0,
        duration:Number(document.getElementById('tkDur').value)||0,
        need_photo:seg('photo')==='1'};
      if(!data.name){toast('请填写任务名称');return}
      if(data.points<=0||data.duration<=0){toast('分值和时长需大于0');return}
      if(id)DB.updateTask(id,data);else DB.addTask(data);
      closeSheet();toast(id?'已保存':'任务已发布');render();break;
    }
    case 'task-del':
      openConfirm('删除任务','删除后学生将无法再领取，确定吗？',()=>{DB.deleteTask(id);toast('已删除');render()});break;

    /* 家长 · 比例 / 密码 / 重置 */
    case 'rate-edit': openRateForm(el.dataset.kind);break;
    case 'save-rate':{
      const v=Number(document.getElementById('rateVal').value)||0;
      if(v<=0){toast('请输入大于0的数值');return}
      const rates=DB.getRates();
      DB.setRates(el.dataset.kind==='phone'?v:rates.phone,el.dataset.kind==='money'?v:rates.money);
      closeSheet();toast('比例已更新');render();break;
    }
    case 'pin-form': openPinForm(el.dataset.role);break;
    case 'save-pin':{
      const p=document.getElementById('newPin').value.trim(),p2=document.getElementById('newPin2').value.trim();
      if(!p||p.length<3){toast('密码至少 3 位');return}
      if(p!==p2){toast('两次输入不一致');return}
      DB.setPin(el.dataset.role,p);closeSheet();toast('密码已修改');break;
    }
    /* 家长 · 数据备份与恢复 */
    case 'backup-data':{
      const data=DB.exportBackup();
      const content=JSON.stringify(data);
      const fname='星芽打卡备份_'+new Date().toISOString().slice(0,10).replace(/-/g,'')+'.json';
      const r=await Native.saveTextFile(fname,content);
      if(!r.ok){toast('保存失败：'+(r.msg||'请重试'));return}
      if(Native.isNative){
        toast('备份已保存到手机，请选择存放位置');
        await Native.shareSavedFile(fname);
      }else{
        toast('备份文件已开始下载');
      }
      openBackupInfo(data);break;
    }
    case 'restore-data':{
      const picked=await Native.pickTextFile();
      if(picked.canceled||!picked.ok){if(picked.msg)toast(picked.msg);return}
      let obj;
      try{obj=JSON.parse(picked.text)}catch(e){toast('文件不是有效的 JSON 备份');return}
      const v=DB.validateBackup(obj);
      if(!v.ok){toast(v.msg);return}
      S.pendingRestore=v.bytes;
      openPinConfirm('确认恢复数据',
        '恢复将用备份文件覆盖当前所有数据（任务、打卡、积分、兑换记录及密码），当前数据会丢失。请输入家长密码确认。',
        async()=>{
          try{
            await DB.restoreBackup(S.pendingRestore);
            S.pendingRestore=null;
            toast('数据恢复成功');
            setTimeout(()=>location.reload(),500);
          }catch(err){toast('恢复失败：'+(err.message||'未知错误'))}
        });
      break;
    }

    case 'reset-data':
      openPinConfirm('清空所有数据',
        '此操作不可恢复！将删除所有任务、打卡、积分与兑换记录，并重置密码。请输入家长密码确认。',
        async()=>{ await Store.save(new Uint8Array(0)); location.reload(); });break;

    /* 弹窗通用 */
    case 'close-sheet': closeSheet();break;
    case 'confirm-ok':{
      const m=document.getElementById('sheetMask');const fn=m?m._onOk:null;closeSheet();if(fn)await fn();break;
    }
    case 'pin-confirm-ok':{
      const pinInput=document.getElementById('confirmPin');
      const pin=pinInput?.value.trim()||'';
      if(!pin){toast('请输入家长密码');return}
      if(!DB.verifyPin('parent',pin)){
        toast('家长密码不正确');
        if(pinInput){pinInput.value='';pinInput.focus()}
        return;
      }
      const m=document.getElementById('sheetMask');const fn=m?m._onOk:null;closeSheet();if(fn)await fn();break;
    }
  }
});

/* ============================================================
   启动
   ============================================================ */
(async function boot(){
  try{
    await Native.init();          // 检测并初始化原生能力（APK 内为 true）
    await DB.init();
    S.ready=true;
    render();
  }catch(err){
    console.error(err);
    $app.className='theme-student';
    $app.innerHTML=`<div class="auth"><div class="auth-card center"><div style="font-size:40px">⚠️</div>
      <div class="sheet-title">初始化失败</div><div class="note">${h(err.message||err)}<br><br>请通过本地服务器打开（而非直接双击文件）。</div></div></div>`;
  }
})();

/* Service Worker：仅 PWA 网页版注册；APK 原生环境禁用，避免拦截 Capacitor 桥接 */
if(!Native.isNative && 'serviceWorker' in navigator && location.protocol.startsWith('http')){
  window.addEventListener('load',()=>navigator.serviceWorker.register('sw.js').catch(()=>{}));
}
