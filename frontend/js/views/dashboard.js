// Dashboard
let dashboardData = null;
let counts = {};
const _API = (location.host ? '' : 'http://localhost:16000') + '/api';

async function loadDashboard(){
  try{ dashboardData = await get(withDomain('/dashboard')); counts = dashboardData.counts||{}; }
  catch(e){ dashboardData = {counts:{},recent:[],total:0}; counts = {}; }
}

async function renderDashboard(){
  if(!dashboardData) await loadDashboard();
  const d = dashboardData;
  return document.getElementById('content').innerHTML = `
    <div class="dash-grid">
      ${TYPES.map(t=>`<div class="stat-card" data-action="navigate" data-args='${JSON.stringify([t.key])}'>
        <div class="stat-icon">${t.icon}</div>
        <div class="stat-num">${counts[t.key]||0}</div>
        <div class="stat-text">${t.label}</div>
      </div>`).join('')}
      <div class="stat-card" data-action="navigate" data-args='["book-notes"]'>
        <div class="stat-icon">📝</div>
        <div class="stat-num">${counts['book-notes']||0}</div>
        <div class="stat-text">文学笔记</div>
      </div>
      <div class="stat-card" data-action="navigate" data-args='["video-notes"]'>
        <div class="stat-icon">📺</div>
        <div class="stat-num">${counts['video-notes']||0}</div>
        <div class="stat-text">视频笔记</div>
      </div>
    </div>
    <div class="panel">
      <div class="panel-h">🕐 最近更新</div>
      ${(d.recent||[]).length ? (d.recent||[]).slice(0,10).map(r=>`<div class="item-row" data-action="openDetail" data-args='${JSON.stringify([r.path])}'>
        <span class="item-type ${TYPE_MAP[r.type]?.typeCls||''}">${TYPE_MAP[r.type]?.label||r.type}</span>
        <span class="item-title">${ESC(r.title)}</span>
        <span class="item-date">${FMTREL(r.mtime)}</span>
      </div>`).join('') : '<div class="empty"><div class="big">📭</div>还没有内容</div>'}
    </div>`;
}

