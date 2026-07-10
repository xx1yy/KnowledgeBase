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
    <button class="nav-item ${currentView==='video-notes'?'active':''}" data-action="navigate" data-args='["video-notes"]'>
      <span class="nav-i">📺</span><span>视频笔记</span>
      <span class="nav-n">${counts['video-notes']||0}</span>
    </button>
    <button class="nav-item ${currentView==='post-notes'?'active':''}" data-action="navigate" data-args='["post-notes"]'>
      <span class="nav-i">📱</span><span>帖子笔记</span>
      <span class="nav-n">${counts['post-notes']||0}</span>
    </button>
    `;
}

// 详情页（通用条目详情，非概念专用）
async function openDetail(filepath, opts){
  opts = opts || {};
  const it = await get(`/item?path=${encodeURIComponent(decodeURIComponent(filepath))}`);
  if(it.error) return alert('文件未找到');
  const t = TYPE_MAP[it.type];
  let html = `<div class="detail"><span class="detail-back" data-action="goBack" data-args='[]'>← 返回${t?.label||''}</span>`;
  html += `<div class="detail-card">`;
  if(it.type==='book'){
    // 书籍封面占位（异步填充，避免阻塞详情渲染）
    html += `<div class="book-cover-wrap" id="bookCoverWrap" style="display:none"><img class="book-cover" id="bookCoverImg" alt="${ESC(it.title)} 封面" referrerpolicy="no-referrer"></div>`;
  }
  if(it.type==='video'){
    // 视频封面占位（本地 cover 字段，无则显示重新获取按钮）
    html += `<div class="book-cover-wrap" id="videoCoverWrap" style="display:none"><img class="book-cover" id="videoCoverImg" alt="${ESC(it.title)} 封面" referrerpolicy="no-referrer"></div>`;
  }
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
  if(it.type==='concept'){
    // 概念类型：conceptViewHtml 已包含四字段 + 「被以下笔记引用」
    html += `<div class="detail-section">${conceptViewHtml(it, filepath)}</div>`;
  } else {
    if(it.content) html += `<div class="detail-section"><h4>内容</h4>${renderNoteContent(it.content)}</div>`;
    if(it.tags&&it.tags.length) html += `<div class="detail-section"><h4>标签</h4>${it.tags.map(t=>`<span class="tag">${ESC(t)}</span>`).join(' ')}</div>`;
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
  if(it.type==='post'){
    const allPosts = await get(`/items?type=post`);
    const notes = allPosts.filter(p => p.type==='post-notes' && p.path.startsWith(it.path.replace(/[^/]+\.md$/,'')));
    if(notes.length){
      html += `<div class="detail-section"><h4>📱 帖子笔记</h4><div class="detail-links">${notes.map(n=>`<a href="#" data-action="openDetail" data-args='${JSON.stringify([n.path])}'>📄 ${ESC(n.title)}</a>`).join(' · ')}</div></div>`;
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
  if(opts.push !== false) callAction('pushHistory', {type:'detail', path: filepath});
  // 书籍详情：显示本地封面 + 上传按钮
  if(it.type==='book'){
    showBookCover(it);
  }
  // 视频详情：显示本地封面 + 上传/重新获取按钮
  if(it.type==='video'){
    showVideoCover(it);
  }
}

// ── 书籍封面显示 + 上传（详情页） ──
function showBookCover(it){
  const wrap = document.getElementById('bookCoverWrap');
  const img = document.getElementById('bookCoverImg');
  if(!wrap || !img) return;
  const coverUrl = it.cover || '';
  if(coverUrl){
    img.src = coverUrl;
    wrap.style.display = 'block';
  }
  // 在封面区域添加上传按钮
  const uploadBtn = document.createElement('button');
  uploadBtn.className = 'btn-g sm';
  uploadBtn.textContent = '📁 更换封面';
  uploadBtn.style.cssText = 'margin-top:8px;font-size:12px';
  uploadBtn.setAttribute('data-action', 'uploadCover');
  uploadBtn.setAttribute('data-args', JSON.stringify([it.path]));
  wrap.appendChild(uploadBtn);
}

// ── 视频封面显示 + 上传/重新获取（详情页） ──
function showVideoCover(it){
  const wrap = document.getElementById('videoCoverWrap');
  const img = document.getElementById('videoCoverImg');
  if(!wrap || !img) return;
  const coverUrl = it.cover || '';
  if(coverUrl){
    img.src = coverUrl;
    wrap.style.display = 'block';
  }
  // 上传封面按钮
  const uploadBtn = document.createElement('button');
  uploadBtn.className = 'btn-g sm';
  uploadBtn.textContent = '📁 更换封面';
  uploadBtn.style.cssText = 'margin-top:8px;font-size:12px;margin-right:6px';
  uploadBtn.setAttribute('data-action', 'uploadCover');
  uploadBtn.setAttribute('data-args', JSON.stringify([it.path]));
  wrap.appendChild(uploadBtn);
  // 重新从 B 站获取封面按钮（本地无封面或想刷新时）
  const refreshBtn = document.createElement('button');
  refreshBtn.className = 'btn-g sm';
  refreshBtn.textContent = '🔄 重新获取';
  refreshBtn.style.cssText = 'margin-top:8px;font-size:12px';
  refreshBtn.onclick = async function(){
    refreshBtn.disabled = true;
    refreshBtn.textContent = '获取中…';
    try{
      const r = await post('/video-cover-refresh', {path: it.path});
      if(r.ok && r.cover){
        img.src = r.cover;
        wrap.style.display = 'block';
        it.cover = r.cover;
      } else if(r.ok && !r.cover){
        alert('未找到 B 站封面（链接可能无效或外网不可达）。可改用手动上传。');
      } else {
        alert(r.error || '获取失败');
      }
    }catch(e){
      alert('获取失败：' + e.message);
    }finally{
      refreshBtn.disabled = false;
      refreshBtn.textContent = '🔄 重新获取';
    }
  };
  wrap.appendChild(refreshBtn);
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

/* ── 章节栏宽度拖拽调整 ─────────────── */
function initChapterResizer(){
  const resizer = document.getElementById('chapterResizer');
  const layout = document.querySelector('.notes-layout');
  const bar = document.getElementById('chapterBar');
  if(!resizer || !layout || !bar) return;

  // 从 localStorage 恢复上次宽度（像素），写入 CSS 变量而非内联 width
  // 内联 width 会覆盖 .chapters-collapsed #chapterBar{width:44px} 导致「收回章节栏」失效
  const saved = localStorage.getItem('kb_chapter_width');
  if(saved){
    const px = parseFloat(saved);
    if(px >= 160 && px <= 600){
      layout.style.setProperty('--chapter-w', px + 'px');
    }
  }

  let startX, startWidth;
  resizer.addEventListener('mousedown', function(e){
    e.preventDefault();
    resizer.classList.add('active');
    startX = e.clientX;
    startWidth = bar.offsetWidth;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    function onMove(e){
      const dx = e.clientX - startX;
      let newW = startWidth + dx;
      const maxW = layout.offsetWidth * 0.6;
      newW = Math.max(160, Math.min(maxW, newW));
      layout.style.setProperty('--chapter-w', newW + 'px');
    }
    function onUp(){
      resizer.classList.remove('active');
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      try{
        localStorage.setItem('kb_chapter_width', String(bar.offsetWidth));
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
    if(!Array.isArray(args)) args = [args];

    // 支持复合动作 "funcA|funcB"，各自带对应参数（args[索引] 为数组时优先）
    const actions = action.split('|');
    for(const a of actions){
      const fnName = a.trim();
      if(!fnName) continue;
      const argIdx = actions.indexOf(a);
      const subArgs = (argIdx >= 0 && Array.isArray(args[argIdx])) ? args[argIdx] : args;
      if(fnName.includes('.')){
        // 支持 "history.back" 这种多级属性路径（window.history.back）
        const parts = fnName.split('.');
        let obj = window;
        for(const p of parts){ if(obj) obj = obj[p]; }
        if(typeof obj === 'function') obj(...subArgs);
      } else {
        // callAction 是「执行式」分发器：在其内部执行处理器并传入参数。
        // 绝不能写成 `fn = callAction(name)` 再 `fn(...args)` —— 那会先无参执行一次，再把返回值当函数二次调用，导致 openDetail()/navigate() 丢失参数。
        callAction(fnName, ...subArgs);
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
    callAction(action, e.target.value, el);
  });

  // input 事件委托
  root.addEventListener('input', function(e){
    const el = e.target.closest('[data-input]');
    if(!el) return;
    const action = el.dataset.input;
    callAction(action, e.target.value, el);
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
      callAction(action, e, ...args);
      e.preventDefault();
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
