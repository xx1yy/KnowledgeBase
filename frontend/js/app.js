// App — 导航渲染、右侧栏、搜索、侧栏折叠、分栏拖拽、事件委托、启动初始化

// 渲染右侧快捷面板（最近概念 + 本文概念 + 页面操作 + 信息）
function renderRightbar(ctx){
  const el = document.getElementById('rightbarBody');
  if(!el) return;

  let html = '';

  // ── 最近概念 ──
  html += `<div class="rightbar-section"><div class="rightbar-h">💡 最近概念</div>`;
  if(!_recentConcepts || !_recentConcepts.length){
    html += `<div style="font-size:11.5px;color:var(--faint);padding:4px 0">暂无概念</div>`;
  } else {
    _recentConcepts.slice(0, 8).forEach(c => {
      const count = (c.excerpt ? 1 : 0) + (c.definition ? 1 : 0) + (c.how_to_use ? 1 : 0);
      const fill = count >= 3 ? 'var(--accent)' : count >= 1 ? 'var(--orange)' : 'var(--faint)';
      html += `<a class="rightbar-concept" href="#" data-action="showConceptPage" data-args='${JSON.stringify([c.path])}' title="${ESC(c.title)}">
        <span class="rc-dot" style="background:${fill}"></span>
        <span class="rc-name">${ESC(c.title)}</span>
        <span class="rc-date">${FMTREL(c.mtime)}</span>
      </a>`;
    });
  }
  html += `</div>`;

  // ── 笔记概念 ──
  if(ctx.concepts && ctx.concepts.length){
    html += `<div class="rightbar-section">
      <div class="rightbar-h">💡 本文概念</div>
      ${ctx.concepts.map(c => `<a class="rightbar-concept" href="#" data-action="showConceptPage" data-args='${JSON.stringify([c.path])}' title="${ESC(c.title)}">
        <span class="rc-dot" style="background:${c.fill}"></span>
        <span class="rc-name">${ESC(c.title)}</span>
      </a>`).join('')}
    </div>`;
  }

  // ── 页面操作 ──
  if(ctx.actions && ctx.actions.length){
    html += `<div class="rightbar-section">
      <div class="rightbar-h">⚡ 页面操作</div>
      <div class="rightbar-actions">
        ${ctx.actions.map(a => {
          const args = a.args ? JSON.stringify(a.args) : '[]';
          if(a.type === 'danger'){
            return `<button class="btn-g btn-danger" data-action="${a.action}" data-args='${args}'>${a.label}</button>`;
          }
          if(a.type === 'primary'){
            return `<button class="btn-p" data-action="${a.action}" data-args='${args}'>${a.label}</button>`;
          }
          return `<button class="btn-g" data-action="${a.action}" data-args='${args}'>${a.label}</button>`;
        }).join('')}
      </div>
    </div>`;
  }

  // ── 快速信息 ──
  if(ctx.info){
    html += `<div class="rightbar-section">
      <div class="rightbar-h">📋 信息</div>
      <div style="font-size:11.5px;color:var(--muted);line-height:1.7">${ctx.info}</div>
    </div>`;
  }

  el.innerHTML = html;
}

function renderNav(){
  document.getElementById('nav').innerHTML = `
    <div class="nav-label">总览</div>
    <button class="nav-item ${currentView==='dashboard'?'active':''}" data-action="navigate" data-args='["dashboard"]'>
      <span class="nav-i">🏠</span><span>仪表盘</span>
    </button>
    <button class="nav-item ${currentView==='search'?'active':''}" data-action="navigate" data-args='["search"]'>
      <span class="nav-i">🔍</span><span>搜索</span>
    </button>
    <button class="nav-item ${currentView==='graph'?'active':''}" data-action="navigate" data-args='["graph"]'>
      <span class="nav-i">🕸️</span><span>知识图谱</span>
    </button>
    <button class="nav-item ${currentView==='tags'?'active':''}" data-action="navigate" data-args='["tags"]'>
      <span class="nav-i">🏷️</span><span>标签</span>
      <span class="nav-n">${counts['tagCount']||0}</span>
    </button>
    <button class="nav-item ${currentView==='domains'?'active':''}" data-action="navigate" data-args='["domains"]'>
      <span class="nav-i">🗂️</span><span>领域</span>
      <span class="nav-n">${counts['domainCount']||0}</span>
    </button>
    <div class="nav-label">内容</div>
    ${TYPES.map(t=>`<button class="nav-item ${currentView===t.key?'active':''}" data-action="navigate" data-args='${JSON.stringify([t.key])}'>
      <span class="nav-i">${t.icon}</span><span>${t.label}</span>
      <span class="nav-n">${counts[t.key]||0}</span>
    </button>`).join('')}
    <button class="nav-item ${currentView==='book-notes'?'active':''}" data-action="navigate" data-args='["book-notes"]'>
      <span class="nav-i">📝</span><span>文学笔记</span>
      <span class="nav-n">${counts['book-notes']||0}</span>
    </button>
    <button class="nav-item ${currentView==='video-notes'?'active':''}" data-action="navigate" data-args='["video-notes']'>
      <span class="nav-i">📺</span><span>视频笔记</span>
      <span class="nav-n">${counts['video-notes']||0}</span>
    </button>
    `;
}

