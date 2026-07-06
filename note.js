// Notes (book-notes & video-notes)
let currentNotePath = null;
let currentNoteData = null;
let currentNotesView = null;

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
      return `<a href="#" onclick="event.preventDefault();openDetail('${encodeURIComponent(n.path)}')" style="display:inline-flex;align-items:center;gap:4px;margin-right:8px;margin-bottom:4px">${iconMap[n.type]||'📄'} ${ESC(parent)} — ${ESC(n.title.replace(/-文学笔记|-视频笔记/g,''))}</a>`;
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

  if(!notes.length){
    document.getElementById('content').innerHTML = `<div class="empty"><div class="big">📝</div>还没有文学笔记<br><span style="font-size:12px;color:var(--faint);margin-bottom:16px;display:block">添加书籍时会自动创建，也可以手动新建</span><button class="btn-p" onclick="showAddNoteModal()">＋ 新建文学笔记</button></div>`;
    return;
  }

  const grouped = {};
  notes.forEach(n => {
    const parts = n.path.split('/');
    const bookFolder = parts[parts.length - 2] || '未分类';
    if(!grouped[bookFolder]) grouped[bookFolder] = [];
    grouped[bookFolder].push(n);
  });

  document.getElementById('content').innerHTML = `
    <div class="notes-layout">
      <div class="notes-sidebar" id="notesList">
        <button class="btn-p" style="width:100%;margin-bottom:8px;justify-content:center" onclick="showAddNoteModal()">＋ 新建文学笔记</button>
        <div class="distill-summary">${notes.length}篇笔记 · ${notes.filter(n=>(n.concepts||[]).length).length}篇已提炼 · ${notes.reduce((s,n)=>s+(n.concepts||[]).length,0)}个概念</div>
        ${Object.entries(grouped).map(([book, bookNotes]) => `
          <div class="note-group">
            <div class="note-group-h">📚 ${ESC(book)}</div>
            ${bookNotes.map(n => {
              const cc = (n.concepts||[]).length;
              return `
              <div class="note-item" id="ni-${n.path.replace(/[^a-zA-Z0-9]/g,'')}" onclick="loadNoteContent('${encodeURIComponent(n.path)}')">
                <div class="nt">${ESC(n.title.replace(/-文学笔记$/,''))}${cc?`<span class="concept-badge">💡${cc}</span>`:''}</div>
                <div class="nd">${FMTREL(n.mtime)}</div>
              </div>`;
            }).join('')}
          </div>
        `).join('')}
      </div>
      <div class="notes-reader" id="noteReader">
        <div class="empty"><div class="big">📖</div>选择左侧笔记开始阅读</div>
      </div>
    </div>`;

  if(notes.length){
    loadNoteContent(encodeURIComponent(notes[0].path));
  }
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
                <div class="nt">${ESC(n.title.replace(/-视频笔记$/,''))}${cc?`<span class="concept-badge">💡${cc}</span>`:''}</div>
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
    loadNoteContent(encodeURIComponent(notes[0].path));
  }
}