async function renderList(type){
  const data = await get(withDomain(`/items?type=${type}`));
  const filtered = data.filter(it => it.type === type);
  if(!filtered.length) return document.getElementById('content').innerHTML = `<div class="empty"><div class="big">${TYPE_MAP[type]?.icon||''}</div>还没有${TYPE_MAP[type]?.label||''}记录</div>`;

  // 计划列表：按 plan_type 分区（行动 vs 习惯），各自不同 UI
  if(type==='plan'){
    const actions = filtered.filter(it => (it.plan_type||'action') !== 'habit');
    const habits = filtered.filter(it => (it.plan_type||'action') === 'habit');
    const html = `
    <div class="plan-layout">
      <div class="plan-section">
        <div class="plan-section-h">📋 普通行动 <span class="plan-count">${actions.length}</span></div>
        ${actions.length ? actions.map(it=>{
          const statusBadge = it.status ? `<span class="type-badge ${statusColor(it.status)}">${it.status}</span>` : '';
          const priBadge = it.priority ? `<span class="type-badge badge-gray">P${it.priority==='高'?'1':it.priority==='中'?'2':'3'}</span>` : '';
          const dueBadge = it.due_date ? `<span style="font-size:11px;color:var(--faint)">截止 ${it.due_date}</span>` : '';
          return `<div class="panel plan-item" style="cursor:pointer" data-action="openDetail" data-args='${JSON.stringify([it.path])}'>
            <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">
              <span style="flex:1;font-size:14px;font-weight:600">${ESC(it.title)}</span>
              ${statusBadge}${priBadge}
            </div>
            ${it.content?`<div style="font-size:12px;color:var(--muted);margin-bottom:4px">${renderPreviewMd(it.content, 60)}</div>`:''}
            <div style="display:flex;gap:8px;align-items:center">
              ${dueBadge}
              ${it.source_concept?`<span style="font-size:11px;color:var(--teal)">↳ ${ESC(it.source_concept)}</span>`:''}
              <span style="font-size:11px;color:var(--faint);margin-left:auto">${FMTREL(it.mtime)}</span>
            </div>
          </div>`;
        }).join('') : '<div style="font-size:12px;color:var(--faint);padding:12px 0">暂无行动项</div>'}
      </div>
      <div class="plan-section">
        <div class="plan-section-h">🔥 习惯养成 <span class="plan-count">${habits.length}</span></div>
        ${habits.length ? habits.map(it=>{
          const freqLabel = {daily:'每天',weekly:'每周',weekday:'工作日',custom:'自定义'}[it.frequency||'daily'] || it.frequency;
          const streak = it.streak || 0;
          const best = it.best_streak || 0;
          const lastCheckin = it.last_checkin || '';
          const today = new Date().toISOString().slice(0,10);
          const checkedToday = lastCheckin === today;
          return `<div class="panel plan-item habit-item" data-path="${ESC(it.path)}">
            <div style="display:flex;align-items:center;gap:8px">
              <button class="btn-g sm habit-checkin-btn" data-action="habitCheckin" data-args='${JSON.stringify([it.path])}'${checkedToday?' disabled style="opacity:0.5"':''}>${checkedToday?'✅ 已打卡':'☐ 打卡'}</button>
              <span style="flex:1;font-size:14px;font-weight:600">${ESC(it.title)}</span>
              <span class="type-badge ${statusColor(it.status)}">${it.status||'活跃'}</span>
            </div>
            <div style="display:flex;align-items:center;gap:10px;margin-top:4px;font-size:12px;color:var(--muted)">
              <span>${freqLabel}</span>
              <span style="color:${streak>=7?'var(--success)':'var(--text)'};font-weight:500">🔥 连续 ${streak} 天</span>
              <span>最长 ${best} 天</span>
              ${it.source_concept?`<span style="color:var(--teal)">↳ ${ESC(it.source_concept)}</span>`:''}
              <span style="margin-left:auto">${FMTREL(it.mtime)}</span>
            </div>
          </div>`;
        }).join('') : '<div style="font-size:12px;color:var(--faint);padding:12px 0">暂无习惯</div>'}
      </div>
    </div>`;
    document.getElementById('content').innerHTML = html;
    return;
  }

  // 视频列表：每条带封面缩略图（像 B 站/YouTube 列表那样）
  if(type==='video'){
    const html = `
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(400px,1fr));gap:14px">
      ${filtered.map(it=>{
        // 从 content/url 提取 BV 号（仅用于旧视频的外网兜底抓取）
        const raw = (it.url||'') + '\n' + (it.content||'');
        const bvMatch = raw.match(/(BV[0-9A-Za-z]{10,12})/);
        const bvId = bvMatch ? bvMatch[1] : '';
        const coverUrl = it.cover || '';
        let tags = (it.tags||[]).slice(0,3).map(t=>`<span class="tag">${ESC(t)}</span>`).join('');
        return `<div class="panel item-card-video" style="cursor:pointer" data-action="openDetail" data-args='${JSON.stringify([it.path])}'${bvId?` data-bv="${bvId}"`:''}>
          <div class="video-thumb-row">
            <div class="book-thumb-wrap" style="width:160px;height:90px">
              ${coverUrl ? `<img class="video-thumb" src="${coverUrl}" alt="${ESC(it.title)} 封面">` :
              `<div class="video-thumb-placeholder" title="点击上传封面">📷</div>`}
              <button class="book-cover-upload-btn" data-action="uploadCover" data-args='${JSON.stringify([it.path])}' title="上传封面">📁</button>
            </div>
            <div class="video-thumb-info">
              <div style="font-size:14px;font-weight:600;line-height:1.3;margin-bottom:4px">${ESC(it.title)}</div>
              ${it.source?`<div style="font-size:12px;color:var(--muted)">${ESC(it.source)}</div>`:''}
              ${(it.status)?`<span class="type-badge ${statusColor(it.status)}">${it.status}</span>`:''}
              ${tags?`<div style="margin-top:4px">${tags}</div>`:''}
            </div>
          </div>
          <div style="display:flex;justify-content:space-between;align-items:center;margin-top:8px">
            ${it.rating>0?`<span class="stars">${'★'.repeat(it.rating)}${'☆'.repeat(5-it.rating)}</span>`:'<span></span>'}
            <span style="font-size:11px;color:var(--faint)">${FMTREL(it.mtime)}</span>
          </div>
        </div>`;
      }).join('')}
    </div>`;
    document.getElementById('content').innerHTML = html;
    loadVideoThumbs(); // 仅对尚未本地化封面的旧视频做外网兜底
    return;
  }

  // 书籍列表：每条带封面缩略图（像书架一样）
  if(type==='book'){
    const html = `
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(340px,1fr));gap:14px">
      ${filtered.map(it=>{
        let tags = (it.tags||[]).slice(0,3).map(t=>`<span class="tag">${ESC(t)}</span>`).join('');
        const coverUrl = it.cover || '';
        return `<div class="panel item-card-book" style="cursor:pointer" data-action="openDetail" data-args='${JSON.stringify([it.path])}' data-title="${ESC(it.title)}" data-author="${ESC(it.author||'')}" data-path="${ESC(it.path)}">
          <div class="book-thumb-row">
            <div class="book-thumb-wrap">
              ${coverUrl ? `<img class="book-thumb" src="${coverUrl}" alt="${ESC(it.title)} 封面">` :
              `<div class="book-thumb book-thumb-placeholder" title="点击上传封面">📷</div>`}
              <button class="book-cover-upload-btn" data-action="uploadCover" data-args='${JSON.stringify([it.path])}' title="上传封面">📁</button>
            </div>
            <div class="book-thumb-info">
              <div style="font-size:14px;font-weight:600;line-height:1.3;margin-bottom:4px">${ESC(it.title)}</div>
              ${it.author?`<div style="font-size:12px;color:var(--muted)">${ESC(it.author)}</div>`:''}
              ${(it.status)?`<span class="type-badge ${statusColor(it.status)}">${it.status}</span>`:''}
              ${it.rating>0?`<span class="stars">${'★'.repeat(it.rating)}${'☆'.repeat(5-it.rating)}</span>`:''}
              ${tags?`<div style="margin-top:4px">${tags}</div>`:''}
            </div>
          </div>
        </div>`;
      }).join('')}
    </div>`;
    document.getElementById('content').innerHTML = html;
    // 不再调用外部 API，封面已直接从 cover 字段渲染
    return;
  }

  return document.getElementById('content').innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(340px,1fr));gap:14px">
      ${filtered.map(it=>{
        let body = renderPreviewMd(it.content, 100);
        let statusBadge = it.status ? `<span class="type-badge ${statusColor(it.status)}">${it.status}</span>` : '';
        let tags = (it.tags||[]).slice(0,3).map(t=>`<span class="tag">${ESC(t)}</span>`).join('');
        return `<div class="panel" style="cursor:pointer" data-action="openDetail" data-args='${JSON.stringify([it.path])}'>
          <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:6px">
            <div style="font-size:14px;font-weight:600">${ESC(it.title)}</div>
            ${it.rating>0?`<span class="stars">${'★'.repeat(it.rating)}${'☆'.repeat(5-it.rating)}</span>`:''}
          </div>
          ${body?`<div class="preview-body">${body}</div>`:''}
          <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">
            ${statusBadge}
            ${it.author?`<span class="type-badge badge-gray">${ESC(it.author)}</span>`:''}
            ${it.source?`<span class="type-badge badge-gray">${ESC(it.source)}</span>`:''}
            ${tags}
            <span style="font-size:11px;color:var(--faint);margin-left:auto">${FMTREL(it.mtime)}</span>
          </div>
        </div>`;
      }).join('')}
    </div>`;
}

// ── 批量加载视频列表封面缩略图 ──
async function loadVideoThumbs(){
  // data-bv 在父级 .panel 上，从它里面找 .video-thumb
  const cards = document.querySelectorAll('[data-bv]');
  for(const card of cards){
    const bv = card.dataset.bv;
    if(!bv) continue;
    const img = card.querySelector('.video-thumb');
    if(!img) continue;
    // 已有本地封面（src 非空）→ 跳过，避免外网请求覆盖/失败
    if(img.getAttribute('src')) continue;
    // 先检查 localStorage 缓存
    const cacheKey = 'kb_cover_' + bv;
    try{
      const cached = JSON.parse(localStorage.getItem(cacheKey));
      if(cached && cached.ok && cached.cover){
        img.src = cached.cover; continue;
      }
    }catch(e){}
    // 异步请求封面（仅旧视频兜底，失败静默）
    get('/cover?url=' + encodeURIComponent('https://www.bilibili.com/video/'+bv))
      .then(d => { if(d?.ok && d.cover){ img.src = d.cover; try{localStorage.setItem(cacheKey, JSON.stringify(d));}catch(e){} } })
      .catch(() => {});
  }
}

// ── 封面上传（书籍/视频通用，写入 cover 字段 data URI） ──
async function uploadCover(itemPath){
  const fp = decodeURIComponent(bookPath);
  // 创建隐藏的 file input
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.onchange = async function(){
    const file = input.files[0];
    if(!file) return;
    if(file.size > 5*1024*1024){ alert('图片不能超过 5MB'); return; }
    const reader = new FileReader();
    reader.onload = async function(){
      try{
        const r = await post('/book-cover-upload', {path: fp, content: reader.result});
        if(r.ok){
          // 刷新当前书籍列表以显示新封面
          renderList('book');
        } else {
          alert(r.error || '上传失败');
        }
      } catch(e){
        alert('上传失败：' + e.message);
      }
    };
    reader.readAsDataURL(file);
  };
  input.click();
}

// ── 习惯打卡 ── ──
async function habitCheckin(filepath){
  const fp = decodeURIComponent(filepath);
  try{
    const r = await post('/habit-checkin', {path: fp});
    if(r.ok){
      // 刷新当前视图
      renderList('plan');
    } else {
      alert(r.error || '打卡失败');
    }
  } catch(e){
    alert('打卡失败：' + e.message);
  }
}