// 详情页（通用条目详情，非概念专用）
async function openDetail(filepath, opts){
  opts = opts || {};
  const it = await get(`/item?path=${encodeURIComponent(decodeURIComponent(filepath))}`);
  if(it.error) return alert('文件未找到');
  const t = TYPE_MAP[it.type];
  let html = `<div class="detail"><span class="detail-back" data-action="history.back" data-args='[]'>← 返回${t?.label||''}</span>`;
  html += `<div class="detail-card">`;
  html += `<div class="detail-title">${ESC(it.title)}</div>`;
  html += `<div class="detail-meta">`;
  if(t) html += `<span class="type-badge ${t.typeCls}">${t.icon} ${t.label}</span>`;
  if(it.status) html += `<span class="type-badge ${statusColor(it.status)}">${it.status}</span>`;
  if(it.priority) html += `<span class="type-badge badge-gray">${it.priority}</span>`;
  if(it.mood) html += `<span class="type-badge badge-blue">${it.mood}</span>`;
  if(it.rating>0) html += `<span class="stars">${'★'.repeat(it.rating)}${'☆'.repeat(5-it.rating)}</span>`;
  html += `</div>`;
  if(it.author) html += `<div class="detail-section"><h4>作者</h4><p>${ESC(it.author)}</p></div>`;
  if(it.source) html += `<div class="detail-section"><h4>来源</h4><p>${ESC(it.source)}</p></div>`;
  if(it.url) html += `<div class="detail-section"><h4>链接</h4><p><a href="${ESC(it.url)}" target="_blank">${ESC(it.url)}</a></p></div>`;
  if(it.domain) html += `<div class="detail-section"><h4>领域</h4><p>${ESC(it.domain)}</p></div>`;
  if(it.content) html += `<div class="detail-section"><h4>内容</h4>${renderNoteContent(it.content)}</div>`;
  if(it.tags&&it.tags.length) html += `<div class="detail-section"><h4>标签</h4>${it.tags.map(t=>`<span class="tag">${ESC(t)}</span>`).join(' ')}</div>`;
  if(it.type==='concept'){
    html += `<div class="detail-section"><h4>📖 来源笔记</h4><div class="detail-links" id="conceptSources">加载中…</div></div>`;
  }
  if(it.type==='book'){
    const allBooks = await get(`/items?type=book`);
    const notes = allBooks.filter(b => b.type==='book-notes' && b.path.startsWith(it.path.replace(/[^/]+\.md$/,'')));
    if(notes.length){
      html += `<div class="detail-section"><h4>📝 文学笔记</h4><div class="detail-links">${notes.map(n=>`<a href="#" data-action="openDetail" data-args='${JSON.stringify([n.path])}'>📄 ${ESC(n.title)}</a>`).join(' · ')}</div></div>`;
    }
  }
  if(it.type==='video'){
    const allVideos = await get(`/items?type=video`);
    const notes = allVideos.filter(v => v.type==='video-notes' && v.path.startsWith(it.path.replace(/[^/]+\.md$/,'')));
    if(notes.length){
      html += `<div class="detail-section"><h4>📺 视频笔记</h4><div class="detail-links">${notes.map(n=>`<a href="#" data-action="openDetail" data-args='${JSON.stringify([n.path])}'>📄 ${ESC(n.title)}</a>`).join(' · ')}</div></div>`;
    }
  }
  html += `<div class="detail-section"><h4>链接</h4><div class="detail-links">${(it.links||[]).map(l=>`<a href="#" data-action="openDetail" data-args='${JSON.stringify([l+".md"])}'>[[${ESC(l)}]]</a>`).join(' · ')||'无'}</div></div>`;
  if(it.backlinks&&it.backlinks.length) html += `<div class="detail-section"><h4>被以下引用</h4><div class="detail-links">${it.backlinks.map(bl=>`<a href="#" data-action="openDetail" data-args='${JSON.stringify([bl.path])}'>← ${ESC(bl.title)} (${TYPE_MAP[bl.type]?.label||bl.type})</a>`).join(' · ')}</div></div>`;
  html += `<div class="detail-meta" style="font-size:11px;color:var(--faint)">创建于 ${FMT(it.created)} · 更新于 ${FMT(it.updated)} · 文件: ${it.path}</div>`;
  html += `</div></div>`;
  document.getElementById('content').innerHTML = html;
  document.getElementById('pageTitle').textContent = (t?.label||'')+' › 详情';
  document.getElementById('addBtn').style.display = 'none';
  if(it.type==='concept'){
    loadSourcesForConcept(it.title);
  }
  // 更新右侧栏
  const infoLines = [];
  if(it.author) infoLines.push(`作者：${it.author}`);
  if(it.source) infoLines.push(`来源：${it.source}`);
  if(it.status) infoLines.push(`状态：${it.status}`);
  if(it.rating > 0) infoLines.push(`评分：${'★'.repeat(it.rating)}`);
  if(it.domain) infoLines.push(`领域：${it.domain}`);
  if(it.concepts && it.concepts.length) infoLines.push(`相关概念：${it.concepts.length}个`);
  renderRightbar({
    actions: [
      {label:'✏️ 编辑', action:'openEdit', args:[it.path]},
      {label:'🗑 删除', action:'deleteItem', args:[it.path], type:'danger'}
    ],
    info: infoLines.join('<br>') || null
  });
  if(opts.push !== false) pushHistory({type:'detail', path: filepath});
}

