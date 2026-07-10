// Dashboard
let dashboardData = null;
let counts = {};

async function loadDashboard(){
  try{ dashboardData = await get('/dashboard'); counts = dashboardData.counts||{}; }
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
  const data = await get(`/items?type=${type}`);
  const filtered = data.filter(it => it.type === type);
  if(!filtered.length) return document.getElementById('content').innerHTML = `<div class="empty"><div class="big">${TYPE_MAP[type]?.icon||''}</div>还没有${TYPE_MAP[type]?.label||''}记录</div>`;

  // 视频列表：每条带封面缩略图（像 B 站/YouTube 列表那样）
  if(type==='video'){
    const html = `
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(400px,1fr));gap:14px">
      ${filtered.map(it=>{
        // 从 content/url 提取 BV 号
        const raw = (it.url||'') + '\n' + (it.content||'');
        const bvMatch = raw.match(/(BV[0-9A-Za-z]{10,12})/);
        const bvId = bvMatch ? bvMatch[1] : '';
        let tags = (it.tags||[]).slice(0,3).map(t=>`<span class="tag">${ESC(t)}</span>`).join('');
        return `<div class="panel item-card-video" style="cursor:pointer" data-action="openDetail" data-args='${JSON.stringify([it.path])}'${bvId?` data-bv="${bvId}"`:''}>
          <div class="video-thumb-row">
            <img class="video-thumb" src="" alt="${ESC(it.title)} 封面" referrerpolicy="no-referrer" loading="lazy">
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
    loadVideoThumbs(); // 异步批量填充封面
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
    if(!img){ img.style.display='none'; continue; }
    // 先检查 localStorage 缓存
    const cacheKey = 'kb_cover_' + bv;
    try{
      const cached = JSON.parse(localStorage.getItem(cacheKey));
      if(cached && cached.ok && cached.cover){
        img.src = cached.cover; continue;
      }
    }catch(e){}
    // 异步请求封面（不阻塞渲染）
    get('/cover?url=' + encodeURIComponent('https://www.bilibili.com/video/'+bv))
      .then(d => { if(d?.ok && d.cover){ img.src = d.cover; try{localStorage.setItem(cacheKey, JSON.stringify(d));}catch(e){} } })
      .catch(() => {});
  }
}
