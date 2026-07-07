// App - Navigation, Modals, Search, Init, Rightbar
let currentView = 'dashboard';
let _recentConcepts = null;

// 加载最近概念（缓存）
async function loadRecentConcepts(){
  if(_recentConcepts) return _recentConcepts;
  try{
    const concepts = await get('/items?type=concept');
    _recentConcepts = concepts.sort((a,b) => (b.mtime||0) - (a.mtime||0)).slice(0, 10);
  }catch(e){
    _recentConcepts = [];
  }
  return _recentConcepts;
}

function clearRecentConceptsCache(){ _recentConcepts = null; }

// ── 浏览器历史栈（支持后退/前进按钮）──
function pushHistory(state){ history.pushState(state, ''); }
async function restoreNotesView(path, done){
  const fp = decodeURIComponent(path);
  let view = 'book-notes';
  try{
    const it = await get('/item?path=' + encodeURIComponent(fp));
    view = it.type === 'video-notes' ? 'video-notes' : 'book-notes';
  }catch(e){}
  if(!document.getElementById('noteReader')){
    currentNotesView = view;
    if(view === 'video-notes'){ await renderVideoNotes(); } else { await renderBookNotes(); }
  }
  if(done) await done();
}
function applyRoute(state){
  if(!state){ navigate('dashboard', {push:false}); return; }
  if(state.type === 'view'){ navigate(state.view, {push:false}); return; }
  if(state.type === 'detail'){ openDetail(state.path, {push:false}); return; }
  if(state.type === 'note'){ restoreNotesView(state.path, () => loadNoteContent(state.path, {push:false})); return; }
  if(state.type === 'extract'){ restoreNotesView(state.path, async () => { await loadNoteContent(state.path, {push:false}); showExtractConcept(state.path, {push:false}); }); return; }
  navigate('dashboard', {push:false});
}
window.addEventListener('popstate', (e)=> applyRoute(e.state));

