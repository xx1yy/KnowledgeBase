// Concept Detail — 概念查看/编辑（主区分栏显示，不覆盖笔记）
let _recentConcepts = null;

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

// 笔记页点概念：在主阅读区分栏显示（左=笔记原文，右=概念），与「提取概念」布局一致
async function showConceptPage(filepath, opts){
  opts = opts || {};
  const fp = decodeURIComponent(filepath);
  let it;
  try{ it = await get(`/item?path=${encodeURIComponent(fp)}`); }
  catch(e){ return alert('概念未找到'); }
  if(!it || it.type !== 'concept'){ openDetail(filepath, {push:false}); return; }

  const reader = document.getElementById('noteReader');
  const inNote = !!reader && !!currentNotePath && !!currentNoteData;
  if(!inNote){ openDetail(filepath, {push:false}); return; }

  const parentName = (currentNotePath ? currentNotePath.split('/').slice(-2,-1)[0] : '') || it.source || '';

  // 右侧栏：仅放操作（与提取概念一致）
  renderRightbar({
    actions: [
      {label:'← 返回笔记', action:'history.back', args:[]},
      {label:'✏️ 编辑概念', action:'enterConceptEdit', args:[fp], type:'primary'}
    ],
    info: `概念：${it.title}<br>来源：${parentName||'—'}`
  });

  reader.innerHTML = `
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px">
      <span class="type-badge type-concept">💡 ${ESC(parentName)}</span>
      <span style="font-size:13px;font-weight:600;color:var(--muted)">💡 概念详情</span>
    </div>
    <div class="extract-split" id="extractSplit">
      <div class="extract-split-left">
        <h1>${ESC(currentNoteData.title)}</h1>
        ${renderNoteContent(currentNoteData.content)}
      </div>
      <div class="extract-resizer" id="splitResizer"></div>
      <div class="extract-split-right" id="conceptPane">${conceptViewHtml(it, fp)}</div>
    </div>`;

  initSplitResizer();

  loadSourcesForConcept(it.title);
  if(opts.push !== false) pushHistory({type:'concept', conceptPath: filepath, notePath: currentNotePath});
}

