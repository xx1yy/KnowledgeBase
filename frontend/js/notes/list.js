// Notes — 列表渲染 + 内容加载 + 视频封面（从原 note.js 拆分）
//
// 本文件持有笔记模块的共享状态，必须在 chapters.js / editor.js 之前加载：
// 这些共享 let 绑定位于全局词法作用域，chapters.js、editor.js 中的函数仅引用、
// 不重复声明，因此加载顺序保证「先声明、后引用」无 TDZ 风险。

let currentNotePath = null;
let currentNoteData = null;
let currentNotesView = null;
let currentBookFilter = null;
// 文学笔记排序状态（持久化到 localStorage）
let noteSortMode = localStorage.getItem('kb_noteSortMode') || 'mtime'; // mtime|ctime|title
let noteManualSort = localStorage.getItem('kb_noteManualSort') === '1';
let _dragPath = null;

// ── 各平台封面尺寸（用于「自动适配」预览） ──
const PLATFORM_COVERS = [
  { key:'bilibili', name:'B站视频', w:1146, h:717,  note:'16:10 · 视频默认封面' },
  { key:'youtube',  name:'YouTube',  w:1280, h:720,  note:'16:9 · 视频封面' },
  { key:'douyin',   name:'抖音',     w:1080, h:1920, note:'9:16 · 竖屏封面' },
  { key:'xhs',      name:'小红书',   w:1080, h:1440, note:'3:4 · 图文封面' },
  { key:'weibo',    name:'微博',     w:1080, h:1080, note:'1:1 · 方图封面' },
];

// 从文本中提取 B 站视频链接 / BV 号
function extractBilibiliUrl(text){
  if(!text) return null;
  const m = text.match(/(?:https?:\/\/)?(?:www\.)?bilibili\.com\/video\/(BV[0-9A-Za-z]+)/)
          || text.match(/(?:https?:\/\/)?b23\.tv\/[A-Za-z0-9]+/)
          || text.match(/(BV[0-9A-Za-z]{10,12})/);
  return m ? m[0] : null;
}

