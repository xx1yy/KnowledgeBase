// Notes — 章节管理 + 拖拽排序（从原 note.js 拆分）
// 依赖 list.js 中的共享状态（currentBookFilter / noteSortMode / noteManualSort / _dragPath / window._bookNotesByFolder）
// 与 list.js 中的 loadNoteContent，均在全局词法作用域共享，运行时调用。

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
    a.sort((x, y) => String(x.title||'').localeCompare(String(x.title||''), 'zh'));
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
