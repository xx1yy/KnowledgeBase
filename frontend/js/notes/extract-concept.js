// Extract Concept — 从笔记提取概念（提取页面 + 保存 + 笔记内概念展示）

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
      {label:'← 返回笔记', action:'loadNoteContent', args:[fp, {push:false}]},
      {label:'💡 创建概念', action:'saveExtractedConcept', args:[parentName, encodeURIComponent(fp)], type:'primary'}
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
  initSplitResizer();
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

// ── 笔记阅读页底部：已提取的概念列表 ──
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
            return `<a href="#" data-action="showConceptPage" data-args='${JSON.stringify([c.path])}'
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

// ── 右侧栏：笔记操作 + 概念列表（已改 data-action，消除 onclick）──
async function refreshNoteRightbar(conceptNames, fp, isVideo, parentName, conceptCount, it){
  const actions = [
    {label:'💡 提取概念', action:'showExtractConcept', args:[], type:'primary'},
    {label:'🔗 关联已有概念', action:'linkExistingConcept', args:[]},
    {label:'✏️ 编辑笔记', action:'toggleNoteEdit', args:[]},
    {label:'🗑 删除笔记', action:'deleteItem', args:[encodeURIComponent(fp)], type:'danger'}
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

// ── 关联已有概念：把已存在的概念绑定到当前笔记（不新建重复概念文件）──
async function linkExistingConcept(){
  if(!currentNotePath){ alert('请先打开一篇笔记'); return; }
  let concepts = [];
  try{ concepts = await get('/items?type=concept'); }catch(e){ concepts = []; }
  const opts = concepts.map(c => `<option value="${ESC(c.title)}">`).join('');
  const already = (currentNoteData && currentNoteData.concepts) || [];
  const modal = document.getElementById('modal');
  if(!modal) return;
  modal.innerHTML = `
    <div class="modal-head"><h3>🔗 关联已有概念</h3><button class="modal-close" data-action="closeModal" data-args='[]'>✕</button></div>
    <div class="modal-body">
      <p style="font-size:12px;color:var(--muted);margin:0 0 10px">把已存在的概念绑定到当前笔记《${ESC((currentNoteData&&currentNoteData.title)||'')}》。绑定后该概念详情页的「被以下笔记引用」会列出本文。</p>
      <datalist id="linkConceptList">${opts}</datalist>
      <input class="extract-input" id="linkConceptName" list="linkConceptList" placeholder="输入或选择概念名（须与已有概念完全一致）" style="width:100%;margin-bottom:10px" autocomplete="off">
      <div style="font-size:11px;color:var(--faint);margin-bottom:14px">已关联：${already.length?ESC(already.join('、')):'（无）'}</div>
      <div style="display:flex;gap:8px;justify-content:flex-end">
        <button class="btn-g" data-action="closeModal">取消</button>
        <button class="btn-p" data-action="confirmLinkConcept">关联</button>
      </div>
    </div>`;
  document.getElementById('modalMask').classList.add('show');
  const inp = document.getElementById('linkConceptName');
  if(inp) inp.focus();
}

async function confirmLinkConcept(){
  const inp = document.getElementById('linkConceptName');
  if(!inp){ return; }
  const nm = (inp.value || '').trim();
  if(!nm){ alert('请输入概念名'); return; }
  let concepts = [];
  try{ concepts = await get('/items?type=concept'); }catch(e){ concepts = []; }
  const exists = concepts.some(c => c.title === nm);
  if(!exists){ alert('未找到概念「' + nm + '」，请先用「提取概念」创建，或检查名称是否完全一致'); return; }
  const fp = currentNotePath;
  const current = (currentNoteData && currentNoteData.concepts) || [];
  if(current.includes(nm)){ alert('《' + nm + '》已关联本文'); closeModal(); return; }
  try{
    await put('/item', {path: fp, concepts: current.concat([nm])});
    closeModal();
    await loadNoteContent(encodeURIComponent(fp), {push:false});
  }catch(e){ alert('关联失败：' + (e && e.message ? e.message : e)); }
}
