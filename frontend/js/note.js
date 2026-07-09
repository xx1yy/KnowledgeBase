// Notes (book-notes & video-notes)
let currentNotePath = null;
let currentNoteData = null;
let currentNotesView = null;
let currentBookFilter = null;
// 文学笔记排序状态（持久化到 localStorage）
let noteSortMode = localStorage.getItem('kb_noteSortMode') || 'mtime'; // mtime|ctime|title
let noteManualSort = localStorage.getItem('kb_noteManualSort') === '1';
let _dragPath = null;

async function loadSourcesForConcept(conceptName){
  const el = document.getElementById('conceptSources');
  if(!el) return;
  try{
    const [bookNotes, videoNotes] = await Promise.all([
      get('/items?type=book-notes').catch(()=>[]),
      get('/items?type=video-notes').catch(()=>[])
    ]);
    const allNotes = [...(Array.isArray(bookNotes)?bookNotes:[]), ...(Array.isArray(videoNotes)?videoNotes:[])];
    const sources = allNotes.filter(n => (n.concepts||[]).includes(conceptName));
    if(!sources.length){
      el.innerHTML = '<span style="color:var(--faint)">暂无关联笔记</span>';
      return;
    }
    const iconMap = {'book-notes':'📝','video-notes':'📺'};
    el.innerHTML = sources.map(n => {
      const parent = n.path.split('/').slice(-2,-1)[0] || '未知';
      return `<a href="#" onclick="event.preventDefault();openDetail('${encodeURIComponent(n.path)}')" style="display:inline-flex;align-items:center;gap:4px;margin-right:8px;margin-bottom:4px">${iconMap[n.type]||'📄'} ${ESC(parent)} — ${ESC(String(n.title||'').replace(/-文学笔记|-视频笔记/g,''))}</a>`;
    }).join('');
  }catch(e){
    el.innerHTML = '<span style="color:var(--faint)">加载失败</span>';
  }
}

async function renderBookNotes(){
  let data;
  try{ data = await get('/items?type=book-notes'); }
  catch(e){ data = []; }
  const notes = data.filter(it => it.type === 'book-notes');

  let books = [];
  try{ books = await get('/items?type=book'); }catch(e){}
  books = books.filter(b => b.type === 'book');
  window._bookList = books;
  window._allBookNotes = notes;

  if(!notes.length){
    document.getElementById('content').innerHTML = `<div class="empty"><div class="big">📝</div>还没有文学笔记<br><span style="font-size:12px;color:var(--faint);margin-bottom:16px;display:block">添加书籍时会自动创建，也可以手动新建</span><button class="btn-p" onclick="showAddNoteModal()">＋ 新建文学笔记</button></div>`;
    return;
  }

  // 按书籍子文件夹分组笔记
  const byFolder = {};
  notes.forEach(n => {
    const folder = n.path.split('/').slice(-2, -1)[0] || '未分类';
    if(!byFolder[folder]) byFolder[folder] = [];
    byFolder[folder].push(n);
  });
  window._bookNotesByFolder = byFolder;

  const bookFolders = new Set(books.map(b => b.path.split('/').slice(-2, -1)[0]));
  const folderTitles = {};
  books.forEach(b => { folderTitles[b.path.split('/').slice(-2, -1)[0]] = b.title; });
  const orphanFolders = Object.keys(byFolder).filter(f => !bookFolders.has(f));
  orphanFolders.forEach(f => { folderTitles[f] = '未归类'; });
  window._bookFolderTitles = folderTitles;

  const entries = [
    ...books.map(b => ({folder: b.path.split('/').slice(-2, -1)[0], title: b.title})),
    ...orphanFolders.map(f => ({folder: f, title: '未归类'}))
  ];

  document.getElementById('content').innerHTML = `
    <div class="notes-layout">
      <div class="notes-sidebar" id="bookList">
        <div class="nb-head"><button class="nb-toggle" onclick="toggleBooks()" title="收起/展开书籍栏">«</button></div>
        <button class="btn-p" style="width:100%;margin-bottom:8px;justify-content:center" onclick="showAddNoteModal()">＋ 新建文学笔记</button>
        <div class="distill-summary">${notes.length}篇 · ${notes.filter(n=>(n.concepts||[]).length).length}篇已提炼 · ${notes.reduce((s,n)=>s+(n.concepts||[]).length,0)}概念</div>
        ${entries.map(e => `
          <div class="book-item" data-folder="${ESC(e.folder)}" onclick="selectBook('${ESC(e.folder)}')">
            <span class="bi">📚</span>
            <span class="bt">${ESC(e.title)}</span>
            <span class="bc">${(byFolder[e.folder]||[]).length}</span>
          </div>`).join('')}
      </div>
      <div class="chapter-bar" id="chapterBar"></div>
      <div class="notes-reader" id="noteReader">
        <div class="empty"><div class="big">📖</div>选择左侧书籍与章节开始阅读</div>
      </div>
    </div>`;

  if(entries.length){
    selectBook(entries[0].folder, {loadFirst:true});
  }
}

