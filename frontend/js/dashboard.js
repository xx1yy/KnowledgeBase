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
      ${TYPES.map(t=>`<div class="stat-card" onclick="navigate('${t.key}')">
        <div class="stat-icon">${t.icon}</div>
        <div class="stat-num">${counts[t.key]||0}</div>
        <div class="stat-text">${t.label}</div>
      </div>`).join('')}
      <div class="stat-card" onclick="navigate('book-notes')">
        <div class="stat-icon">📝</div>
        <div class="stat-num">${counts['book-notes']||0}</div>
        <div class="stat-text">文学笔记</div>
      </div>
      <div class="stat-card" onclick="navigate('video-notes')">
        <div class="stat-icon">📺</div>
        <div class="stat-num">${counts['video-notes']||0}</div>
        <div class="stat-text">视频笔记</div>
      </div>
    </div>
    <div class="panel">
      <div class="panel-h">🕐 最近更新</div>
      ${(d.recent||[]).length ? (d.recent||[]).slice(0,10).map(r=>`<div class="item-row" onclick="openDetail('${r.path}')">
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
  return document.getElementById('content').innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(340px,1fr));gap:14px">
      ${filtered.map(it=>{
        let body = renderPreviewMd(it.content, 100);
        let statusBadge = it.status ? `<span class="type-badge ${statusColor(it.status)}">${it.status}</span>` : '';
        let tags = (it.tags||[]).slice(0,3).map(t=>`<span class="tag">${ESC(t)}</span>`).join('');
        return `<div class="panel" style="cursor:pointer" onclick="openDetail('${encodeURIComponent(it.path)}')">
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
