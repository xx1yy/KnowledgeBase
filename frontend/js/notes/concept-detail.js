// Concept Detail — 概念查看/编辑（主区分栏显示，不覆盖笔记）
let _recentConcepts = null;

// 关系类型词典（概念间各种关联）——后端 get_graph_data / 前端图谱共用
const RELATION_TYPES = [
  {value:'相关', label:'相关', color:'#9aa0b5'},
  {value:'延伸', label:'延伸', color:'#534AB7'},
  {value:'属于', label:'属于', color:'#0F6E56'},
  {value:'包含', label:'包含', color:'#1D9E75'},
  {value:'前置', label:'前置/依赖', color:'#185FA5'},
  {value:'对立', label:'对立/对比', color:'#A32D2D'},
  {value:'实例', label:'实例/应用', color:'#BA7517'},
  {value:'因果', label:'因果', color:'#993C1D'},
  {value:'来源', label:'来源/派生', color:'#712B13'},
];
const RELATION_COLORS = {};
RELATION_TYPES.forEach(r => { RELATION_COLORS[r.value] = r.color; });

// 从 wikilink 形式取出概念名（'[[3-概念/涌现]]' → '涌现'）
function _linkTargetName(raw){
  let s = (raw||'').trim();
  if(s.startsWith('[[') && s.endsWith(']]')) s = s.slice(2, -2);
  return s.split('/').pop();
}

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
  const def = it.definition ? `<div class="extract-step">一句话定义</div><div class="extract-read">${renderNoteContent(it.definition)}</div>` : '';
  // content 只取核心解释段，截断后续段落避免与 how_to_use/excerpt 重复
  const safeContent = cleanConceptContent(it.content);
  const content = safeContent ? `<div class="extract-step">核心解释</div><div class="extract-read">${renderNoteContent(safeContent)}</div>` : '';
  const how = it.how_to_use ? `<div class="extract-step">怎么用</div><div class="extract-read">${renderNoteContent(it.how_to_use)}</div>` : '';
  const excerpt = it.excerpt ? `<div class="extract-step">原文摘录</div><blockquote class="md-quote">${renderNoteContent(it.excerpt)}</blockquote>` : '';
  const tags = (it.tags&&it.tags.length) ? `<div class="extract-step">标签</div><div>${it.tags.map(t=>`<span class="tag">${ESC(t)}</span>`).join(' ')}</div>` : '';
  const domain = it.domain ? `<div class="extract-step">领域</div><div class="extract-read">${ESC(it.domain)}</div>` : '';
  const relSec = renderRelationsHtml(it);
  return `
    <div style="margin-bottom:14px;padding:8px 12px;background:var(--asoft);border-radius:var(--radius-sm);font-size:11.5px;color:var(--muted)">
      💡 概念：<strong style="color:var(--accent)">${ESC(it.title)}</strong>
    </div>
    ${def}${content}${how}${excerpt}${tags}${domain}${relSec}
    <div class="extract-step">被以下笔记引用</div>
    <div class="detail-links" id="conceptSources">加载中…</div>`;
}