// ── 分章节栏：书籍选择 + 章节渲染 ──
function chapterKey(s){
  const m = s.match(/\d+/);
  return m ? parseInt(m[0], 10) : 9999;
}
function chapterCompare(a, b){
  const ka = chapterKey(a), kb = chapterKey(b);
  if(ka !== kb) return ka - kb;
  return a.localeCompare(b, 'zh');
}
function noteItemHtml(n, folder, ch){
  const cc = (n.concepts||[]).length;
  const fp = n.path.replace(/[^a-zA-Z0-9]/g, '');
  const drag = noteManualSort
    ? ` draggable="true" ondragstart="noteDragStart(event,'${encodeURIComponent(n.path)}')" ondragover="noteDragOver(event)" ondragend="noteDragEnd(event)" ondrop="noteDrop(event,'${encodeURIComponent(folder||'')}','${encodeURIComponent(ch||'')}','${encodeURIComponent(n.path)}')"`
    : '';
  return `<div class="note-item${noteManualSort?' draggable':''}" id="ni-${fp}"${drag} onclick="loadNoteContent('${encodeURIComponent(n.path)}')">
    <div class="nt">${ESC(String(n.title||'').replace(/-文学笔记$/,''))}${cc?`<span class="concept-badge">💡${cc}</span>`:''}</div>
    <div class="nd">${FMTREL(n.mtime)}</div>
  </div>`;
}
function selectBook(folder, opts){
  opts = opts || {};
  currentBookFilter = folder;
  document.querySelectorAll('.book-item').forEach(el => {
    el.classList.toggle('active', el.dataset.folder === folder);
  });
  renderChapterBar(folder);
  if(opts.loadFirst){
    const ns = (window._bookNotesByFolder[folder] || []);
    if(ns.length) loadNoteContent(encodeURIComponent(ns[0].path), {push:false});
  }
}
function renderChapterBar(folder){
  const bar = document.getElementById('chapterBar');
  if(!bar) return;
  const bookNotes = window._bookNotesByFolder[folder] || [];
  const bookTitle = window._bookFolderTitles[folder] || folder;
  if(!bookNotes.length){
    bar.innerHTML = `<div class="chapter-bar-h"><span class="cb-title">📚 ${ESC(bookTitle)}</span><button class="ch-toggle" onclick="toggleChapters()" title="收起/展开章节栏">«</button></div><div class="chapter-empty">📭 ${ESC(bookTitle)} 还没有笔记</div>`;
    return;
  }
  // 按章节分组
  const groups = {};
  bookNotes.forEach(n => {
    const ch = n.chapter || '未分章';
    if(!groups[ch]) groups[ch] = [];
    groups[ch].push(n);
  });
  const names = Object.keys(groups).sort(chapterCompare);
  // 笔记排序：手动模式按 order，否则按所选自动模式
  const notesOf = (ch) => {
    const arr = groups[ch].slice();
    if(noteManualSort){
      return arr.sort((a, b) =>
        ((a.order != null ? a.order : 1e9) - (b.order != null ? b.order : 1e9)) ||
        String(a.title||'').localeCompare(String(b.title||''), 'zh'));
    }
    return sortNotes(arr, noteSortMode);
  };
  bar.innerHTML = `
    <div class="chapter-bar-h"><span class="cb-title">📚 ${ESC(bookTitle)}</span><button class="ch-toggle" onclick="toggleChapters()" title="收起/展开章节栏">«</button></div>
    <div class="chapter-bar-sub">${bookNotes.length}篇 · ${names.length}个章节</div>
    <div class="sort-bar ${noteManualSort?'manual':''}">
      <select id="noteSortSel" onchange="changeNoteSort(this.value)" ${noteManualSort?'disabled':''}>
        <option value="mtime" ${noteSortMode==='mtime'?'selected':''}>按修改时间 新→旧</option>
        <option value="ctime" ${noteSortMode==='ctime'?'selected':''}>按创建时间 新→旧</option>
        <option value="title" ${noteSortMode==='title'?'selected':''}>按标题 A→Z</option>
      </select>
      ${noteManualSort
        ? `<button class="btn-p sm" onclick="toggleNoteManualSort(false)">↺ 恢复自动</button><span class="sort-hint">✋ 拖拽笔记调整顺序</span>`
        : `<button class="btn-g sm" onclick="toggleNoteManualSort(true)">✋ 手动排序</button>`}
    </div>
    ${names.map(ch => `
      <div class="chapter-group">
        <div class="chapter-h2" onclick="loadChapterFirst('${ESC(folder)}','${ESC(ch)}')"><span class="ch-dot">📖</span><span class="ch-name">${ESC(ch)}</span><span class="ch-count">${groups[ch].length}</span></div>
        ${notesOf(ch).map(n => noteItemHtml(n, folder, ch)).join('')}
      </div>`).join('')}
  `;
}

