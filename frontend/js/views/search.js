// views/search.js — 搜索视图
// 全局函数 renderSearch()；侧栏搜索框的输入监听在加载时挂载（searchBox 已存在于 DOM）。
// 保持全局声明：router.js 通过 callAction('renderSearch') 调用，本文件直接在运行时调用。

// 搜索
let searchTimer;
async function renderSearch(){
  const q = document.getElementById('searchBox').value.trim();
  if(!q) return document.getElementById('content').innerHTML = `<div class="empty"><div class="big">🔍</div>输入关键词搜索</div>`;
  const results = await get(`/search?q=${encodeURIComponent(q)}`);
  if(!results.length) return document.getElementById('content').innerHTML = `<div class="empty"><div class="big">🔍</div>没有找到「${ESC(q)}」</div>`;
  document.getElementById('content').innerHTML = `<p style="color:var(--muted);margin-bottom:14px">找到 ${results.length} 条结果</p>` + results.map(r=>`<div class="panel" style="cursor:pointer" data-action="openDetail" data-args='${JSON.stringify([r.path])}'>
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:5px">
      <span class="type-badge ${TYPE_MAP[r.type]?.typeCls||''}">${TYPE_MAP[r.type]?.label||r.type}</span>
      <span style="font-size:12px;color:var(--faint)">${FMTREL(r.mtime)}</span>
    </div>
    <div style="font-size:13.5px;font-weight:600">${ESC(r.title)}</div>
    <div style="font-size:12px;color:var(--muted);margin-top:4px">${ESC(r.snippet||'')}</div>
  </div>`).join('');
}

// 侧边栏搜索输入监听
document.getElementById('searchBox').addEventListener('input', function(){
  if(currentView==='search') renderSearch();
});