async function loadNoteContent(filepath){
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
        ${conceptCount ? `<span class="concept-badge">💡 ${conceptCount}个概念</span>` : ''}
        <span style="font-size:11px;color:var(--faint);margin-left:auto">更新于 ${FMT(it.updated||it.mtime)}</span>
        <button class="btn-g" onclick="showExtractConcept()">💡 提取概念</button>
        <button class="btn-g" id="noteEditBtn" onclick="toggleNoteEdit()">✏️ 编辑</button>
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
        <textarea class="note-editor" id="noteTextarea">${ESC(it.content||'')}</textarea>
        <div style="display:flex;gap:8px;margin-top:12px;justify-content:flex-end">
          <button class="btn-g" onclick="cancelNoteEdit()">取消</button>
          <button class="btn-p" onclick="saveNoteContent()">💾 保存</button>
        </div>
      </div>
    </div>`;

  if((it.concepts||[]).length > 0){
    loadConceptsForNote(it.concepts);
  }
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
            return `<a href="#" onclick="event.preventDefault();openDetail('${encodeURIComponent(c.path)}')"
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

function toggleNoteEdit(){
  document.getElementById('noteReadMode').style.display = 'none';
  document.getElementById('noteEditMode').style.display = 'block';
  document.getElementById('noteEditBtn').style.display = 'none';
}

function cancelNoteEdit(){
  document.getElementById('noteReadMode').style.display = 'block';
  document.getElementById('noteEditMode').style.display = 'none';
  document.getElementById('noteEditBtn').style.display = 'inline-flex';
}

async function saveNoteContent(){
  if(!currentNotePath) return;
  const content = document.getElementById('noteTextarea').value;
  const titleEl = document.getElementById('noteTitleEdit');
  const title = titleEl ? titleEl.value.trim() : '';
  const data = {path: currentNotePath, content: content};
  if(title) data.title = title;
  try{
    await put('/item', data);
    const ni = document.getElementById('ni-' + currentNotePath.replace(/[^a-zA-Z0-9]/g,''));
    if(ni){
      const nt = ni.querySelector('.nt');
      if(nt) nt.textContent = (title || '').replace(/-文学笔记$/,'').replace(/-视频笔记$/,'');
    }
    await loadNoteContent(encodeURIComponent(currentNotePath));
    await loadDashboard();
    renderNav();
  }catch(e){
    alert('保存失败：' + e.message);
  }
}

function showExtractConcept(){
  if(!currentNoteData){ alert('请先选择一篇笔记'); return; }
  const it = currentNoteData;
  const fp = currentNotePath;
  const parentName = fp ? fp.split('/').slice(-2,-1)[0] || '' : '';
  const noteType = it.type || 'book-notes';
  const isVideo = noteType === 'video-notes';
  const icon = isVideo ? '🎬' : '📚';

  document.getElementById('noteReader').innerHTML = `
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px">
      <span class="type-badge ${isVideo ? 'type-video' : 'type-book'}">${icon} ${ESC(parentName)}</span>
      <span style="font-size:13px;font-weight:600;color:var(--muted)">💡 从笔记提取概念</span>
      <button class="btn-g" style="margin-left:auto" onclick="loadNoteContent('${encodeURIComponent(fp)}')">← 返回笔记</button>
    </div>
    <div class="extract-split">
      <div class="extract-split-left">
        <h1>${ESC(it.title)}</h1>
        ${renderNoteContent(it.content)}
      </div>
      <div class="extract-split-right">
        <div style="margin-bottom:14px;padding:8px 12px;background:var(--asoft);border-radius:var(--radius-sm);font-size:11.5px;color:var(--muted)">
          📚 来源：<strong style="color:var(--accent)">${ESC(parentName)}</strong>
        </div>

        <div class="extract-step">① 原文摘录</div>
        <textarea class="extract-area" id="xc_excerpt" style="min-height:70px;margin-bottom:3px" placeholder="← 从左侧笔记中选中文字复制过来"></textarea>
        <div class="extract-hint" style="margin-bottom:12px">从左边笔记复制一段有价值的段落</div>

        <div class="extract-step">② 概念名称</div>
        <input class="extract-input" id="xc_name" type="text" style="margin-bottom:3px" placeholder="例：智力的可塑性">
        <div class="extract-hint" style="margin-bottom:12px">用一个名词短语概括</div>

        <div class="extract-step">③ 一句话定义</div>
        <input class="extract-input" id="xc_definition" type="text" style="margin-bottom:3px" placeholder="例：智力不是固定的，可以通过训练改变">
        <div class="extract-hint" style="margin-bottom:12px">不超过20字，像字典词条</div>

        <div class="extract-step">④ 核心解释</div>
        <textarea class="extract-area" id="xc_content" style="min-height:80px;margin-bottom:3px" placeholder="用自己的话展开说明"></textarea>
        <div class="extract-hint" style="margin-bottom:12px">基于摘录改写，不要直接复制</div>

        <div class="extract-step">⑤ 怎么用 <span style="color:var(--faint);font-weight:400">（可选）</span></div>
        <textarea class="extract-area" id="xc_howto" style="min-height:50px;margin-bottom:3px" placeholder="什么场景下能帮到你？"></textarea>
        <div class="extract-hint" style="margin-bottom:12px">想象一个具体场景</div>

        <div class="extract-step">标签 <span style="color:var(--faint);font-weight:400">（可选）</span></div>
        <input class="extract-input" id="xc_tags" type="text" placeholder="逗号分隔，例：心理学, 认知">

        <div style="display:flex;gap:8px;margin-top:16px;justify-content:flex-end">
          <button class="btn-g" onclick="loadNoteContent('${encodeURIComponent(fp)}')">取消</button>
          <button class="btn-p" onclick="saveExtractedConcept('${ESC(parentName)}','${encodeURIComponent(fp)}')">💡 创建概念</button>
        </div>
      </div>
    </div>`;
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
    if(currentNotesView === 'video-notes'){
      await renderVideoNotes();
    } else {
      await renderBookNotes();
    }
    if(notePath) loadNoteContent(notePath);
  }catch(e){
    alert('创建失败：' + e.message);
  }
}
