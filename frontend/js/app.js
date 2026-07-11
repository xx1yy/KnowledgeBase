// App 入口 — 仅负责启动初始化（init）。
// 其余职责已拆分到独立模块（保持全局函数声明，兼容 actions.js 注册表）：
//   layout/sidebar.js      → renderNav / toggleSidebar
//   layout/rightbar.js     → renderRightbar / toggleRightbar
//   layout/resizer.js      → initSplitResizer / initChapterResizer
//   views/detail.js        → openDetail / showBookCover / showVideoCover
//   views/search.js        → renderSearch + 搜索框输入监听
//   core/event-delegation.js → initEventDelegation
// 所有模块在 dashboard.html 中于本文件之前（actions.js 之前）加载。

// 启动
(async function init(){
  try{
    if(localStorage.getItem('kb_sidebar')==='1') document.body.classList.add('sidebar-collapsed');
    if(localStorage.getItem('kb_rightbar')==='1') document.body.classList.add('rightbar-collapsed');
    await fetchAuthToken();   // 先获取认证 token
    initDomainFilter();       // 填充领域过滤器（currentDomain 已在加载期从 localStorage 恢复）
    await loadDashboard();
    await loadRecentConcepts();
    renderNav();
    renderDashboard();
    history.replaceState({type:'view', view:'dashboard'}, '');
    renderRightbar({actions:[]});
  }catch(e){
    console.error('[KB] init error:', e);
    document.getElementById('content').innerHTML =
      '<div class="empty"><div class="big">🔴</div>初始化错误<p style="margin-top:10px;color:var(--faint)">'+ESC(e.message||e)+'</p></div>';
  }
  // 无论上面是否出错，事件委托必须注册（否则所有按钮无法点击）
  try { initEventDelegation(); } catch(e){ console.error('[KB] initEventDelegation error:', e); }
  updateApiStatus();
})();
