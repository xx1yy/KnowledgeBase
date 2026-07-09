// Modals — 所有弹窗（编辑、快速记录、新建笔记[统一 book/video]）

function closeModal(){ document.getElementById('modalMask').classList.remove('show') }

// 点击遮罩层背景关闭弹窗（仅当点击目标是遮罩本身而非内部 modal）
function closeModalOnMask(){
  closeModal();
}

// ── 编辑条目弹窗 ──
async function openEdit(filepath){
  const fp = decodeURIComponent(filepath);
  const it = await get(`/item?path=${encodeURIComponent(fp)}`);
  const html = `<div class="modal-head"><h3>编辑 ${ESC(it.title)}</h3><button class="modal-close" data-action="closeModal" data-args='[]'>×</button></div>
  <div class="modal-body">
    <div class="field"><label>状态</label><select id="f_status">${makeOptions({book:['想读','在读','已读'],video:['想看','已看'],problem:['待解决','解决中','已解决'],plan:['待开始','进行中','已完成'],reflection:['']},it.type,it.status)}</select></div>
    ${it.type==='book'||it.type==='video'?`<div class="field"><label>评分</label><select id="f_rating">${[0,1,2,3,4,5].map(n=>`<option value="${n}" ${n===it.rating?'selected':''}>${'★'.repeat(n)}${'☆'.repeat(5-n)}</option>`).join('')}</select></div>`:''}
    ${it.type==='problem'||it.type==='plan'?`<div class="field"><label>优先级</label><select id="f_priority">${['高','中','低'].map(p=>`<option ${p===it.priority?'selected':''}>${p}</option>`).join('')}</select></div>`:''}
    ${it.type==='reflection'?`<div class="field"><label>心情</label><select id="f_mood">${['😊 开心','😌 平静','😐 一般','😔 低落','😣 痛苦'].map(m=>`<option ${m===it.mood?'selected':''}>${m}</option>`).join('')}</select></div>`:''}
    ${it.type==='concept'||it.type==='problem'?`<div class="field"><label>领域</label><input type="text" id="f_domain" value="${ESC(it.domain||'')}" placeholder="如：学习方法，认知心理学（多个用逗号分隔）"></div>`:''}
    <div class="field"><label>内容</label><textarea id="f_content" style="min-height:200px">${ESC(it.content||'')}</textarea></div>
  </div>
  <div class="modal-foot"><button class="btn-g" data-action="closeModal" data-args='[]'>取消</button><button class="btn-p" data-action="saveEdit" data-args='${JSON.stringify([filepath])}'>保存</button></div>`;
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
  const domainEl = document.getElementById('f_domain');
  if(domainEl) data.domain = domainEl.value.trim();
  await put('/item', {path: fp, ...data});
  closeModal();
  await loadDashboard();
  clearRecentConceptsCache();
  await loadRecentConcepts();
  openDetail(filepath, {push:false});
}