// ── 排序辅助 ──
function sortNotes(list, mode){
  const a = list.slice();
  if(mode === 'title'){
    a.sort((x, y) => String(x.title||'').localeCompare(String(y.title||''), 'zh'));
  } else if(mode === 'ctime'){
    a.sort((x, y) => String(x.created||'').localeCompare(String(y.created||'')));
  } else {
    a.sort((x, y) => (y.mtime||0) - (x.mtime||0)); // 默认：修改时间 新→旧
  }
  return a;
}
function changeNoteSort(mode){
  noteSortMode = mode;
  localStorage.setItem('kb_noteSortMode', mode);
  if(currentBookFilter) renderChapterBar(currentBookFilter);
}
function toggleNoteManualSort(on){
  noteManualSort = !!on;
  localStorage.setItem('kb_noteManualSort', on ? '1' : '0');
  if(currentBookFilter) renderChapterBar(currentBookFilter);
}
function noteDragStart(e, enc){
  _dragPath = decodeURIComponent(enc);
  e.currentTarget.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
  try{ e.dataTransfer.setData('text/plain', _dragPath); }catch(_){}
}
function noteDragOver(e){
  if(!noteManualSort) return;
  e.preventDefault();
  const el = e.currentTarget;
  const r = el.getBoundingClientRect();
  const after = (e.clientY - r.top) > r.height / 2;
  el.classList.toggle('drop-after', after);
  el.classList.toggle('drop-before', !after);
}
function noteDragEnd(e){
  document.querySelectorAll('.note-item').forEach(el =>
    el.classList.remove('dragging', 'drop-before', 'drop-after'));
}
async function noteDrop(e, encFolder, encCh, encTarget){
  e.preventDefault();
  const folder = decodeURIComponent(encFolder);
  const ch = decodeURIComponent(encCh);
  const target = decodeURIComponent(encTarget);
  document.querySelectorAll('.note-item').forEach(el =>
    el.classList.remove('dragging', 'drop-before', 'drop-after'));
  const dragged = _dragPath;
  _dragPath = null;
  if(!dragged || dragged === target) return;
  const arr = (window._bookNotesByFolder[folder] || [])
    .filter(n => (n.chapter || '未分章') === ch);
  const item = arr.find(n => n.path === dragged);
  if(!item) return;
  const without = arr.filter(n => n.path !== dragged);
  let pos = without.findIndex(n => n.path === target);
  if(pos < 0) pos = without.length - 1;
  const r = e.currentTarget.getBoundingClientRect();
  const after = (e.clientY - r.top) > r.height / 2;
  without.splice(after ? pos + 1 : pos, 0, item);
  await assignChapterOrder(folder, ch, without);
}
async function assignChapterOrder(folder, ch, ordered){
  ordered.forEach((n, i) => { n.order = i; });
  for(const n of ordered){
    try{ await put('/item', {path: n.path, order: n.order}); }catch(_){}
  }
  ordered.forEach(n => {
    const g = (window._bookNotesByFolder[folder] || []).find(x => x.path === n.path);
    if(g) g.order = n.order;
  });
  renderChapterBar(folder);
}

