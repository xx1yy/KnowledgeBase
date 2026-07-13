// Modals — 所有弹窗（编辑、快速记录、新建笔记[统一 book/video]）

// 防重复提交：创建类请求进行中时拦截同函数的二次调用（避免快速双击保存产生重复条目）
let _creating = false;
let _editDirty = false;   // 编辑弹窗是否有未保存修改（点遮罩/×/Esc 关闭前需确认）

function closeModal(){
  // 未保存修改保护：编辑弹窗有改动时，点遮罩/×/Esc 关闭前必须确认，避免误关丢失内容
  if(_editDirty){
    if(!confirm('有未保存的修改，确定要关闭并丢弃吗？')) return;
  }
  _editDirty = false;
  document.getElementById('modalMask').classList.remove('show');
}

// 点击遮罩层背景关闭弹窗（仅当点击目标是遮罩本身而非内部 modal）
function closeModalOnMask(){
  closeModal();
}

// Esc 关闭弹窗（同样受未保存修改保护）
document.addEventListener('keydown', function(e){
  if(e.key === 'Escape'){
    const mask = document.getElementById('modalMask');
    if(mask && mask.classList.contains('show')) closeModal();
  }
});

// ── 编辑条目弹窗 ──
async function openEdit(filepath){
  _editDirty = false;   // 新开编辑弹窗：重置未保存标记
  const fp = decodeURIComponent(filepath);
  const it = await get(`/item?path=${encodeURIComponent(fp)}`);
  const html = `<div class="modal-head"><h3>编辑 ${ESC(it.title)}</h3><button class="modal-close" data-action="closeModal" data-args='[]'>×</button></div>
  <div class="modal-body">
    ${it.type==='plan'?`
    <div class="field"><label>计划类型</label><select id="f_plan_type">${['action','habit'].map(pt=>`<option value="${pt}" ${pt===(it.plan_type||'action')?'selected':''}>${pt==='action'?'普通行动':'习惯养成'}</option>`).join('')}</select></div>
    <div id="plan_habit_fields" style="${(it.plan_type||'action')!=='habits'?'display:none':''}">
      <div class="field"><label>频率</label><select id="f_frequency">${['daily','weekly','weekday','custom'].map(f=>`<option value="${f}" ${f===(it.frequency||'daily')?'selected':''}>${{daily:'每天',weekly:'每周',weekday:'工作日',custom:'自定义'}[f]}</option>`).join('')}</select></div>
      <div class="field"><label>连续天数</label><input type="number" id="f_streak" value="${it.streak||0}" min="0" style="width:80px"> <span style="font-size:12px;color:var(--muted)">历史最长：<span id="best_streak_display">${it.best_streak||0}</span> 天</span></div>
    </div>
    <div class="field"><label>来源概念</label><input type="text" id="f_source_concept" value="${ESC(it.source_concept||'')}" placeholder="如 [[3-概念/环境设计]] 或 MOC名称"></div>
    `:''}
    ${it.type!=='concept'?`<div class="field"><label>状态</label><select id="f_status">${makeOptions({book:['想读','在读','已读'],video:['想看','已看'],problem:['待解决','解决中','已解决'],plan:(it.plan_type==='habit'?['活跃','暂停','已放弃']:['待开始','进行中','已完成']),reflection:['']},it.type,it.status)}</select></div>`:''}
    ${it.type==='book'||it.type==='video'?`<div class="field"><label>评分</label><select id="f_rating">${[0,1,2,3,4,5].map(n=>`<option value="${n}" ${n===it.rating?'selected':''}>${'★'.repeat(n)}${'☆'.repeat(5-n)}</option>`).join('')}</select></div>`:''}
    ${['book','video','post'].includes(it.type)?`
    <div class="field"><label>标题</label><input type="text" id="f_title" value="${ESC(it.title||'')}"></div>
    <div class="field"><label>${it.type==='book'?'作者':'来源'}</label><input type="text" id="f_author" value="${ESC(it.author||it.source||'')}" placeholder="${it.type==='book'?'作者名':'来源（如 公众号 / 网站）'}"></div>
    ${(it.type==='video'||it.type==='post')?`<div class="field"><label>链接 URL</label><input type="text" id="f_url" value="${ESC(it.url||'')}"></div>`:''}
    ${it.type==='book'?`<div class="field"><label>开始日期</label><input type="date" id="f_start_date" value="${ESC(it.start_date||'')}"></div>`:''}
    ${it.type==='book'?`<div class="field"><label>完成日期</label><input type="date" id="f_finish_date" value="${ESC(it.finish_date||'')}"></div>`:''}
    ${it.type==='video'?`<div class="field"><label>观看日期</label><input type="date" id="f_watch_date" value="${ESC(it.watch_date||'')}"></div>`:''}
    <div class="field"><label>标签（逗号分隔）</label><input type="text" id="f_tags" value="${ESC((it.tags||[]).join(', '))}" placeholder="如：学习方法, 认知科学"></div>
    `:''}
    ${it.type==='problem'||it.type==='plan'?`<div class="field"><label>优先级</label><select id="f_priority">${['高','中','低'].map(p=>`<option ${p===it.priority?'selected':''}>${p}</option>`).join('')}</select></div>`:''}
    ${it.type==='reflection'?`<div class="field"><label>心情</label><select id="f_mood">${['😊 开心','😌 平静','😐 一般','😔 低落','😣 痛苦'].map(m=>`<option ${m===it.mood?'selected':''}>${m}</option>`).join('')}</select></div>`:''}
    ${['book','video','post','concept','problem'].includes(it.type)?`<div class="field"><label>领域</label><input type="text" id="f_domain" value="${ESC(it.domain||'')}" placeholder="如：学习方法，认知心理学（多个用逗号分隔）"></div>`:''}
    ${it.type==='concept'?`
    <div class="field"><label>一句话定义</label><input type="text" id="f_definition" value="${ESC(it.definition||'')}" placeholder="用一句话概括这个概念"></div>
    <div class="field"><label>怎么用</label><textarea id="f_howto" style="min-height:90px">${ESC(it.how_to_use||'')}</textarea></div>
    <div class="field"><label>原文摘录</label><textarea id="f_excerpt" style="min-height:90px">${ESC(it.excerpt||'')}</textarea></div>
    <div class="field"><label>来源</label><input type="text" id="f_source" value="${ESC(it.source||'')}" placeholder="如 [[2-输入/书籍/《书名》]]"></div>
    <div class="field"><label>标签（逗号分隔）</label><input type="text" id="f_tags" value="${ESC((it.tags||[]).join(', '))}" placeholder="如：学习方法, 认知科学"></div>
    `:''}
    <div class="field"><label>内容</label><textarea id="f_content" style="min-height:200px">${ESC(it.content||'')}</textarea></div>
    <input type="hidden" id="f_type" value="${ESC(it.type)}">
  </div>
  <div class="modal-foot"><button class="btn-g" data-action="closeModal" data-args='[]'>取消</button><button class="btn-p" data-action="saveEdit" data-args='${JSON.stringify([filepath])}'>保存</button></div>`;
  document.getElementById('modal').innerHTML = html;
  document.getElementById('modalMask').classList.add('show');
  // plan 类型切换：显示/隐藏 habit 专属字段 + 切换 status 选项
  const ptSel = document.getElementById('f_plan_type');
  if(ptSel){
    ptSel.addEventListener('change', function(){
      const isHabit = this.value === 'habit';
      const hf = document.getElementById('plan_habit_fields');
      if(hf) hf.style.display = isHabit ? '' : 'none';
      // 切换 status 选项
      const stSel = document.getElementById('f_status');
      if(stSel){
        const opts = isHabit
          ? ['活跃','暂停','已放弃']
          : ['待开始','进行中','已完成'];
        stSel.innerHTML = opts.map(o=>`<option value="${o}">${o}</option>`).join('');
      }
    });
  }

  // 未保存修改追踪：编辑弹窗内任何字段变动都标记 dirty，关闭时（遮罩/×/Esc）弹确认
  document.getElementById('modal').querySelectorAll('input,textarea,select').forEach(inp=>{
    inp.addEventListener('input', ()=>{ _editDirty = true; });
    inp.addEventListener('change', ()=>{ _editDirty = true; });
  });
}