// ── 视频预览：自动抓取 B 站封面（单张预览 + 按需导出各平台） ──
async function loadVideoCover(it){
  const slot = document.getElementById('videoCoverSlot');
  if(!slot) return;
  slot.innerHTML = '';

  const rawLink = (it.url || '') + '\n' + (it.source || '') + '\n' + (it.content || '');
  let link = extractBilibiliUrl(rawLink);
  // 自身没放链接时，去关联的「视频笔记」里找 B 站链接
  if(!link && it.type === 'video'){
    try{
      if(it.type === 'video'){
        // 视频源 → 查关联「视频笔记」
        const notes = await get('/items?type=video-notes');
        const related = (notes||[]).filter(n => n.type === 'video-notes' && n.path.startsWith(it.path.replace(/[^/]+\.md$/,'')));
        for(const n of related){
          const l = extractBilibiliUrl((n.url||'') + '\n' + (n.source||'') + '\n' + (n.content||''));
          if(l){ link = l; break; }
        }
      } else if(it.type === 'video-notes'){
        // 视频笔记 → 反查父级「视频源」
        const parentPath = it.path.replace(/-视频笔记\.md$/, '.md');
        const parent = await get('/item?path=' + encodeURIComponent(parentPath));
        if(parent && !parent.error){
          link = extractBilibiliUrl((parent.url||'') + '\n' + (parent.source||'') + '\n' + (parent.content||''));
        }
      }
    }catch(e){}
  }
  if(!link){
    slot.innerHTML = `<div class="cover-hint">未检测到 B 站视频链接（在「链接」或正文里放一个 bilibili.com/video/BV… 即可自动抓封面）</div>`;
    return;
  }

  // 先从 localStorage 取缓存（按 BV 号）
  const bvMatch = link.match(/BV[0-9A-Za-z]{10,12}/);
  const cacheKey = bvMatch ? 'kb_cover_' + bvMatch[0] : null;
  let cached = null;
  if(cacheKey){ try{ cached = JSON.parse(localStorage.getItem(cacheKey)); }catch(e){} }

  slot.innerHTML = `<div class="cover-loading">⏳ 正在抓取 B 站封面…</div>`;
  let cover;
  if(cached){ cover = cached; }
  else {
    try{
      cover = await get('/cover?url=' + encodeURIComponent(link));
    }catch(e){ cover = { ok:false, error: e.message }; }
    if(cover && cover.ok && cacheKey){
      try{ localStorage.setItem(cacheKey, JSON.stringify(cover)); }catch(e){}
    }
  }

  if(!cover || !cover.ok){
    slot.innerHTML = `<div class="cover-hint">⚠️ 封面抓取失败：${ESC(cover && cover.error || '未知错误')}</div>`;
    const meta = document.getElementById('videoMeta');
    if(meta) meta.style.display = '';
    return;
  }

  const imgUrl = cover.cover;
  // 同源代理地址（给 canvas 用，避免跨域污染）
  const proxyUrl = API_BASE + '/img?url=' + encodeURIComponent(imgUrl);

  // ── 平台风格：封面大图为主视觉，元信息在右侧/下方 ──
  slot.innerHTML = `
    <div class="video-hero">
      <div class="vh-cover"><a href="${ESC(cover.source_url)}" target="_blank" rel="noopener"><img src="${ESC(imgUrl)}" alt="${ESC(cover.title||'视频封面')}" referrerpolicy="no-referrer"></a></div>
      <div class="vh-info">
        <a class="vh-title" href="${ESC(cover.source_url)}" target="_blank" rel="noopener">${ESC(cover.title || it.title || '')}</a>
        <div class="vh-up">${cover.author ? ESC(cover.author) : (it.source || '')}${cover.views ? ` · ${cover.views.toLocaleString()} 播放` : ''}</div>
        ${it.url?`<div class="vh-link"><a href="${ESC(it.url)}" target="_blank" rel="noopener">🔗 B站原视频 ↗</a></div>`:''}
        <button class="btn-g sm" id="coverPlatToggle" type="button">▶ 导出各平台封面</button>
        <div class="cover-platform-grid" id="coverPlatGrid" style="display:none"></div>
      </div>
    </div>`;

  // 显示元信息区（与封面并排）
  const meta = document.getElementById('videoMeta');
  if(meta) meta.style.display = 'none'; // 已整合进 vh-info

  // 各平台封面：默认折叠
  const grid = slot.querySelector('#coverPlatGrid');
  for(const p of PLATFORM_COVERS){
    const el = document.createElement('div');
    el.className = 'cover-platform';
    el.innerHTML = `<div class="cover-platform-frame" style="aspect-ratio:${p.w}/${p.h}">
        <img src="${ESC(imgUrl)}" alt="${ESC(p.name)}" referrerpolicy="no-referrer" loading="lazy">
      </div>
      <div class="cover-platform-label">${ESC(p.name)}</div>
      <div class="cover-platform-size">${p.w}×${p.h}</div>
      <div class="cover-platform-note">${ESC(p.note)}</div>
      <button class="btn-g sm cover-dl" data-cover-url="${ESC(proxyUrl)}" data-w="${p.w}" data-h="${p.h}" data-name="${ESC(p.key + '_' + cover.bvid)}">⬇ 下载</button>`;
    grid.appendChild(el);
  }
  grid.querySelectorAll('.cover-dl').forEach(btn => {
    btn.addEventListener('click', () => downloadCroppedCover(btn.dataset.coverUrl, +btn.dataset.w, +btn.dataset.h, btn.dataset.name));
  });
  slot.querySelector('#coverPlatToggle').addEventListener('click', (e) => {
    const open = grid.style.display !== 'none';
    grid.style.display = open ? 'none' : 'grid';
    e.target.textContent = open ? '▶ 导出各平台封面' : '▼ 收起各平台封面';
  });
}

// canvas 裁剪并下载封面（center-crop 填满目标比例）
function downloadCroppedCover(proxyUrl, w, h, name){
  const img = new Image();
  img.crossOrigin = 'anonymous'; // 同源代理，已允许
  img.onload = function(){
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    // 计算填满裁剪区域
    const scale = Math.max(w / img.width, h / img.height);
    const dw = img.width * scale, dh = img.height * scale;
    const dx = (w - dw) / 2, dy = (h - dh) / 2;
    ctx.drawImage(img, dx, dy, dw, dh);
    canvas.toBlob(blob => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = name + '.png';
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    }, 'image/png');
  };
  img.onerror = () => alert('封面图片加载失败，无法导出');
  img.src = proxyUrl;
}