function toggleBooks(){
  const lay = document.querySelector('.notes-layout');
  if(lay) lay.classList.toggle('books-collapsed');
}
function toggleChapters(){
  const lay = document.querySelector('.notes-layout');
  if(lay) lay.classList.toggle('chapters-collapsed');
}
function loadChapterFirst(folder, ch){
  const ns = (window._bookNotesByFolder[folder] || []).filter(n => (n.chapter || '未分章') === ch);
  if(ns.length) loadNoteContent(encodeURIComponent(ns[0].path), {push:true});
}

async function renderVideoNotes(){
  let data;
  try{ data = await get('/items?type=video-notes'); }
  catch(e){ data = []; }
  const notes = data.filter(it => it.type === 'video-notes');

  let videos = [];
  try{ videos = await get('/items?type=video'); }catch(e){}
  videos = videos.filter(v => v.type === 'video');
  window._videoList = videos;

  if(!notes.length){
    document.getElementById('content').innerHTML = `<div class="empty"><div class="big">📺</div>还没有视频笔记<br><span style="font-size:12px;color:var(--faint);margin-bottom:16px;display:block">添加视频时会自动创建，也可以手动新建</span><button class="btn-p" onclick="showAddVideoNoteModal()">＋ 新建视频笔记</button></div>`;
    return;
  }

  const grouped = {};
  notes.forEach(n => {
    const parts = n.path.split('/');
    const videoFolder = parts[parts.length - 2] || '未分类';
    if(!grouped[videoFolder]) grouped[videoFolder] = [];
    grouped[videoFolder].push(n);
  });

  document.getElementById('content').innerHTML = `
    <div class="notes-layout">
      <div class="notes-sidebar" id="notesList">
        <button class="btn-p" style="width:100%;margin-bottom:8px;justify-content:center" onclick="showAddVideoNoteModal()">＋ 新建视频笔记</button>
        <div class="distill-summary">${notes.length}篇笔记 · ${notes.filter(n=>(n.concepts||[]).length).length}篇已提炼 · ${notes.reduce((s,n)=>s+(n.concepts||[]).length,0)}个概念</div>
        ${Object.entries(grouped).map(([video, videoNotes]) => `
          <div class="note-group">
            <div class="note-group-h">🎬 ${ESC(video)}</div>
            ${videoNotes.map(n => {
              const cc = (n.concepts||[]).length;
              return `
              <div class="note-item" id="ni-${n.path.replace(/[^a-zA-Z0-9]/g,'')}" onclick="loadNoteContent('${encodeURIComponent(n.path)}')">
                <div class="nt">${ESC(String(n.title||'').replace(/-视频笔记$/,''))}${cc?`<span class="concept-badge">💡${cc}</span>`:''}</div>
                <div class="nd">${FMTREL(n.mtime)}</div>
              </div>`;
            }).join('')}
          </div>
        `).join('')}
      </div>
      <div class="notes-reader" id="noteReader">
        <div class="empty"><div class="big">📺</div>选择左侧笔记开始阅读</div>
      </div>
    </div>`;

  if(notes.length){
    loadNoteContent(encodeURIComponent(notes[0].path), {push:false});
  }
}