// 概念关系区：按类型分组、配色、可点击跳转；附「管理关系」入口
function renderRelationsHtml(it){
  const rels = (it.relations || []);
  const byType = {};
  rels.forEach(r => {
    const t = r.type || '相关';
    (byType[t] = byType[t] || []).push(r);
  });
  const types = Object.keys(byType);
  if(!types.length){
    return `<div class="extract-step">关系</div>
      <div id="conceptRels"><span style="color:var(--faint)">暂无结构化关系</span></div>
      <button class="btn-g sm" data-action="openRelationEditor" data-args='${JSON.stringify([it.path])}' style="margin-top:6px">＋ 管理关系</button>`;
  }
  const html = types.map(t => {
    const color = RELATION_COLORS[t] || '#9aa0b5';
    const items = byType[t].map(r => {
      const name = _linkTargetName(r.to);
      const path = `3-概念/${name}.md`;
      const note = r.note ? `<span style="color:var(--faint);font-size:11px"> · ${ESC(r.note)}</span>` : '';
      return `<a href="#" data-action="openDetail" data-args='${JSON.stringify([path])}' style="display:inline-flex;align-items:center;gap:4px;margin-right:8px;margin-bottom:4px">
        <span style="width:8px;height:8px;border-radius:50%;background:${color};display:inline-block"></span>${ESC(name)}</a>${note}`;
    }).join('');
    return `<div style="margin-bottom:6px"><span style="font-size:11px;color:${color};font-weight:600">${ESC(t)}</span>：${items}</div>`;
  }).join('');
  return `<div class="extract-step">关系</div>
    <div id="conceptRels">${html}</div>
    <button class="btn-g sm" data-action="openRelationEditor" data-args='${JSON.stringify([it.path])}' style="margin-top:6px">＋ 管理关系</button>`;
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

// ── 关系编辑器（概念间带类型关联） ──────────────────────
let _relRid = 0;

function _relationRowHtml(rid, r){
  r = r || {};
  const typeOpts = RELATION_TYPES.map(t =>
    `<option value="${t.value}" ${t.value === (r.type||'相关') ? 'selected' : ''}>${t.label}</option>`).join('');
  return `<div class="rel-row" data-rid="${rid}" style="display:flex;gap:6px;margin-bottom:6px;align-items:center">
    <input class="rel-to" list="relConcepts" value="${ESC(_linkTargetName(r.to))}" placeholder="目标概念" style="flex:1;min-width:0;padding:6px 8px;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--bg);color:var(--text)">
    <select class="rel-type" style="padding:6px 8px;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--bg);color:var(--text)">${typeOpts}</select>
    <input class="rel-note" value="${ESC(r.note||'')}" placeholder="备注" style="flex:1;min-width:0;padding:6px 8px;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--bg);color:var(--text)">
    <button class="btn-g sm" data-action="removeRelationRow" data-args='["${rid}"]' title="删除">✕</button>
  </div>`;
}

async function openRelationEditor(conceptPath){
  const fp = decodeURIComponent(conceptPath);
  let it;
  try{ it = await get(`/item?path=${encodeURIComponent(fp)}`); }
  catch(e){ return alert('概念未找到'); }
  let concepts = [];
  try{ concepts = await get('/items?type=concept'); }catch(e){ concepts = []; }
  const opts = concepts.filter(c => c.path !== fp).map(c => `<option value="${ESC(c.title)}">`).join('');
  const cur = (it.relations || []);
  const rows = cur.map(r => _relationRowHtml(++_relRid, r)).join('');
  document.getElementById('modal').innerHTML = `
    <div class="modal-head"><h3>管理关系 · ${ESC(it.title)}</h3><button class="modal-close" data-action="closeModal" data-args='[]'>✕</button></div>
    <div class="modal-body">
      <datalist id="relConcepts">${opts}</datalist>
      <div id="relRows">${rows || _relationRowHtml(++_relRid)}</div>
      <div style="display:flex;gap:8px;margin-top:8px">
        <button class="btn-g sm" data-action="addRelationRow" data-args='[]'>＋ 添加关系</button>
        <button class="btn-p sm" data-action="saveConceptRelations" data-args='${JSON.stringify([fp])}'>💾 保存</button>
      </div>
    </div>`;
  document.getElementById('modalMask').classList.add('show');
}

function addRelationRow(){
  const box = document.getElementById('relRows');
  if(box) box.insertAdjacentHTML('beforeend', _relationRowHtml(++_relRid));
}

function removeRelationRow(rid){
  const el = document.querySelector(`#relRows [data-rid="${rid}"]`);
  if(el) el.remove();
}

async function saveConceptRelations(conceptPath){
  const fp = decodeURIComponent(conceptPath);
  const rows = Array.from(document.querySelectorAll('#relRows .rel-row'));
  const relations = rows.map(row => {
    const to = (row.querySelector('.rel-to').value || '').trim();
    const type = (row.querySelector('.rel-type').value || '相关').trim();
    const note = (row.querySelector('.rel-note').value || '').trim();
    if(!to) return null;
    return {to: `[[3-概念/${to}]]`, type, note};
  }).filter(Boolean);
  try{
    await put('/item', {path: fp, relations});
    closeModal();
    // 重渲染：在笔记上下文中用 showConceptPage（其自身会回退到 openDetail）
    await showConceptPage(encodeURIComponent(fp), {push:false});
  }catch(e){ alert('保存失败：' + (e && e.message ? e.message : e)); }
}