// 渲染右侧快捷面板
function renderRightbar(ctx){
  const el = document.getElementById('rightbar');
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
      html += `<a class="rightbar-concept" href="#" onclick="event.preventDefault();openDetail('${encodeURIComponent(c.path)}')" title="${ESC(c.title)}">
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
      ${ctx.concepts.map(c => `<a class="rightbar-concept" href="#" onclick="event.preventDefault();openDetail('${encodeURIComponent(c.path)}')" title="${ESC(c.title)}">
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
          if(a.type === 'danger'){
            return `<button class="btn-g btn-danger" onclick="${a.onclick}">${a.label}</button>`;
          }
          if(a.type === 'primary'){
            return `<button class="btn-p" onclick="${a.onclick}">${a.label}</button>`;
          }
          return `<button class="btn-g" onclick="${a.onclick}">${a.label}</button>`;
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
    <button class="nav-item ${currentView==='dashboard'?'active':''}" onclick="navigate('dashboard')">
      <span class="nav-i">🏠</span><span>仪表盘</span>
    </button>
    <button class="nav-item ${currentView==='search'?'active':''}" onclick="navigate('search')">
      <span class="nav-i">🔍</span><span>搜索</span>
    </button>
    <button class="nav-item ${currentView==='graph'?'active':''}" onclick="navigate('graph')">
      <span class="nav-i">🕸️</span><span>知识图谱</span>
    </button>
    <button class="nav-item ${currentView==='tags'?'active':''}" onclick="navigate('tags')">
      <span class="nav-i">🏷️</span><span>标签</span>
      <span class="nav-n">${counts['tagCount']||0}</span>
    </button>
    <div class="nav-label">内容</div>
    ${TYPES.map(t=>`<button class="nav-item ${currentView===t.key?'active':''}" onclick="navigate('${t.key}')">
      <span class="nav-i">${t.icon}</span><span>${t.label}</span>
      <span class="nav-n">${counts[t.key]||0}</span>
    </button>`).join('')}
    <button class="nav-item ${currentView==='book-notes'?'active':''}" onclick="navigate('book-notes')">
      <span class="nav-i">📝</span><span>文学笔记</span>
      <span class="nav-n">${counts['book-notes']||0}</span>
    </button>
    <button class="nav-item ${currentView==='video-notes'?'active':''}" onclick="navigate('video-notes')">
      <span class="nav-i">📺</span><span>视频笔记</span>
      <span class="nav-n">${counts['video-notes']||0}</span>
    </button>
  `;
}

async function navigate(view, opts){
  opts = opts || {};
  currentView = view;
  renderNav();
  const t = document.getElementById('pageTitle');
  const a = document.getElementById('addBtn');
  await loadRecentConcepts(); // 确保右侧栏有数据
  if(view === 'dashboard'){ t.textContent = '仪表盘'; a.style.display='none'; renderDashboard(); renderRightbar({actions:[]}); }
  else if(view === 'search'){ t.textContent = '搜索'; a.style.display='none'; renderSearch(); renderRightbar({actions:[]}); }
  else if(view === 'graph'){ t.textContent = '知识图谱'; a.style.display='none'; renderGraph(); renderRightbar({actions:[]}); }
  else if(view === 'book-notes'){ currentNotesView = 'book-notes'; t.textContent = '文学笔记'; a.style.display='none'; renderBookNotes(); renderRightbar({actions:[
    {label:'＋ 新建笔记', onclick:'showAddNoteModal()', type:'primary'}
  ]}); }
  else if(view === 'video-notes'){ currentNotesView = 'video-notes'; t.textContent = '视频笔记'; a.style.display='none'; renderVideoNotes(); renderRightbar({actions:[
    {label:'＋ 新建笔记', onclick:'showAddVideoNoteModal()', type:'primary'}
  ]}); }
  else if(view === 'tags'){ t.textContent = '标签'; a.style.display='none'; renderTags(); renderRightbar({actions:[]}); }
  else {
    const ti = TYPE_MAP[view];
    if(ti){
      t.textContent = ti.label;
      a.style.display='inline-flex';
      renderList(view);
      renderRightbar({actions:[
        {label:'＋ 新建', onclick:`openQuickCapture('${view}')`, type:'primary'}
      ]});
    }
  }
  if(opts.push !== false) pushHistory({type:'view', view});
}

async function openDetail(filepath, opts){
  opts = opts || {};
  const it = await get(`/item?path=${encodeURIComponent(decodeURIComponent(filepath))}`);
  if(it.error) return alert('文件未找到');
  const t = TYPE_MAP[it.type];
  let html = `<div class="detail"><span class="detail-back" onclick="history.back()">← 返回${t?.label||''}</span>`;
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
      html += `<div class="detail-section"><h4>📝 文学笔记</h4><div class="detail-links">${notes.map(n=>`<a href="#" onclick="event.preventDefault();openDetail('${encodeURIComponent(n.path)}')">📄 ${ESC(n.title)}</a>`).join(' · ')}</div></div>`;
    }
  }
  if(it.type==='video'){
    const allVideos = await get(`/items?type=video`);
    const notes = allVideos.filter(v => v.type==='video-notes' && v.path.startsWith(it.path.replace(/[^/]+\.md$/,'')));
    if(notes.length){
      html += `<div class="detail-section"><h4>📺 视频笔记</h4><div class="detail-links">${notes.map(n=>`<a href="#" onclick="event.preventDefault();openDetail('${encodeURIComponent(n.path)}')">📄 ${ESC(n.title)}</a>`).join(' · ')}</div></div>`;
    }
  }
  html += `<div class="detail-section"><h4>链接</h4><div class="detail-links">${(it.links||[]).map(l=>`<a href="#" onclick="event.preventDefault();openDetail('${encodeURIComponent(l)}.md')">[[${ESC(l)}]]</a>`).join(' · ')||'无'}</div></div>`;
  if(it.backlinks&&it.backlinks.length) html += `<div class="detail-section"><h4>被以下引用</h4><div class="detail-links">${it.backlinks.map(bl=>`<a href="#" onclick="event.preventDefault();openDetail('${encodeURIComponent(bl.path)}')">← ${ESC(bl.title)} (${TYPE_MAP[bl.type]?.label||bl.type})</a>`).join(' · ')}</div></div>`;
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
      {label:'✏️ 编辑', onclick:`openEdit('${encodeURIComponent(it.path)}')`},
      {label:'🗑 删除', onclick:`deleteItem('${encodeURIComponent(it.path)}')`, type:'danger'}
    ],
    info: infoLines.join('<br>') || null
  });
  if(opts.push !== false) pushHistory({type:'detail', path: filepath});
}

async function deleteItem(filepath){
  const fp = decodeURIComponent(filepath);
  if(!confirm('确定删除此条目？将移到回收站。')) return;
  await del(`/item?path=${encodeURIComponent(fp)}`);
  await loadDashboard();
  navigate(currentView, {push:false});
}

async function openEdit(filepath){
  const fp = decodeURIComponent(filepath);
  const it = await get(`/item?path=${encodeURIComponent(fp)}`);
  const html = `<div class="modal-head"><h3>编辑 ${ESC(it.title)}</h3><button class="modal-close" onclick="closeModal()">×</button></div>
  <div class="modal-body">
    <div class="field"><label>状态</label><select id="f_status">${makeOptions({book:['想读','在读','已读'],video:['想看','已看'],problem:['待解决','解决中','已解决'],plan:['待开始','进行中','已完成'],reflection:['']},it.type,it.status)}</select></div>
    ${it.type==='book'||it.type==='video'?`<div class="field"><label>评分</label><select id="f_rating">${[0,1,2,3,4,5].map(n=>`<option value="${n}" ${n===it.rating?'selected':''}>${'★'.repeat(n)}${'☆'.repeat(5-n)}</option>`).join('')}</select></div>`:''}
    ${it.type==='problem'||it.type==='plan'?`<div class="field"><label>优先级</label><select id="f_priority">${['高','中','低'].map(p=>`<option ${p===it.priority?'selected':''}>${p}</option>`).join('')}</select></div>`:''}
    ${it.type==='reflection'?`<div class="field"><label>心情</label><select id="f_mood">${['😊 开心','😌 平静','😐 一般','😔 低落','😣 痛苦'].map(m=>`<option ${m===it.mood?'selected':''}>${m}</option>`).join('')}</select></div>`:''}
    <div class="field"><label>内容</label><textarea id="f_content" style="min-height:200px">${ESC(it.content||'')}</textarea></div>
  </div>
  <div class="modal-foot"><button class="btn-g" onclick="closeModal()">取消</button><button class="btn-p" onclick="saveEdit('${filepath}')">保存</button></div>`;
  document.getElementById('modal').innerHTML = html;
  document.getElementById('modalMask').classList.add('show');
}

async function saveEdit(filepath){
  const fp = decodeURIComponent(filepath);
  const data = {};
  ['status','rating','priority','mood'].forEach(k=>{
    const el = document.getElementById('f_'+k);
    if(el){ data[k] = k==='rating' ? parseInt(el.value) : el.value; }
  });
  const contentEl = document.getElementById('f_content');
  if(contentEl) data.content = contentEl.value;
  await put('/item', {path: fp, ...data});
  closeModal();
  await loadDashboard();
  clearRecentConceptsCache();
  await loadRecentConcepts();
  openDetail(filepath, {push:false});
}

function openQuickCapture(preselectType){
  const types = [
    {k:'book',l:'书籍',i:'📚'},{k:'video',l:'视频',i:'🎬'},
    {k:'concept',l:'概念',i:'💡'},{k:'reflection',l:'反思',i:'💭'},
    {k:'problem',l:'问题',i:'❓'},{k:'plan',l:'计划',i:'🎯'},
  ];
  const opts = types.map(t=>`<option value="${t.k}" ${t.k===preselectType?'selected':''}>${t.i} ${t.l}</option>`).join('');
  document.getElementById('modal').innerHTML = `
    <div class="modal-head"><h3>📝 快速记录</h3><button class="modal-close" onclick="closeModal()">×</button></div>
    <div class="modal-body">
      <div class="field-row">
        <div class="field"><label>类型</label><select id="qc_type">${opts}</select></div>
        <div class="field"><label>标题 *</label><input type="text" id="qc_title" placeholder="标题"></div>
      </div>
      <div class="field" id="qc_author_f" style="display:none"><label>作者 / 来源</label><input type="text" id="qc_author" placeholder="作者或来源"></div>
      <div class="field" id="qc_domain_f" style="display:none"><label>领域</label><input type="text" id="qc_domain" placeholder="如：学习方法，认知心理学"></div>
      <div class="field" id="qc_source_f" style="display:none"><label>来源引用 [[链接]]</label><input type="text" id="qc_source_ref" placeholder="如 [[2-输入/书籍/《书名》]]"></div>
      <div class="field"><label>内容</label><textarea id="qc_content" placeholder="记下你想记的…" rows="5"></textarea></div>
      <div class="field"><label>标签</label><input type="text" id="qc_tags" placeholder="如：学习方法, 认知科学"></div>
    </div>
    <div class="modal-foot"><button class="btn-g" onclick="closeModal()">取消</button><button class="btn-p" onclick="saveQuickCapture()">保存</button></div>`;
  document.getElementById('modalMask').classList.add('show');
  updateQCFields();
  document.getElementById('qc_type').addEventListener('change', updateQCFields);
}

function updateQCFields(){
  const t = document.getElementById('qc_type').value;
  document.getElementById('qc_author_f').style.display = (t==='book'||t==='video')?'block':'none';
  document.getElementById('qc_domain_f').style.display = (t==='concept'||t==='problem')?'block':'none';
  document.getElementById('qc_source_f').style.display = (t==='concept'||t==='problem'||t==='plan')?'block':'none';
}

async function saveQuickCapture(){
  const t = document.getElementById('qc_type').value;
  const title = document.getElementById('qc_title').value.trim();
  if(!title) return alert('请输入标题');
  const data = {type:t, title};
  if(t==='book'||t==='video') data[t==='book'?'author':'source'] = document.getElementById('qc_author').value.trim();
  if(t==='concept'||t==='problem') data.domain = document.getElementById('qc_domain').value.trim();
  const srcRef = document.getElementById('qc_source_ref').value.trim();
  let content = document.getElementById('qc_content').value.trim();
  if(srcRef) content = srcRef + '\n\n' + content;
  data.content = content;
  const tags = document.getElementById('qc_tags').value;
  data.tags = tags.split(/[,，、]/).map(s=>s.trim()).filter(Boolean);
  const r = await post('/item', data);
  closeModal();
  await loadDashboard();
  navigate(t, {push:false});
}

function closeModal(){ document.getElementById('modalMask').classList.remove('show') }

// ── 新建文学笔记弹窗 ──
function showAddNoteModal(){
  const books = window._bookList || [];
  const bookOptions = books.map(b => `<option value="${ESC(b.title)}">${ESC(b.title)}</option>`).join('');

  document.getElementById('modal').innerHTML = `
    <div class="modal-head"><h3>📝 新建文学笔记</h3><button class="modal-close" onclick="closeModal()">×</button></div>
    <div class="modal-body">
      <div class="form-group" style="margin-bottom:16px">
        <label style="font-size:12px;font-weight:600;color:var(--muted);margin-bottom:6px;display:block">关联书籍</label>
        <div style="display:flex;gap:8px;align-items:center">
          <select id="noteBookSelect" style="flex:1;padding:8px 12px;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--bg);color:var(--text);font-size:13px;outline:none" onchange="onNoteBookChange()">
            <option value="__new__">＋ 输入新书名…</option>
            ${bookOptions}
          </select>
        </div>
        <input id="noteBookInput" type="text" placeholder="输入新书名称" style="display:none;width:100%;padding:8px 12px;margin-top:8px;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--bg);color:var(--text);font-size:13px;outline:none" oninput="autoFillNoteTitle()">
      </div>
      <div class="form-group" style="margin-bottom:16px">
        <label style="font-size:12px;font-weight:600;color:var(--muted);margin-bottom:6px;display:block">笔记标题</label>
        <input id="noteTitleInput" type="text" placeholder="文学笔记标题" style="width:100%;padding:8px 12px;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--bg);color:var(--text);font-size:13px;outline:none">
      </div>
      <div class="form-group">
        <label style="font-size:12px;font-weight:600;color:var(--muted);margin-bottom:6px;display:block">初始内容（可选）</label>
        <textarea id="noteContentInput" placeholder="摘录、金句、随手笔记…" style="width:100%;min-height:100px;padding:10px 12px;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--bg);color:var(--text);font-size:13px;line-height:1.6;resize:vertical;outline:none;font-family:inherit"></textarea>
      </div>
    </div>
    <div class="modal-foot"><button class="btn-g" onclick="closeModal()">取消</button><button class="btn-p" onclick="saveNewNote()">创建</button></div>`;
  document.getElementById('modalMask').classList.add('show');

  if(books.length){
    document.getElementById('noteBookSelect').selectedIndex = 1;
    onNoteBookChange();
  }
}

function onNoteBookChange(){
  const sel = document.getElementById('noteBookSelect');
  const input = document.getElementById('noteBookInput');
  if(sel.value === '__new__'){
    input.style.display = 'block';
    input.focus();
    document.getElementById('noteTitleInput').value = '';
  } else {
    input.style.display = 'none';
    autoFillNoteTitle();
  }
}

function autoFillNoteTitle(){
  const sel = document.getElementById('noteBookSelect');
  let bookName = '';
  if(sel.value === '__new__'){
    bookName = document.getElementById('noteBookInput').value.trim();
  } else {
    bookName = sel.value;
  }
  const titleInput = document.getElementById('noteTitleInput');
  if(bookName && (!titleInput.value || titleInput.value.endsWith('-文学笔记'))){
    titleInput.value = bookName + '-文学笔记';
  }
}

async function saveNewNote(){
  const sel = document.getElementById('noteBookSelect');
  let parent = '';
  if(sel.value === '__new__'){
    parent = document.getElementById('noteBookInput').value.trim();
    if(!parent){ alert('请输入书名或选择已有书籍'); return; }
  } else {
    parent = sel.value;
  }
  const title = document.getElementById('noteTitleInput').value.trim() || (parent + '-文学笔记');
  const content = document.getElementById('noteContentInput').value.trim();

  try{
    await post('/item', {type:'book-notes', title:title, parent:parent, content:content});
    closeModal();
    await loadDashboard();
    await renderBookNotes();
  }catch(e){
    alert('创建失败：' + e.message);
  }
}

// ── 新建视频笔记弹窗 ──
function showAddVideoNoteModal(){
  const videos = window._videoList || [];
  const videoOptions = videos.map(v => `<option value="${ESC(v.title)}">${ESC(v.title)}</option>`).join('');

  document.getElementById('modal').innerHTML = `
    <div class="modal-head"><h3>📺 新建视频笔记</h3><button class="modal-close" onclick="closeModal()">×</button></div>
    <div class="modal-body">
      <div class="form-group" style="margin-bottom:16px">
        <label style="font-size:12px;font-weight:600;color:var(--muted);margin-bottom:6px;display:block">关联视频</label>
        <div style="display:flex;gap:8px;align-items:center">
          <select id="noteVideoSelect" style="flex:1;padding:8px 12px;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--bg);color:var(--text);font-size:13px;outline:none" onchange="onNoteVideoChange()">
            <option value="__new__">＋ 输入新视频名…</option>
            ${videoOptions}
          </select>
        </div>
        <input id="noteVideoInput" type="text" placeholder="输入新视频名称" style="display:none;width:100%;padding:8px 12px;margin-top:8px;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--bg);color:var(--text);font-size:13px;outline:none" oninput="autoFillVideoNoteTitle()">
      </div>
      <div class="form-group" style="margin-bottom:16px">
        <label style="font-size:12px;font-weight:600;color:var(--muted);margin-bottom:6px;display:block">笔记标题</label>
        <input id="noteVideoTitleInput" type="text" placeholder="视频笔记标题" style="width:100%;padding:8px 12px;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--bg);color:var(--text);font-size:13px;outline:none">
      </div>
      <div class="form-group">
        <label style="font-size:12px;font-weight:600;color:var(--muted);margin-bottom:6px;display:block">初始内容（可选）</label>
        <textarea id="noteVideoContentInput" placeholder="摘录、金句、随手笔记…" style="width:100%;min-height:100px;padding:10px 12px;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--bg);color:var(--text);font-size:13px;line-height:1.6;resize:vertical;outline:none;font-family:inherit"></textarea>
      </div>
    </div>
    <div class="modal-foot"><button class="btn-g" onclick="closeModal()">取消</button><button class="btn-p" onclick="saveNewVideoNote()">创建</button></div>`;
  document.getElementById('modalMask').classList.add('show');

  if(videos.length){
    document.getElementById('noteVideoSelect').selectedIndex = 1;
    onNoteVideoChange();
  }
}

function onNoteVideoChange(){
  const sel = document.getElementById('noteVideoSelect');
  const input = document.getElementById('noteVideoInput');
  if(sel.value === '__new__'){
    input.style.display = 'block';
    input.focus();
    document.getElementById('noteVideoTitleInput').value = '';
  } else {
    input.style.display = 'none';
    autoFillVideoNoteTitle();
  }
}

function autoFillVideoNoteTitle(){
  const sel = document.getElementById('noteVideoSelect');
  let videoName = '';
  if(sel.value === '__new__'){
    videoName = document.getElementById('noteVideoInput').value.trim();
  } else {
    videoName = sel.value;
  }
  const titleInput = document.getElementById('noteVideoTitleInput');
  if(videoName && (!titleInput.value || titleInput.value.endsWith('-视频笔记'))){
    titleInput.value = videoName + '-视频笔记';
  }
}

async function saveNewVideoNote(){
  const sel = document.getElementById('noteVideoSelect');
  let parent = '';
  if(sel.value === '__new__'){
    parent = document.getElementById('noteVideoInput').value.trim();
    if(!parent){ alert('请输入视频名或选择已有视频'); return; }
  } else {
    parent = sel.value;
  }
  const title = document.getElementById('noteVideoTitleInput').value.trim() || (parent + '-视频笔记');
  const content = document.getElementById('noteVideoContentInput').value.trim();

  try{
    await post('/item', {type:'video-notes', title:title, parent:parent, content:content});
    closeModal();
    await loadDashboard();
    await renderVideoNotes();
  }catch(e){
    alert('创建失败：' + e.message);
  }
}

let searchTimer;
async function renderSearch(){
  const q = document.getElementById('searchBox').value.trim();
  if(!q) return document.getElementById('content').innerHTML = `<div class="empty"><div class="big">🔍</div>输入关键词搜索</div>`;
  const results = await get(`/search?q=${encodeURIComponent(q)}`);
  if(!results.length) return document.getElementById('content').innerHTML = `<div class="empty"><div class="big">🔍</div>没有找到「${ESC(q)}」</div>`;
  document.getElementById('content').innerHTML = `<p style="color:var(--muted);margin-bottom:14px">找到 ${results.length} 条结果</p>` + results.map(r=>`<div class="panel" style="cursor:pointer" onclick="openDetail('${encodeURIComponent(r.path)}')">
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:5px">
      <span class="type-badge ${TYPE_MAP[r.type]?.typeCls||''}">${TYPE_MAP[r.type]?.label||r.type}</span>
      <span style="font-size:12px;color:var(--faint)">${FMTREL(r.mtime)}</span>
    </div>
    <div style="font-size:13.5px;font-weight:600">${ESC(r.title)}</div>
    <div style="font-size:12px;color:var(--muted);margin-top:4px">${ESC(r.snippet||'')}</div>
  </div>`).join('');
}

// 侧边栏搜索
document.getElementById('searchBox').addEventListener('input', function(){
  if(currentView==='search') renderSearch();
});

// 启动
(async function init(){
  try{
    await loadDashboard();
    await loadRecentConcepts();
    renderNav();
    renderDashboard();
    history.replaceState({type:'view', view:'dashboard'}, '');
    renderRightbar({actions:[]});
  }catch(e){
    document.getElementById('content').innerHTML =
      '<div class="empty"><div class="big">🔴</div>无法连接服务<p style="margin-top:10px;color:var(--faint)">请先双击运行「启动知识库.bat」</p></div>';
  }
  updateApiStatus();
})();
