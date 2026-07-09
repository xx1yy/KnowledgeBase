// Domains - 领域索引（MOC 枢纽式聚合视图）
async function renderDomains(){
  let domains;
  try{
    domains = await get('/domains');
  }catch(e){
    domains = [];
  }
  counts['domainCount'] = domains.length;
  renderNav();

  const c = document.getElementById('content');
  if(!domains.length){
    c.innerHTML = `<div class="empty"><div class="big">🗂️</div>还没有任何领域
      <span style="font-size:12px;color:var(--faint);margin-top:10px;display:block">在创建「概念 / 问题」时填写「领域」字段即可自动生成。<br>一个概念可属于多个领域，用逗号分隔，如：行为经济学，自控方法</span></div>`;
    return;
  }

  // 字号按频次缩放（领域云效果）
  const max = Math.max(...domains.map(d=>d.count));
  const min = Math.min(...domains.map(d=>d.count));
  const sizeFor = n => {
    if(max===min) return 14;
    return 12 + Math.round((n-min)/(max-min)*10);
  };

  c.innerHTML = `
    <p style="color:var(--muted);margin-bottom:14px;font-size:13px">共 ${domains.length} 个领域 · 点击领域查看所属概念与问题，按类型分组。这是你知识库的「枢纽」——概念先归到领域，再慢慢连。</p>
    <div class="tag-cloud">
      ${domains.map(d=>`<div class="tag-chip" style="font-size:${sizeFor(d.count)}px" title="${d.count} 条">
        <span class="tag-chip-name" onclick="viewDomainItems('${encodeURIComponent(d.name)}')">${ESC(d.name)}</span>
        <span class="tag-chip-count">${d.count}</span>
      </div>`).join('')}
    </div>`;
}

async function viewDomainItems(name){
  name = decodeURIComponent(name);
  let domains;
  try{ domains = await get('/domains'); }catch(e){ domains = []; }
  const d = domains.find(x => x.name === name);
  if(!d || !d.paths || !d.paths.length){
    return alert('该领域下暂无条目');
  }
  let items = [];
  try{
    items = await Promise.all(d.paths.map(p => get('/item?path=' + encodeURIComponent(p)).catch(()=>null)));
    items = items.filter(Boolean);
  }catch(e){}
  items.sort((a,b)=>(b.mtime||0)-(a.mtime||0));

  // 按类型分组
  const groups = {};
  for(const it of items){
    (groups[it.type] = groups[it.type] || []).push(it);
  }
  const order = ['concept','problem','plan','reflection','book','video','quicknote','book-notes','video-notes'];
  const typeList = Object.keys(groups).sort((a,b)=>order.indexOf(a)-order.indexOf(b));

  const groupHtml = typeList.map(t=>`
    <div class="detail-section">
      <h4>${TYPE_MAP[t]?.label||t} · ${groups[t].length}</h4>
      ${groups[t].map(it=>`<div class="panel" style="cursor:pointer;margin-bottom:6px;padding:9px 12px" onclick="closeModal();openDetail('${encodeURIComponent(it.path)}')">
        <div style="display:flex;align-items:center;gap:8px">
          <span style="font-size:13.5px;font-weight:600">${ESC(it.title)}</span>
          <span style="font-size:11px;color:var(--faint);margin-left:auto">${FMTREL(it.mtime)}</span>
        </div>
      </div>`).join('')}
    </div>`).join('');

  document.getElementById('modal').innerHTML = `
    <div class="modal-head"><h3>🗂️ ${ESC(name)} · ${items.length} 条</h3><button class="modal-close" onclick="closeModal()">×</button></div>
    <div class="modal-body" style="max-height:62vh;overflow:auto">
      ${groupHtml || '<div class="empty-hint">该领域下暂无条目</div>'}
    </div>
    <div class="modal-foot"><button class="btn-g" onclick="closeModal()">关闭</button></div>`;
  document.getElementById('modalMask').classList.add('show');
}