// 从 concept 的 content 字段中剔除 "## 怎么用"/"## 原文摘录" 等后续段落
// 防止 renderNoteContent 渲染出完整正文（与独立的 how_to_use/excerpt 字段重复显示）
function cleanConceptContent(raw){
  if(!raw) return raw;
  // 截断到第一个 ## 怎么用 或 ## 原文摘录 之前
  const idx = raw.search(/\n##\s*(?:怎么用|原文摘录)\b/m);
  return idx > 0 ? raw.substring(0, idx).trim() : raw;
}

function conceptViewHtml(it, fp){
  const def = it.definition ? `<div class="extract-step">一句话定义</div><div class="extract-read">${ESC(it.definition)}</div>` : '';
  // content 只取核心解释段，截断后续段落避免与 how_to_use/excerpt 重复
  const safeContent = cleanConceptContent(it.content);
  const content = safeContent ? `<div class="extract-step">核心解释</div><div class="extract-read">${renderNoteContent(safeContent)}</div>` : '';
  const how = it.how_to_use ? `<div class="extract-step">怎么用</div><div class="extract-read">${ESC(it.how_to_use)}</div>` : '';
  const excerpt = it.excerpt ? `<div class="extract-step">原文摘录</div><blockquote class="md-quote">${ESC(it.excerpt)}</blockquote>` : '';
  const tags = (it.tags&&it.tags.length) ? `<div class="extract-step">标签</div><div>${it.tags.map(t=>`<span class="tag">${ESC(t)}</span>`).join(' ')}</div>` : '';
  const domain = it.domain ? `<div class="extract-step">领域</div><div class="extract-read">${ESC(it.domain)}</div>` : '';
  return `
    <div style="margin-bottom:14px;padding:8px 12px;background:var(--asoft);border-radius:var(--radius-sm);font-size:11.5px;color:var(--muted)">
      💡 概念：<strong style="color:var(--accent)">${ESC(it.title)}</strong>
    </div>
    ${def}${content}${how}${excerpt}${tags}${domain}
    <div class="extract-step">被以下笔记引用</div>
    <div class="detail-links" id="conceptSources">加载中…</div>`;
}

async function enterConceptEdit(filepath){
  const fp = decodeURIComponent(filepath);
  let it;
  try{ it = await get(`/item?path=${encodeURIComponent(fp)}`); }
  catch(e){ return alert('概念未找到'); }
  const pane = document.getElementById('conceptPane');
  if(!pane) return;
  pane.innerHTML = `
    <div style="margin-bottom:14px;padding:8px 12px;background:var(--asoft);border-radius:var(--radius-sm);font-size:11.5px;color:var(--muted)">
      ✏️ 编辑概念：<strong style="color:var(--accent)">${ESC(it.title)}</strong>
    </div>
    <div class="extract-step">一句话定义</div>
    <input class="extract-input" id="ce_definition" type="text" value="${ESC(it.definition||'')}" style="margin-bottom:10px">
    <div class="extract-step">核心解释</div>
    <textarea class="extract-area" id="ce_content" style="min-height:160px;margin-bottom:10px">${ESC(it.content||'')}</textarea>
    <div class="extract-step">怎么用</div>
    <textarea class="extract-area" id="ce_howto" style="min-height:90px;margin-bottom:10px">${ESC(it.how_to_use||'')}</textarea>
    <div class="extract-step">原文摘录</div>
    <textarea class="extract-area" id="ce_excerpt" style="min-height:90px;margin-bottom:10px">${ESC(it.excerpt||'')}</textarea>
    <div class="extract-step">来源</div>
    <input class="extract-input" id="ce_source" type="text" value="${ESC(it.source||'')}" style="margin-bottom:10px">
    <div class="extract-step">领域</div>
    <input class="extract-input" id="ce_domain" type="text" value="${ESC(it.domain||'')}" style="margin-bottom:10px">
    <div class="extract-step">标签（逗号分隔）</div>
    <input class="extract-input" id="ce_tags" type="text" value="${ESC((it.tags||[]).join(', '))}">`;
  renderRightbar({
    actions: [
      {label:'← 返回', action:'showConceptPage', args:[fp, {push:false}]},
      {label:'💾 保存', action:'saveConceptEdit', args:[fp], type:'primary'}
    ],
    info: `编辑中：${it.title}`
  });
}

async function saveConceptEdit(filepath){
  const fp = decodeURIComponent(filepath);
  const val = id => { const el = document.getElementById(id); return el ? el.value : ''; };
  const data = {
    definition: val('ce_definition'),
    content: val('ce_content'),
    how_to_use: val('ce_howto'),
    excerpt: val('ce_excerpt'),
    source: val('ce_source').trim(),
    domain: val('ce_domain').trim(),
    tags: val('ce_tags').split(/[,，、]/).map(s=>s.trim()).filter(Boolean)
  };
  try{
    await put('/item', {path: fp, ...data});
    await loadDashboard();
    clearRecentConceptsCache();
    await loadRecentConcepts();
    showConceptPage(encodeURIComponent(fp), {push:false});
  }catch(e){ alert('保存失败：' + (e && e.message ? e.message : e)); }
}

// 概念被哪些笔记引用（供 showConceptPage 和 openDetail 调用）
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
      return `<a href="#" data-action="openDetail" data-args='${JSON.stringify([n.path])}' style="display:inline-flex;align-items:center;gap:4px;margin-right:8px;margin-bottom:4px">${iconMap[n.type]||'📄'} ${ESC(parent)} — ${ESC(String(n.title||'').replace(/-文学笔记|-视频笔记/g,''))}</a>`;
    }).join('');
  }catch(e){
    el.innerHTML = '<span style="color:var(--faint)">加载失败</span>';
  }
}