async function loadNoteContent(filepath, opts){
  opts = opts || {};
  const fp = decodeURIComponent(filepath);
  currentNotePath = fp;

  document.querySelectorAll('.note-item').forEach(el => el.classList.remove('active'));
  const ni = document.getElementById('ni-' + fp.replace(/[^a-zA-Z0-9]/g,''));
  if(ni) ni.classList.add('active');

  let it;
  try{ it = await get('/item?path=' + encodeURIComponent(fp)); }
  catch(e){ document.getElementById('noteReader').innerHTML = '<div class="empty">加载失败</div>'; return; }
  currentNoteData = it;

  const parentName = fp.split('/').slice(-2,-1)[0] || '';
  const noteType = it.type || 'book-notes';
  const isVideo = noteType === 'video-notes';
  const icon = isVideo ? '🎬' : '📚';
  const badgeCls = isVideo ? 'type-video' : 'type-book';
  const conceptCount = (it.concepts||[]).length;
  document.getElementById('noteReader').innerHTML = `
    <div class="note-reader-card">
      <div class="note-reader-toolbar">
        <span class="type-badge ${badgeCls}">${icon} ${ESC(parentName)}</span>
        ${it.chapter ? `<span class="type-badge badge-gray">📖 ${ESC(it.chapter)}</span>` : ''}
        ${conceptCount ? `<span class="concept-badge">💡 ${conceptCount}个概念</span>` : ''}
        <span style="font-size:11px;color:var(--faint);margin-left:auto">更新于 ${FMT(it.updated||it.mtime)}</span>
      </div>
      <div id="noteReadMode">
        <h1 style="font-size:21px;font-weight:700;margin-bottom:12px">${ESC(it.title)}</h1>
        ${renderNoteContent(it.content)}
        <div id="noteConceptsSection"></div>
      </div>
      <div id="noteEditMode" style="display:none">
        <div class="field" style="margin-bottom:12px">
          <label style="font-size:12px;font-weight:600;color:var(--muted);margin-bottom:5px;display:block">笔记标题</label>
          <input type="text" id="noteTitleEdit" value="${ESC(it.title)}" style="width:100%;padding:8px 12px;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--bg);color:var(--text);font-size:14px;font-weight:600;outline:none;box-sizing:border-box">
        </div>
        <div class="field" style="margin-bottom:12px">
          <label style="font-size:12px;font-weight:600;color:var(--muted);margin-bottom:5px;display:block">章节（可选）</label>
          <input type="text" id="noteChapterEdit" value="${ESC(it.chapter||'')}" placeholder="如：第3章 记忆（留空归入「未分章」）" style="width:100%;padding:8px 12px;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--bg);color:var(--text);font-size:13px;outline:none;box-sizing:border-box">
        </div>
        <div class="note-edit-toolbar">
          <button class="btn-g sm" id="insertImgBtn" type="button" onclick="triggerImageUpload()">🖼 插入图片</button>
          <span class="extract-hint" style="margin:0">图片存入知识库「附件」目录，以 ![[附件/名称]] 引用</span>
          <input type="file" id="imgFileInput" accept="image/*" style="display:none" onchange="onImageSelected(this)">
        </div>
        <textarea class="note-editor" id="noteTextarea">${ESC(it.content||'')}</textarea>
        <div style="display:flex;gap:8px;margin-top:12px;justify-content:flex-end">
          <button class="btn-g" onclick="cancelNoteEdit()">取消</button>
          <button class="btn-p" onclick="saveNoteContent()">💾 保存</button>
        </div>
      </div>
    </div>`;

  // 加载概念到主内容区和右侧栏
  const conceptNames = it.concepts || [];
  if(conceptNames.length > 0){
    loadConceptsForNote(conceptNames);
  }
  refreshNoteRightbar(conceptNames, fp, isVideo, parentName, conceptCount, it);
  if(opts.push !== false) pushHistory({type:'note', path: filepath});
}

