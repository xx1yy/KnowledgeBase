// Notes (book-notes & video-notes) — 笔记列表渲染、章节管理、排序、拖拽、阅读/编辑模式
let currentNotePath = null;
let currentNoteData = null;
let currentNotesView = null;
let currentBookFilter = null;
// 文学笔记排序状态（持久化到 localStorage）
let noteSortMode = localStorage.getItem('kb_noteSortMode') || 'mtime'; // mtime|ctime|title
let noteManualSort = localStorage.getItem('kb_noteManualSort') === '1';
let _dragPath = null;

// ── 文学笔记列表 ──
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
    document.getElementById('content').innerHTML = `<div class="empty"><div class="big">📝</div>还没有文学笔记<br><span style="font-size:12px;color:var(--faint);margin-bottom:16px;display:block">添加书籍时会自动创建，也可以手动新建</span><button class="btn-p" data-action="showAddNoteModal" data-args='["book"]'>＋ 新建文学笔记</button></div>`;
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
        <div class="nb-head"><button class="nb-toggle" data-action="toggleBooks" data-args='[]' title="收起/展开书籍栏">«</button></div>
        <button class="btn-p" style="width:100%;margin-bottom:8px;justify-content:center" data-action="showAddNoteModal" data-args='["book"]'>＋ 新建文学笔记</button>
        <div class="distill-summary">${notes.length}篇 · ${notes.filter(n=>(n.concepts||[]).length).length}篇已提炼 · ${notes.reduce((s,n)=>s+(n.concepts||[]).length,0)}概念</div>
        ${entries.map(e => `
          <div class="book-item" data-folder="${ESC(e.folder)}" data-action="selectBook" data-args='${JSON.stringify([e.folder])}'>
            <span class="bi">📚</span>
            <span class="bt">${ESC(e.title)}</span>
            <span class="bc">${(byFolder[e.folder]||[]).length}</span>
          </div>`).join('')}
      </div>
      <div class="chapter-bar" id="chapterBar"></div>
      <div class="chapter-resizer" id="chapterResizer" title="拖拽调整章节栏宽度"></div>
      <div class="notes-reader" id="noteReader">
        <div class="empty"><div class="big">📖</div>选择左侧书籍与章节开始阅读</div>
      </div>
    </div>`;

  initChapterResizer();

  if(entries.length){
    selectBook(entries[0].folder, {loadFirst:true});
  }
}

// ── 视频笔记列表 ──
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
    document.getElementById('content').innerHTML = `<div class="empty"><div class="big">📺</div>还没有视频笔记<br><span style="font-size:12px;color:var(--faint);margin-bottom:16px;display:block">添加视频时会自动创建，也可以手动新建</span><button class="btn-p" data-action="showAddNoteModal" data-args='["video"]'>＋ 新建视频笔记</button></div>`;
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
        <button class="btn-p" style="width:100%;margin-bottom:8px;justify-content:center" data-action="showAddNoteModal" data-args='["video"]'>＋ 新建视频笔记</button>
        <div class="distill-summary">${notes.length}篇笔记 · ${notes.filter(n=>(n.concepts||[]).length).length}篇已提炼 · ${notes.reduce((s,n)=>s+(n.concepts||[]).length,0)}个概念</div>
        ${Object.entries(grouped).map(([video, videoNotes]) => `
          <div class="note-group">
            <div class="note-group-h">🎬 ${ESC(video)}</div>
            ${videoNotes.map(n => {
              const cc = (n.concepts||[]).length;
              return `
              <div class="note-item" id="ni-${n.path.replace(/[^a-zA-Z0-9]/g,'')}" data-action="loadNoteContent" data-args='${JSON.stringify([n.path])}'>
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
    ? ` draggable="true" data-drag-start="noteDragStart" data-args='${JSON.stringify([n.path])}' data-drag-over="noteDragOver" data-drag-end="noteDragEnd" data-drag-drop="noteDrop" data-drop-args='${JSON.stringify([folder||'',ch||'',n.path])}'`
    : '';
  return `<div class="note-item${noteManualSort?' draggable':''}" id="ni-${fp}"${drag} data-action="loadNoteContent" data-args='${JSON.stringify([n.path])}'>
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
    bar.innerHTML = `<div class="chapter-bar-h"><span class="cb-title">📚 ${ESC(bookTitle)}</span><button class="ch-toggle" data-action="toggleChapters" data-args='[]' title="收起/展开章节栏">«</button></div><div class="chapter-empty">📭 ${ESC(bookTitle)} 还没有笔记</div>`;
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
    <div class="chapter-bar-h"><span class="cb-title">📚 ${ESC(bookTitle)}</span><button class="ch-toggle" data-action="toggleChapters" data-args='[]' title="收起/展开章节栏">«</button></div>
    <div class="chapter-bar-sub">${bookNotes.length}篇 · ${names.length}个章节</div>
    <div class="sort-bar ${noteManualSort?'manual':''}">
      <select id="noteSortSel" data-change="changeNoteSort" ${noteManualSort?'disabled':''}>
        <option value="mtime" ${noteSortMode==='mtime'?'selected':''}>按修改时间 新→旧</option>
        <option value="ctime" ${noteSortMode==='ctime'?'selected':''}>按创建时间 新→旧</option>
        <option value="title" ${noteSortMode==='title'?'selected':''}>按标题 A→Z</option>
      </select>
      ${noteManualSort
        ? `<button class="btn-p sm" data-action="toggleNoteManualSort" data-args='[false]'>↺ 恢复自动</button><span class="sort-hint">✋ 拖拽笔记调整顺序</span>`
        : `<button class="btn-g sm" data-action="toggleNoteManualSort" data-args='[true]'>✋ 手动排序</button>`}
    </div>
    ${names.map(ch => `
      <div class="chapter-group">
        <div class="chapter-h2" data-action="loadChapterFirst" data-args='${JSON.stringify([folder, ch])}'><span class="ch-dot">📖</span><span class="ch-name">${ESC(ch)}</span><span class="ch-count">${groups[ch].length}</span></div>
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
    a.sort((x, y) => (y.mtime||0) - (x.mtime||0));
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

// ── 笔记内容加载 / 阅读-编辑切换 ──
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
          <button class="btn-g sm" id="insertImgBtn" type="button" data-action="triggerImageUpload" data-args='[]'>🖼 插入图片</button>
          <span class="extract-hint" style="margin:0">图片存入知识库「附件」目录，以 ![[附件/名称]] 引用</span>
          <input type="file" id="imgFileInput" accept="image/*" style="display:none" data-change="onImageSelected">
        </div>
        <textarea class="note-editor" id="noteTextarea">${ESC(it.content||'')}</textarea>
        <div style="display:flex;gap:8px;margin-top:12px;justify-content:flex-end">
          <button class="btn-g" data-action="cancelNoteEdit" data-args='[]'>取消</button>
          <button class="btn-p" data-action="saveNoteContent" data-args='[]'>💾 保存</button>
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
    // 刷新章节栏，让新的 chapter 分组立即生效
    if(currentBookFilter) renderChapterBar(currentBookFilter);
  }catch(e){
    alert('保存失败：' + e.message);
  }
}
