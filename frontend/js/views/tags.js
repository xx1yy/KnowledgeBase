// Tags - 标签云 & 标签管理
function closeModalThenOpenDetail(path){
  closeModal();
  openDetail(path);
}
async function renderTags(){
  let tags;
  try{
    tags = await get('/tags');
  }catch(e){
    tags = [];
  }
  counts['tagCount'] = tags.length;
  renderNav();

  const c = document.getElementById('content');
  if(!tags.length){
    c.innerHTML = `<div class="empty"><div class="big">🏷️</div>还没有任何标签
      <span style="font-size:12px;color:var(--faint);margin-top:10px;display:block">创建书籍 / 视频 / 概念 / 问题 / 快速记录时填写「标签」即可自动生成</span></div>`;
    return;
  }

  // 字号按频次缩放（标签云效果）
  const max = Math.max(...tags.map(t=>t.count));
  const min = Math.min(...tags.map(t=>t.count));
  const sizeFor = n => {
    if(max===min) return 14;
    return 12 + Math.round((n-min)/(max-min)*10);
  };

  c.innerHTML = `
    <p style="color:var(--muted);margin-bottom:14px;font-size:13px">共 ${tags.length} 个标签 · 点击标签查看所属条目，悬停右侧可重命名或删除</p>
    <div class="tag-cloud">
      ${tags.map(t=>`<div class="tag-chip" style="font-size:${sizeFor(t.count)}px" title="${t.count} 条">
        <span class="tag-chip-name" data-action="viewTagItems" data-args='${JSON.stringify([t.name])}'>${ESC(t.name)}</span>
        <span class="tag-chip-count">${t.count}</span>
        <span class="tag-chip-actions">
          <button class="tag-mini" title="重命名" data-action="renameTag" data-args='${JSON.stringify([t.name])}'>✎</button>
          <button class="tag-mini tag-del" title="删除" data-action="deleteTag" data-args='${JSON.stringify([t.name])}'>×</button>
        </span>
      </div>`).join('')}
    </div>`;
}

async function viewTagItems(name){
  name = decodeURIComponent(name);
  let tags;
  try{ tags = await get('/tags'); }catch(e){ tags = []; }
  const t = tags.find(x => x.name === name);
  if(!t || !t.paths || !t.paths.length){
    return alert('该标签下暂无条目');
  }
  let items = [];
  try{
    items = await Promise.all(t.paths.map(p => get('/item?path=' + encodeURIComponent(p)).catch(()=>null)));
    items = items.filter(Boolean);
  }catch(e){}
  items.sort((a,b)=>(b.mtime||0)-(a.mtime||0));

  document.getElementById('modal').innerHTML = `
    <div class="modal-head"><h3>🏷️ ${ESC(name)} · ${items.length} 条</h3><button class="modal-close" data-action="closeModal" data-args='[]'>×</button></div>
    <div class="modal-body" style="max-height:62vh;overflow:auto">
      ${items.length ? items.map(it=>`<div class="panel" style="cursor:pointer;margin-bottom:8px" data-action="closeModalThenOpenDetail" data-args='${JSON.stringify([it.path])}'>
        <div style="display:flex;align-items:center;gap:8px">
          <span class="type-badge ${TYPE_MAP[it.type]?.typeCls||''}">${TYPE_MAP[it.type]?.label||it.type}</span>
          <span style="font-size:13.5px;font-weight:600">${ESC(it.title)}</span>
          <span style="font-size:11px;color:var(--faint);margin-left:auto">${FMTREL(it.mtime)}</span>
        </div>
      </div>`).join('') : '<div class="empty-hint">该标签下暂无条目</div>'}
    </div>
    <div class="modal-foot"><button class="btn-g" data-action="closeModal" data-args='[]'>关闭</button></div>`;
  document.getElementById('modalMask').classList.add('show');
}

async function renameTag(name){
  name = decodeURIComponent(name);
  const nv = prompt('重命名标签「'+name+'」为：', name);
  if(nv === null) return;
  const newName = nv.trim();
  if(!newName) return alert('名称不能为空');
  if(newName === name) return;
  try{
    const r = await put('/tags', {from: name, to: newName});
    if(r.changed > 0){
      await renderTags();
    } else {
      alert('未找到使用该标签的条目');
    }
  }catch(e){
    alert('重命名失败：' + (e.message || e));
  }
}

async function deleteTag(name){
  name = decodeURIComponent(name);
  if(!confirm('确定删除标签「'+name+'」？\n将从所有条目中移除该标签（条目本身不会删除）。')) return;
  try{
    const r = await put('/tags', {from: name, to: ''});
    if(r.changed > 0){
      await renderTags();
    } else {
      alert('未找到使用该标签的条目');
    }
  }catch(e){
    alert('删除失败：' + (e.message || e));
  }
}