async function saveEdit(filepath){
  const fp = decodeURIComponent(filepath);
  const data = {};
  const typeEl = document.getElementById('f_type');
  const type = typeEl ? typeEl.value : '';
  ['status','rating','priority','mood'].forEach(k=>{
    const el = document.getElementById('f_'+k);
    if(el){ data[k] = k==='rating' ? parseInt(el.value) : el.value; }
  });
  // plan 专属字段
  const ptEl = document.getElementById('f_plan_type');
  if(ptEl) data.plan_type = ptEl.value;
  const freqEl = document.getElementById('f_frequency');
  if(freqEl) data.frequency = freqEl.value;
  const streakEl = document.getElementById('f_streak');
  if(streakEl) data.streak = parseInt(streakEl.value)||0;
  const scEl = document.getElementById('f_source_concept');
  if(scEl) data.source_concept = scEl.value.trim();
  const contentEl = document.getElementById('f_content');
  if(contentEl) data.content = contentEl.value;
  const domainEl = document.getElementById('f_domain');
  if(domainEl) data.domain = domainEl.value.trim();
  // concept 专属字段（一句话定义 / 怎么用 / 原文摘录 / 来源）
  if(type === 'concept'){
    const dEl = document.getElementById('f_definition'); if(dEl) data.definition = dEl.value;
    const hEl = document.getElementById('f_howto'); if(hEl) data.how_to_use = hEl.value;
    const eEl = document.getElementById('f_excerpt'); if(eEl) data.excerpt = eEl.value;
    const sEl = document.getElementById('f_source'); if(sEl) data.source = sEl.value.trim();
  }
  // 输入类（book / video / post）专属字段
  if(type === 'book'){
    const tEl = document.getElementById('f_title'); if(tEl) data.title = tEl.value.trim();
    const aEl = document.getElementById('f_author'); if(aEl) data.author = aEl.value.trim();
    const sdEl = document.getElementById('f_start_date'); if(sdEl) data.start_date = sdEl.value;
    const fdEl = document.getElementById('f_finish_date'); if(fdEl) data.finish_date = fdEl.value;
  } else if(type === 'video'){
    const tEl = document.getElementById('f_title'); if(tEl) data.title = tEl.value.trim();
    const sEl = document.getElementById('f_author'); if(sEl) data.source = sEl.value.trim();
    const uEl = document.getElementById('f_url'); if(uEl) data.url = uEl.value.trim();
    const wdEl = document.getElementById('f_watch_date'); if(wdEl) data.watch_date = wdEl.value;
  } else if(type === 'post'){
    const tEl = document.getElementById('f_title'); if(tEl) data.title = tEl.value.trim();
    const sEl = document.getElementById('f_author'); if(sEl) data.source = sEl.value.trim();
    const uEl = document.getElementById('f_url'); if(uEl) data.url = uEl.value.trim();
  }
  // 标签（concept / book / video / post 共用 f_tags）
  const tagEl = document.getElementById('f_tags');
  if(tagEl) data.tags = tagEl.value.split(/[,，、]/).map(s=>s.trim()).filter(Boolean);
  await put('/item', {path: fp, ...data});
  _editDirty = false;   // 已保存，关闭时不再弹确认
  closeModal();
  await loadDashboard();
  clearRecentConceptsCache();
  await loadRecentConcepts();
  openDetail(filepath, {push:false});
}