// ── 快速记录弹窗 ──
function openQuickCapture(preselectType){
  const types = [
    {k:'book',l:'书籍',i:'📚'},{k:'video',l:'视频',i:'🎬'},
    {k:'concept',l:'概念',i:'💡'},{k:'reflection',l:'反思',i:'💭'},
    {k:'problem',l:'问题',i:'❓'},{k:'plan',l:'计划',i:'🎯'},
  ];
  const opts = types.map(t=>`<option value="${t.k}" ${t.k===preselectType?'selected':''}>${t.i} ${t.l}</option>`).join('');
  document.getElementById('modal').innerHTML = `
    <div class="modal-head"><h3>📝 快速记录</h3><button class="modal-close" data-action="closeModal" data-args='[]'>×</button></div>
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
    <div class="modal-foot"><button class="btn-g" data-action="closeModal" data-args='[]'>取消</button><button class="btn-p" data-action="saveQuickCapture" data-args='[]'>保存</button></div>`;
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

// ── 新建笔记弹窗（统一：文学笔记 / 视频笔记）──
// 用法: showAddNoteModal('book') 或 showAddNoteModal('video')
const NOTE_MODAL_CONFIG = {
  book: {
    icon: '📝', label: '文学笔记',
    parentType: 'book', parentLabel: '关联书籍',
    parentKey: '_bookList', notesKey: '_allBookNotes',
    emptyMsg: '还没有文学笔记',
    hint: '添加书籍时会自动创建，也可以手动新建',
    suffix: '-文学笔记', hasChapter: true,
    changeHandler: 'onNoteParentChange', inputHandler: 'autoFillNoteTitle',
    selectId: 'noteParentSelect', inputId: 'noteParentInput',
    listId: 'noteChapterList', chapterId: 'noteChapterInput',
  },
  video: {
    icon: '📺', label: '视频笔记',
    parentType: 'video', parentLabel: '关联视频',
    parentKey: '_videoList', notesKey: null,
    emptyMsg: '还没有视频笔记',
    hint: '添加视频时会自动创建，也可以手动新建',
    suffix: '-视频笔记', hasChapter: false,
    changeHandler: 'onNoteParentChange', inputHandler: 'autoFillNoteTitle',
    selectId: 'noteParentSelect', inputId: 'noteParentInput',
    listId: null, chapterId: null,
  }
};

function showAddNoteModal(noteType){
  const cfg = NOTE_MODAL_CONFIG[noteType] || NOTE_MODAL_CONFIG.book;
  const parents = window[cfg.parentKey] || [];
  const parentOptions = parents.map(p => `<option value="${ESC(p.title)}">${ESC(p.title)}</option>`).join('');

  let chapterHtml = '';
  if(cfg.hasChapter){
    chapterHtml = `
      <div class="form-group" style="margin-bottom:16px">
        <label style="font-size:12px;font-weight:600;color:var(--muted);margin-bottom:6px;display:block">章节（可选）</label>
        <input id="${cfg.chapterId}" list="${cfg.listId}" type="text" placeholder="如：第3章 记忆（留空归入「未分章」）" style="width:100%;padding:8px 12px;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--bg);color:var(--text);font-size:13px;outline:none">
        ${cfg.listId ? `<datalist id="${cfg.listId}"></datalist>` : ''}
      </div>`;
  }

  document.getElementById('modal').innerHTML = `
    <div class="modal-head"><h3>${cfg.icon} 新建${cfg.label}</h3><button class="modal-close" data-action="closeModal" data-args='[]'>×</button></div>
    <div class="modal-body">
      <div class="form-group" style="margin-bottom:16px">
        <label style="font-size:12px;font-weight:600;color:var(--muted);margin-bottom:6px;display:block">${cfg.parentLabel}</label>
        <div style="display:flex;gap:8px;align-items:center">
          <select id="${cfg.selectId}" style="flex:1;padding:8px 12px;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--bg);color:var(--text);font-size:13px;outline:none" data-change="${cfg.changeHandler}" data-note-type="${noteType}">
            <option value="__new__">＋ 输入新${cfg.parentType === 'book' ? '书名' : '视频名'}…</option>
            ${parentOptions}
          </select>
        </div>
        <input id="${cfg.inputId}" type="text" placeholder="输入新${cfg.parentType === 'book' ? '书' : '视频'}名称" style="display:none;width:100%;padding:8px 12px;margin-top:8px;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--bg);color:var(--text);font-size:13px;outline:none" data-input="${cfg.inputHandler}" data-note-type="${noteType}">
      </div>
      <div class="form-group" style="margin-bottom:16px">
        <label style="font-size:12px;font-weight:600;color:var(--muted);margin-bottom:6px;display:block">笔记标题</label>
        <input id="noteTitleInput" type="text" placeholder="${cfg.label}标题" style="width:100%;padding:8px 12px;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--bg);color:var(--text);font-size:13px;outline:none">
      </div>
      ${chapterHtml}
      <div class="form-group">
        <label style="font-size:12px;font-weight:600;color:var(--muted);margin-bottom:6px;display:block">初始内容（可选）</label>
        <textarea id="noteContentInput" placeholder="摘录、金句、随手笔记…" style="width:100%;min-height:100px;padding:10px 12px;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--bg);color:var(--text);font-size:13px;line-height:1.6;resize:vertical;outline:none;font-family:inherit"></textarea>
      </div>
    </div>
    <div class="modal-foot"><button class="btn-g" data-action="closeModal" data-args='[]'>取消</button><button class="btn-p" data-action="saveNewNote" data-args='["${noteType}"]'>创建</button></div>`;
  document.getElementById('modalMask').classList.add('show');

  // 记录当前笔记类型，供 change/input handler 使用
  window._currentNoteModalType = noteType;

  if(parents.length){
    document.getElementById(cfg.selectId).selectedIndex = 1;
    onNoteParentChange(null, document.getElementById(cfg.selectId));
  }
  if(cfg.listId) updateChapterSuggestions();
}

// 统一的父级选择变化处理（book/video 共用）
function onNoteParentChange(val, el){
  const noteType = el ? (el.dataset.noteType || window._currentNoteModalType) : window._currentNoteModalType;
  const cfg = NOTE_MODAL_CONFIG[noteType] || NOTE_MODAL_CONFIG.book;
  const sel = document.getElementById(cfg.selectId);
  const inp = document.getElementById(cfg.inputId);
  if(!sel || !inp) return;

  if(sel.value === '__new__'){
    inp.style.display = 'block';
    inp.focus();
    document.getElementById('noteTitleInput').value = '';
  } else {
    inp.style.display = 'none';
    autoFillNoteTitle(noteType);
  }
  if(cfg.listId) updateChapterSuggestions();
}

function autoFillNoteTitle(noteType){
  const cfg = NOTE_MODAL_CONFIG[noteType || window._currentNoteModalType] || NOTE_MODAL_CONFIG.book;
  const sel = document.getElementById(cfg.selectId);
  const inp = document.getElementById(cfg.inputId);
  let parentName = '';
  if(sel && sel.value === '__new__'){
    parentName = inp ? inp.value.trim() : '';
  } else if(sel){
    parentName = sel.value;
  }
  const titleInput = document.getElementById('noteTitleInput');
  if(titleInput && parentName && (!titleInput.value || titleInput.value.endsWith(cfg.suffix))){
    titleInput.value = parentName + cfg.suffix;
  }
}

// 章节备选（仅 book 类型使用）
function updateChapterSuggestions(){
  const noteType = window._currentNoteModalType;
  if(noteType !== 'book') return;
  const cfg = NOTE_MODAL_CONFIG.book;
  const sel = document.getElementById(cfg.selectId);
  const dl = document.getElementById(cfg.listId);
  if(!dl || !sel) return;
  const books = window._bookList || [];
  const notes = window._allBookNotes || [];
  let folder = null;
  if(sel.value && sel.value !== '__new__'){
    const b = books.find(x => x.title === sel.value);
    folder = b ? b.path.split('/').slice(-2, -1)[0] : null;
  }
  const seen = new Set();
  const opts = [];
  for(const n of notes){
    if(!n.chapter) continue;
    if(folder){
      const nf = n.path.split('/').slice(-2, -1)[0];
      if(nf !== folder) continue;
    }
    if(seen.has(n.chapter)) continue;
    seen.add(n.chapter);
    opts.push(`<option value="${ESC(n.chapter)}">`);
  }
  dl.innerHTML = opts.join('');
}

async function saveNewNote(noteType){
  const cfg = NOTE_MODAL_CONFIG[noteType] || NOTE_MODAL_CONFIG.book;
  const sel = document.getElementById(cfg.selectId);
  let parent = '';
  if(sel.value === '__new__'){
    parent = document.getElementById(cfg.inputId).value.trim();
    if(!parent){ alert(`请输入${cfg.parentType === 'book' ? '书名' : '视频名'}或选择已有`); return; }
  } else {
    parent = sel.value;
  }
  const title = document.getElementById('noteTitleInput').value.trim() || (parent + cfg.suffix);
  const content = document.getElementById('noteContentInput').value.trim();
  const chapter = cfg.hasChapter ? (document.getElementById(cfg.chapterId) ? document.getElementById(cfg.chapterId).value.trim() : '') : '';

  try{
    const postData = {type: noteType + '-notes', title:title, parent:parent, content:content};
    if(chapter) postData.chapter = chapter;
    await post('/item', postData);
    closeModal();
    await loadDashboard();
    if(noteType === 'video'){ await renderVideoNotes(); }
    else { await renderBookNotes(); }
  }catch(e){
    alert('创建失败：' + e.message);
  }
}

// ── 删除确认 ──
async function deleteItem(filepath){
  const fp = decodeURIComponent(filepath);
  if(!confirm('确定删除此条目？将移到回收站。')) return;
  await del(`/item?path=${encodeURIComponent(fp)}`);
  await loadDashboard();
  navigate(currentView, {push:false});
}
