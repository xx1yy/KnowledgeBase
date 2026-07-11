// layout/sidebar.js — 侧边导航渲染
// 全局函数 renderNav()，被 app.js 的 init() 与 router.js（callAction('renderNav')）调用。
// 保持全局声明：actions.js 注册表 / window 兜底分发依赖全局函数名。

function renderNav(){
  document.getElementById('nav').innerHTML = `
    <div class="nav-label">总览</div>
    <button class="nav-item ${currentView==='dashboard'?'active':''}" data-action="navigate" data-args='["dashboard"]'>
      <span class="nav-i">🏠</span><span>仪表盘</span>
    </button>
    <button class="nav-item ${currentView==='search'?'active':''}" data-action="navigate" data-args='["search"]'>
      <span class="nav-i">🔍</span><span>搜索</span>
    </button>
    <button class="nav-item ${currentView==='graph'?'active':''}" data-action="navigate" data-args='["graph"]'>
      <span class="nav-i">🕸️</span><span>知识图谱</span>
    </button>
    <button class="nav-item ${currentView==='tags'?'active':''}" data-action="navigate" data-args='["tags"]'>
      <span class="nav-i">🏷️</span><span>标签</span>
      <span class="nav-n">${counts['tagCount']||0}</span>
    </button>
    <button class="nav-item ${currentView==='domains'?'active':''}" data-action="navigate" data-args='["domains"]'>
      <span class="nav-i">🗂️</span><span>领域</span>
      <span class="nav-n">${counts['domainCount']||0}</span>
    </button>
    <div class="nav-label">内容</div>
    ${TYPES.map(t=>`<button class="nav-item ${currentView===t.key?'active':''}" data-action="navigate" data-args='${JSON.stringify([t.key])}'>
      <span class="nav-i">${t.icon}</span><span>${t.label}</span>
      <span class="nav-n">${counts[t.key]||0}</span>
    </button>`).join('')}
    <button class="nav-item ${currentView==='book-notes'?'active':''}" data-action="navigate" data-args='["book-notes"]'>
      <span class="nav-i">📝</span><span>文学笔记</span>
      <span class="nav-n">${counts['book-notes']||0}</span>
    </button>
    <button class="nav-item ${currentView==='video-notes'?'active':''}" data-action="navigate" data-args='["video-notes"]'>
      <span class="nav-i">📺</span><span>视频笔记</span>
      <span class="nav-n">${counts['video-notes']||0}</span>
    </button>
    <button class="nav-item ${currentView==='post-notes'?'active':''}" data-action="navigate" data-args='["post-notes"]'>
      <span class="nav-i">📱</span><span>帖子笔记</span>
      <span class="nav-n">${counts['post-notes']||0}</span>
    </button>
    `;
}

// 侧栏折叠（状态持久化到 localStorage）
function toggleSidebar(){
  document.body.classList.toggle('sidebar-collapsed');
  try{ localStorage.setItem('kb_sidebar', document.body.classList.contains('sidebar-collapsed')?'1':'0'); }catch(e){}
}