async function loadConceptsForNote(conceptNames){
  if(!conceptNames || !conceptNames.length) return;
  const section = document.getElementById('noteConceptsSection');
  if(!section) return;
  section.innerHTML = '<div style="padding:10px 0;color:var(--faint)">加载概念…</div>';
  try{
    const allConcepts = await get('/items?type=concept');
    const matched = allConcepts.filter(c => conceptNames.some(n => n === c.title));
    if(!matched.length){
      section.innerHTML = '';
      return;
    }
    section.innerHTML = `
      <div style="margin-top:20px;padding-top:16px;border-top:1px solid var(--border)">
        <h4 style="font-size:11.5px;font-weight:700;color:var(--faint);text-transform:uppercase;letter-spacing:.4px;margin-bottom:8px">💡 已提取的概念</h4>
        <div style="display:flex;flex-wrap:wrap;gap:6px">
          ${matched.map(c => {
            const count = (c.excerpt ? 1 : 0) + (c.definition ? 1 : 0) + (c.how_to_use ? 1 : 0);
            const fill = count >= 3 ? 'var(--accent)' : count >= 1 ? 'var(--orange)' : 'var(--faint)';
            const tip = count >= 3 ? '完整' : count >= 1 ? '部分' : '仅名称';
            return `<a href="#" onclick="event.preventDefault();showConceptPage('${encodeURIComponent(c.path)}')"
              style="display:inline-flex;align-items:center;gap:4px;padding:4px 10px;background:var(--asoft);color:var(--accent);border-radius:var(--radius-sm);font-size:12.5px;font-weight:500;text-decoration:none;transition:all .12s"
              onmouseover="this.style.background='var(--accent)';this.style.color='#fff'"
              onmouseout="this.style.background='var(--asoft)';this.style.color='var(--accent)'"
              title="${tip}提炼">
              <span style="width:6px;height:6px;border-radius:50%;background:${fill};flex-shrink:0"></span>
              ${ESC(c.title)}
            </a>`;
          }).join('')}
        </div>
      </div>`;
  }catch(e){
    section.innerHTML = '';
  }
}

async function refreshNoteRightbar(conceptNames, fp, isVideo, parentName, conceptCount, it){
  const actions = [
    {label:'💡 提取概念', onclick:'showExtractConcept()', type:'primary'},
    {label:'✏️ 编辑笔记', onclick:'toggleNoteEdit()'},
    {label:'🗑 删除笔记', onclick:`deleteItem('${encodeURIComponent(fp)}')`, type:'danger'}
  ];
  const info = `类型：${isVideo?'视频笔记':'文学笔记'}<br>来源：${parentName}<br>概念：${conceptCount}个<br>更新：${FMT(it.updated||it.mtime)}`;

  let conceptItems = [];
  if(conceptNames.length > 0){
    try{
      const allConcepts = await get('/items?type=concept');
      const matched = allConcepts.filter(c => conceptNames.includes(c.title));
      conceptItems = matched.map(c => {
        const count = (c.excerpt ? 1 : 0) + (c.definition ? 1 : 0) + (c.how_to_use ? 1 : 0);
        const fill = count >= 3 ? 'var(--accent)' : count >= 1 ? 'var(--orange)' : 'var(--faint)';
        return {path: c.path, title: c.title, fill};
      });
    }catch(e){}
  }

  renderRightbar({actions, concepts: conceptItems, info});
  window.noteRightbarCtx = {actions, concepts: conceptItems, info};
}

function toggleNoteEdit(){
  document.getElementById('noteReadMode').style.display = 'none';
  document.getElementById('noteEditMode').style.display = 'block';
}

function cancelNoteEdit(){
  document.getElementById('noteReadMode').style.display = 'block';
  document.getElementById('noteEditMode').style.display = 'none';
}

async function saveNoteContent(){
  if(!currentNotePath) return;
  const content = document.getElementById('noteTextarea').value;
  const titleEl = document.getElementById('noteTitleEdit');
  const title = titleEl ? titleEl.value.trim() : '';
  const chapterEl = document.getElementById('noteChapterEdit');
  const chapter = chapterEl ? chapterEl.value.trim() : '';
  const data = {path: currentNotePath, content: content, chapter: chapter};
  if(title) data.title = title;
  try{
    await put('/item', data);
    const ni = document.getElementById('ni-' + currentNotePath.replace(/[^a-zA-Z0-9]/g,''));
    if(ni){
      const nt = ni.querySelector('.nt');
      if(nt) nt.textContent = (title || '').replace(/-文学笔记$/,'').replace(/-视频笔记$/,'');
    }
    await loadNoteContent(encodeURIComponent(currentNotePath), {push:false});
    await loadDashboard();
    renderNav();
  }catch(e){
    alert('保存失败：' + e.message);
  }
}