// 搜索
let searchTimer;
async function renderSearch(){
  const q = document.getElementById('searchBox').value.trim();
  if(!q) return document.getElementById('content').innerHTML = `<div class="empty"><div class="big">🔍</div>输入关键词搜索</div>`;
  const results = await get(`/search?q=${encodeURIComponent(q)}`);
  if(!results.length) return document.getElementById('content').innerHTML = `<div class="empty"><div class="big">🔍</div>没有找到「${ESC(q)}」</div>`;
  document.getElementById('content').innerHTML = `<p style="color:var(--muted);margin-bottom:14px">找到 ${results.length} 条结果</p>` + results.map(r=>`<div class="panel" style="cursor:pointer" data-action="openDetail" data-args='${JSON.stringify([r.path])}'>
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:5px">
      <span class="type-badge ${TYPE_MAP[r.type]?.typeCls||''}">${TYPE_MAP[r.type]?.label||r.type}</span>
      <span style="font-size:12px;color:var(--faint)">${FMTREL(r.mtime)}</span>
    </div>
    <div style="font-size:13.5px;font-weight:600">${ESC(r.title)}</div>
    <div style="font-size:12px;color:var(--muted);margin-top:4px">${ESC(r.snippet||'')}</div>
  </div>`).join('');
}

// 侧边栏搜索输入监听
document.getElementById('searchBox').addEventListener('input', function(){
  if(currentView==='search') renderSearch();
});

// 侧栏折叠（状态持久化到 localStorage）
function toggleSidebar(){
  document.body.classList.toggle('sidebar-collapsed');
  try{ localStorage.setItem('kb_sidebar', document.body.classList.contains('sidebar-collapsed')?'1':'0'); }catch(e){}
}
function toggleRightbar(){
  document.body.classList.toggle('rightbar-collapsed');
  try{ localStorage.setItem('kb_rightbar', document.body.classList.contains('rightbar-collapsed')?'1':'0'); }catch(e){}
}

/* ── 可拖拽分栏分割条 ─────────────────── */
function initSplitResizer(){
  const resizer = document.getElementById('splitResizer');
  const split = document.getElementById('extractSplit');
  if(!resizer || !split) return;
  const left = split.querySelector('.extract-split-left');
  if(!left) return;

  // 从 localStorage 恢复上次宽度
  const saved = localStorage.getItem('kb_split_left_pct');
  if(saved){
    const pct = parseFloat(saved);
    if(pct >= 20 && pct <= 70){
      left.style.width = pct + '%';
    }
  }

  let startX, startWidth;
  resizer.addEventListener('mousedown', function(e){
    e.preventDefault();
    resizer.classList.add('active');
    startX = e.clientX;
    startWidth = left.offsetWidth;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    function onMove(e){
      const dx = e.clientX - startX;
      const containerW = split.offsetWidth;
      let newW = startWidth + dx;
      let newPct = (newW / containerW) * 100;
      newPct = Math.max(18, Math.min(68, newPct));
      left.style.width = newPct + '%';
    }
    function onUp(){
      resizer.classList.remove('active');
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      try{
        const pct = (left.offsetWidth / split.offsetWidth) * 100;
        localStorage.setItem('kb_split_left_pct', String(pct));
      }catch(e){}
    }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });
}