// ── 文学笔记列表 ──
async function renderBookNotes(){
  let data;
  try{ data = await get(withDomain('/items?type=book-notes')); }
  catch(e){ data = []; }
  const notes = data.filter(it => it.type === 'book-notes');

  let books = [];
  try{ books = await get('/items?type=book'); }catch(e){}
  books = books.filter(b => b.type === 'book');
  window._bookList = books;   // 全量：供「新建笔记」选父级用，不过滤领域
  window._allBookNotes = notes;

  // 顶栏选了领域时，父级书籍栏也要按领域过滤（与笔记继承领域逻辑一致）。
  // 注意：window._bookList 保持全量（modals 选父级需要），这里单独算展示用列表。
  const _dset = (typeof currentDomain === 'string' && currentDomain)
    ? new Set(currentDomain.split(/[,，、;；]/).map(s => s.trim()).filter(Boolean))
    : null;
  const _matchDomain = (domStr) => {
    if(!_dset) return true;
    if(!domStr) return false;
    const toks = new Set(String(domStr).split(/[,，、;；]/).map(s => s.trim()).filter(Boolean));
    return [...toks].some(t => _dset.has(t));
  };
  const displayBooks = books.filter(b => _matchDomain(b.domain));

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

  const bookFolders = new Set(displayBooks.map(b => b.path.split('/').slice(-2, -1)[0]));
  const folderTitles = {};
  books.forEach(b => { folderTitles[b.path.split('/').slice(-2, -1)[0]] = b.title; });  // 标题用全量，避免漏标题
  const orphanFolders = Object.keys(byFolder).filter(f => !bookFolders.has(f));
  orphanFolders.forEach(f => { folderTitles[f] = folderTitles[f] || '未归类'; });
  window._bookFolderTitles = folderTitles;

  const entries = [
    ...displayBooks.map(b => ({folder: b.path.split('/').slice(-2, -1)[0], title: b.title})),
    ...orphanFolders.map(f => ({folder: f, title: folderTitles[f] || '未归类'}))
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
  try{ data = await get(withDomain('/items?type=video-notes')); }
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

// ── 帖子笔记列表 ──
async function renderPostNotes(){
  let data;
  try{ data = await get(withDomain('/items?type=post-notes')); }
  catch(e){ data = []; }
  const notes = data.filter(it => it.type === 'post-notes');

  let posts = [];
  try{ posts = await get('/items?type=post'); }catch(e){}
  posts = posts.filter(p => p.type === 'post');
  window._postList = posts;

  if(!notes.length){
    document.getElementById('content').innerHTML = `<div class="empty"><div class="big">📱</div>还没有帖子笔记<br><span style="font-size:12px;color:var(--faint);margin-bottom:16px;display:block">添加帖子时会自动创建，也可以手动新建</span><button class="btn-p" data-action="showAddNoteModal" data-args='["post"]'>＋ 新建帖子笔记</button></div>`;
    return;
  }

  const grouped = {};
  notes.forEach(n => {
    const parts = n.path.split('/');
    const postFolder = parts[parts.length - 2] || '未分类';
    if(!grouped[postFolder]) grouped[postFolder] = [];
    grouped[postFolder].push(n);
  });

  document.getElementById('content').innerHTML = `
    <div class="notes-layout">
      <div class="notes-sidebar" id="notesList">
        <button class="btn-p" style="width:100%;margin-bottom:8px;justify-content:center" data-action="showAddNoteModal" data-args='["post"]'>＋ 新建帖子笔记</button>
        <div class="distill-summary">${notes.length}篇笔记 · ${notes.filter(n=>(n.concepts||[]).length).length}篇已提炼 · ${notes.reduce((s,n)=>s+(n.concepts||[]).length,0)}个概念</div>
        ${Object.entries(grouped).map(([post, postNotes]) => `
          <div class="note-group">
            <div class="note-group-h">📱 ${ESC(post)}</div>
            ${postNotes.map(n => {
              const cc = (n.concepts||[]).length;
              return `
              <div class="note-item" id="ni-${n.path.replace(/[^a-zA-Z0-9]/g,'')}" data-action="loadNoteContent" data-args='${JSON.stringify([n.path])}'>
                <div class="nt">${ESC(String(n.title||'').replace(/-帖子笔记$/,''))}${cc?`<span class="concept-badge">💡${cc}</span>`:''}</div>
                <div class="nd">${FMTREL(n.mtime)}</div>
              </div>`;
            }).join('')}
          </div>
        `).join('')}
      </div>
      <div class="notes-reader" id="noteReader">
        <div class="empty"><div class="big">📱</div>选择左侧笔记开始阅读</div>
      </div>
    </div>`;

  if(notes.length){
    loadNoteContent(encodeURIComponent(notes[0].path), {push:false});
  }
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
  const isPost = noteType === 'post-notes';
  const isNoChapter = isVideo || isPost;
  const icon = isVideo ? '🎬' : (isPost ? '📱' : '📚');
  const badgeCls = isVideo ? 'type-video' : (isPost ? 'type-post' : 'type-book');
  const conceptCount = (it.concepts||[]).length;
  document.getElementById('noteReader').innerHTML = `
    <div class="note-reader-card">
      <div class="note-reader-toolbar">
        <span class="type-badge ${badgeCls}">${icon} ${ESC(parentName)}</span>
        ${!isNoChapter && it.chapter ? `<span class="type-badge badge-gray">📖 ${ESC(it.chapter)}</span>` : ''}
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
        ${!isNoChapter ? `<div class="field" style="margin-bottom:12px">
          <label style="font-size:12px;font-weight:600;color:var(--muted);margin-bottom:5px;display:block">章节（可选）</label>
          <input type="text" id="noteChapterEdit" value="${ESC(it.chapter||'')}" placeholder="如：第3章 记忆（留空归入「未分章」）" style="width:100%;padding:8px 12px;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--bg);color:var(--text);font-size:13px;outline:none;box-sizing:border-box">
        </div>` : ''}
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