async function showExtractConcept(filepath, opts){
  opts = opts || {};
  let fp = filepath || currentNotePath;
  if(!fp){ alert('请先选择一篇笔记'); return; }
  if(!currentNoteData || currentNotePath !== fp){
    try{ currentNoteData = await get('/item?path=' + encodeURIComponent(fp)); currentNotePath = fp; }
    catch(e){ alert('加载笔记失败'); return; }
  }
  const it = currentNoteData;
  const parentName = fp ? fp.split('/').slice(-2,-1)[0] || '' : '';
  const noteType = it.type || 'book-notes';
  const isVideo = noteType === 'video-notes';
  const icon = isVideo ? '🎬' : '📚';

  // 更新右侧栏
  renderRightbar({
    actions: [
      {label:'← 返回笔记', onclick:'history.back()'},
      {label:'💡 创建概念', onclick:`saveExtractedConcept('${ESC(parentName)}','${encodeURIComponent(fp)}')`, type:'primary'}
    ],
    info: `来源：${parentName}<br>步骤：①摘录 → ②命名 → ③定义 → ④解释 → ⑤用法`
  });

  document.getElementById('noteReader').innerHTML = `
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px">
      <span class="type-badge ${isVideo ? 'type-video' : 'type-book'}">${icon} ${ESC(parentName)}</span>
      <span style="font-size:13px;font-weight:600;color:var(--muted)">💡 从笔记提取概念</span>
    </div>
    <div class="extract-split" id="extractSplit">
      <div class="extract-split-left">
        <h1>${ESC(it.title)}</h1>
        ${renderNoteContent(it.content)}
      </div>
      <div class="extract-resizer" id="splitResizer"></div>
      <div class="extract-split-right">
        <div style="margin-bottom:14px;padding:8px 12px;background:var(--asoft);border-radius:var(--radius-sm);font-size:11.5px;color:var(--muted)">
          📚 来源：<strong style="color:var(--accent)">${ESC(parentName)}</strong>
        </div>

        <div class="extract-step">① 原文摘录</div>
        <textarea class="extract-area" id="xc_excerpt" style="min-height:100px;margin-bottom:3px" placeholder="← 从左侧笔记中选中文字复制过来"></textarea>
        <div class="extract-hint" style="margin-bottom:12px">从左边笔记复制一段有价值的段落</div>

        <div class="extract-step">② 概念名称</div>
        <input class="extract-input" id="xc_name" type="text" style="margin-bottom:3px" placeholder="例：智力的可塑性">
        <div class="extract-hint" style="margin-bottom:12px">用一个名词短语概括</div>

        <div class="extract-step">③ 一句话定义</div>
        <input class="extract-input" id="xc_definition" type="text" style="margin-bottom:3px" placeholder="例：智力不是固定的，可以通过训练改变">
        <div class="extract-hint" style="margin-bottom:12px">不超过20字，像字典词条</div>

        <div class="extract-step">④ 核心解释</div>
        <textarea class="extract-area" id="xc_content" style="min-height:140px;margin-bottom:3px" placeholder="用自己的话展开说明"></textarea>
        <div class="extract-hint" style="margin-bottom:12px">基于摘录改写，不要直接复制</div>

        <div class="extract-step">⑤ 怎么用 <span style="color:var(--faint);font-weight:400">（可选）</span></div>
        <textarea class="extract-area" id="xc_howto" style="min-height:80px;margin-bottom:3px" placeholder="什么场景下能帮到你？"></textarea>
        <div class="extract-hint" style="margin-bottom:12px">想象一个具体场景</div>

        <div class="extract-step">标签 <span style="color:var(--faint);font-weight:400">（可选）</span></div>
        <input class="extract-input" id="xc_tags" type="text" placeholder="逗号分隔，例：心理学, 认知">
      </div>
    </div>`;
  if(typeof initSplitResizer === 'function') initSplitResizer();
  if(opts.push !== false) pushHistory({type:'extract', path: fp});
}