/* ── 统一事件委托（替代内联 onclick，消除 XSS 风险） ── */
function initEventDelegation(){
  // 挂载到 document 而非 #content，确保 nav / rightbar / modal 等所有区域的 data-action 都能响应
  const root = document;
  if(!root) return;

  // click 事件委托：data-action + data-args(JSON 数组)
  root.addEventListener('click', function(e){
    const el = e.target.closest('[data-action]');
    if(!el) return;
    const action = el.dataset.action;

    // 特殊处理：遮罩层关闭（仅当点击目标是遮罩本身）
    if(action === 'closeModalOnMask' && e.target !== el) return;

    let args = [];
    try{ args = JSON.parse(el.dataset.args || '[]'); }catch(ex){ args = []; }

    // 支持复合动作 "funcA|funcB"
    const actions = action.split('|');
    for(const a of actions){
      const fnName = a.trim();
      if(!fnName) continue;
      if(typeof window[fnName] === 'function'){
        // 每个子动作取对应的参数；若只有一组 args 则所有子动作共用
        const argIdx = actions.indexOf(a);
        const subArgs = (argIdx >= 0 && Array.isArray(args[argIdx])) ? args[argIdx] : args;
        window[fnName](...subArgs);
      }
    }
    // 如果元素有 href="#" 且不是真正的链接，阻止默认行为
    if(el.tagName === 'A' && el.getAttribute('href') === '#') e.preventDefault();
  });

  // change 事件委托（select 等）
  root.addEventListener('change', function(e){
    const el = e.target.closest('[data-change]');
    if(!el) return;
    const action = el.dataset.change;
    if(typeof window[action] === 'function'){
      window[action](e.target.value, el);
    }
  });

  // input 事件委托
  root.addEventListener('input', function(e){
    const el = e.target.closest('[data-input]');
    if(!el) return;
    const action = el.dataset.input;
    if(typeof window[action] === 'function'){
      window[action](e.target.value, el);
    }
  });

  // 拖拽事件委托（dragstart/dragover/dragend/drop）
  ['dragstart','dragover','dragend','drop'].forEach(evtType => {
    const dataAttr = 'data-drag-' + evtType;
    const camel = 'drag' + evtType.charAt(0).toUpperCase() + evtType.slice(1);
    root.addEventListener(evtType, function(e){
      const el = e.target.closest('[' + dataAttr + ']');
      if(!el) return;
      const action = el.dataset[camel];
      let rawArgs = el.dataset.args || '[]';
      if(evtType === 'drop' && el.dataset.dropArgs) rawArgs = el.dataset.dropArgs;
      let args = [];
      try{ args = JSON.parse(rawArgs); }catch(ex){ args = []; }
      if(typeof window[action] === 'function'){
        window[action](e, ...args);
        e.preventDefault();
      }
    });
  });
}

// 启动
(async function init(){
  try{
    if(localStorage.getItem('kb_sidebar')==='1') document.body.classList.add('sidebar-collapsed');
    if(localStorage.getItem('kb_rightbar')==='1') document.body.classList.add('rightbar-collapsed');
    await fetchAuthToken();   // 先获取认证 token
    await loadDashboard();
    await loadRecentConcepts();
    renderNav();
    renderDashboard();
    history.replaceState({type:'view', view:'dashboard'}, '');
    renderRightbar({actions:[]});
  }catch(e){
    console.error('[KB] init error:', e);
    document.getElementById('content').innerHTML =
      '<div class="empty"><div class="big">🔴</div>初始化错误<p style="margin-top:10px;color:var(--faint)">'+ESC(e.message||e)+'</p></div>';
  }
  // 无论上面是否出错，事件委托必须注册（否则所有按钮无法点击）
  try { initEventDelegation(); } catch(e){ console.error('[KB] initEventDelegation error:', e); }
  updateApiStatus();
})();