// ── 快速记录弹窗 ──
function openQuickCapture(preselectType){
  const types = [
    {k:'book',l:'书籍',i:'📚'},{k:'video',l:'视频',i:'🎬'},{k:'post',l:'帖子',i:'📱'},
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
      <div class="field" id="qc_plan_f" style="display:none">
        <label>计划类型</label><select id="qc_plan_type">
          <option value="action">普通行动（一次性任务）</option>
          <option value="habit">习惯养成（重复追踪）</option>
        </select>
      </div>
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
  document.getElementById('qc_author_f').style.display = (t==='book'||t==='video'||t==='post')?'block':'none';
  document.getElementById('qc_domain_f').style.display = (t==='concept'||t==='problem')?'block':'none';
  document.getElementById('qc_source_f').style.display = (t==='concept'||t==='problem'||t==='plan')?'block':'none';
  document.getElementById('qc_plan_f').style.display = (t==='plan')?'block':'none';
}

async function saveQuickCapture(){
  if(_creating) return;
  _creating = true;
  try{
  const t = document.getElementById('qc_type').value;
  const title = document.getElementById('qc_title').value.trim();
  if(!title) return alert('请输入标题');
  const data = {type:t, title};
  if(t==='book'||t==='video'||t==='post') data[t==='book'?'author':'source'] = document.getElementById('qc_author').value.trim();
  if(t==='concept'||t==='problem') data.domain = document.getElementById('qc_domain').value.trim();
  if(t==='plan'){
    const ptSel = document.getElementById('qc_plan_type');
    if(ptSel) data.plan_type = ptSel.value;
  }
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
  } finally { _creating = false; }
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
  },
  post: {
    icon: '📱', label: '帖子笔记',
    parentType: 'post', parentLabel: '关联帖子',
    parentKey: '_postList', notesKey: null,
    emptyMsg: '还没有帖子笔记',
    hint: '添加帖子时会自动创建，也可以手动新建',
    suffix: '-帖子笔记', hasChapter: false,
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
    const sel = document.getElementById(cfg.selectId);
    // 默认选中上次创建笔记所属的父级（书籍/视频）；无记录则选第一个
    let idx = 1; // 第 0 项是「＋ 输入新…」
    try{
      const lastParent = localStorage.getItem('kb_lastNoteParent_' + noteType);
      if(lastParent){
        const found = parents.findIndex(p => p.title === lastParent);
        if(found >= 0) idx = found + 1;
      }
    }catch(e){}
    sel.selectedIndex = idx;
    onNoteParentChange(null, sel);
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
  if(_creating) return;
  _creating = true;
  try{
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
    // 记录上次创建笔记所属的父级（书籍/视频），供下次打开弹窗默认选中
    try{ localStorage.setItem('kb_lastNoteParent_' + noteType, parent); }catch(e){}
    const newItem = await post('/item', postData);
    closeModal();
    await loadDashboard();
    // 重新渲染列表（拿到最新数据），随后直接打开刚创建的笔记，而不是跳到第一本第一个
    if(noteType === 'video'){
      await renderVideoNotes();
    } else if(noteType === 'post'){
      await renderPostNotes();
    } else {
      await renderBookNotes();
    }
    if(newItem && newItem.path){
      const folder = newItem.path.split('/').slice(-2, -1)[0];
      // 文学笔记：高亮新笔记所属的书籍并刷新对应章节栏，保持侧栏与正文一致
      if(noteType === 'book' && folder && window._bookNotesByFolder && window._bookNotesByFolder[folder]){
        selectBook(folder, {loadFirst:false});
      }
      loadNoteContent(encodeURIComponent(newItem.path), {push:true});
    }
  }catch(e){
    alert('创建失败：' + e.message);
  }
  } finally {
    _creating = false;
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