async function saveExtractedConcept(bookName, notePath){
  const name = document.getElementById('xc_name').value.trim();
  if(!name){ alert('请填写概念名称'); return; }

  const excerpt = document.getElementById('xc_excerpt').value.trim();
  const definition = document.getElementById('xc_definition').value.trim();
  const content = document.getElementById('xc_content').value.trim();
  const howto = document.getElementById('xc_howto').value.trim();
  const tagsRaw = document.getElementById('xc_tags').value.trim();
  const tags = tagsRaw.split(/[,，、]/).map(s=>s.trim()).filter(Boolean);

  const conceptData = {
    type: 'concept',
    title: name,
    definition: definition || '一句话定义',
    content: content || '',
    excerpt: excerpt || '',
    how_to_use: howto || '',
    source: bookName,
    tags: tags
  };

  try{
    await post('/item', conceptData);

    const fp = decodeURIComponent(notePath);
    let note;
    try{ note = await get('/item?path=' + encodeURIComponent(fp)); }catch(e){ note = null; }
    if(note){
      const concepts = note.concepts || [];
      if(!concepts.includes(name)){
        concepts.push(name);
        await put('/item', {path: fp, concepts: concepts});
      }
    }

    await loadDashboard();
    clearRecentConceptsCache();
    await loadRecentConcepts();
    if(currentNotesView === 'video-notes'){
      await renderVideoNotes();
    } else {
      await renderBookNotes();
      const folder = decodeURIComponent(notePath).split('/').slice(-2, -1)[0];
      if(folder) selectBook(folder, {loadFirst:false});
    }
    if(notePath) loadNoteContent(notePath, {push:false});
  }catch(e){
    alert('创建失败：' + e.message);
  }
}

// ── 图片插入 ───────────────────────────────────────────
function triggerImageUpload(){
  const inp = document.getElementById('imgFileInput');
  if(inp) inp.click();
}
function readFileAsDataURL(file){
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}
function insertAtCursor(ta, text){
  const start = ta.selectionStart != null ? ta.selectionStart : ta.value.length;
  const end = ta.selectionEnd != null ? ta.selectionEnd : ta.value.length;
  ta.value = ta.value.slice(0, start) + text + ta.value.slice(end);
  const pos = start + text.length;
  ta.focus();
  ta.setSelectionRange(pos, pos);
}
async function uploadAndInsert(file, filename){
  if(!file) return;
  const btn = document.getElementById('insertImgBtn');
  const oldLabel = btn ? btn.textContent : '插入图片';
  if(btn){ btn.disabled = true; btn.textContent = '上传中…'; }
  try{
    const dataUrl = await readFileAsDataURL(file);
    const res = await post('/upload', {filename: filename || file.name || 'pasted.png', content: dataUrl});
    const ta = document.getElementById('noteTextarea');
    if(ta && res && res.path){
      insertAtCursor(ta, `![[${res.path}]]`);
    }
  }catch(e){
    alert('图片上传失败：' + (e && e.message ? e.message : e));
  }finally{
    if(btn){ btn.disabled = false; btn.textContent = oldLabel; }
  }
}
async function onImageSelected(input){
  const file = input.files && input.files[0];
  if(!file) return;
  await uploadAndInsert(file);
  input.value = '';
}

// 粘贴截图自动上传：编辑框聚焦时，若剪贴板含图片则直接上传并插入
if(!window.__notePasteBound){
  window.__notePasteBound = true;
  document.addEventListener('paste', function(e){
    const ta = document.getElementById('noteTextarea');
    if(!ta || document.activeElement !== ta) return;
    const cd = e.clipboardData || window.clipboardData;
    if(!cd || !cd.items) return;
    let file = null;
    for(const it of cd.items){
      if(it.kind === 'file' && it.type && it.type.startsWith('image/')){
        file = it.getAsFile();
        if(file) break;
      }
    }
    if(!file) return; // 纯文字粘贴 → 放行，不做任何拦截
    e.preventDefault();
    const extMap = {'image/png':'png','image/jpeg':'jpg','image/gif':'gif','image/webp':'webp','image/bmp':'bmp'};
    const ext = extMap[file.type] || 'png';
    const fname = 'pasted-' + new Date().toISOString().replace(/[:.]/g,'-') + '.' + ext;
    uploadAndInsert(file, fname);
  });
}
