// layout/rightbar.js — 右侧快捷面板渲染
// 全局函数 renderRightbar(ctx)，被 openDetail / 各视图 / init() 调用（含 callAction('renderRightbar') 兜底）。
// 保持全局声明：actions.js 注册表 / window 兜底分发依赖全局函数名。

function renderRightbar(ctx){
  const el = document.getElementById('rightbarBody');
  if(!el) return;

  let html = '';

  // ── 最近概念 ──
  html += `<div class="rightbar-section"><div class="rightbar-h">💡 最近概念</div>`;
  if(!_recentConcepts || !_recentConcepts.length){
    html += `<div style="font-size:11.5px;color:var(--faint);padding:4px 0">暂无概念</div>`;
  } else {
    _recentConcepts.slice(0, 8).forEach(c => {
      const count = (c.excerpt ? 1 : 0) + (c.definition ? 1 : 0) + (c.how_to_use ? 1 : 0);
      const fill = count >= 3 ? 'var(--accent)' : count >= 1 ? 'var(--orange)' : 'var(--faint)';
      html += `<a class="rightbar-concept" href="#" data-action="showConceptPage" data-args='${JSON.stringify([c.path])}' title="${ESC(c.title)}">
        <span class="rc-dot" style="background:${fill}"></span>
        <span class="rc-name">${ESC(c.title)}</span>
        <span class="rc-date">${FMTREL(c.mtime)}</span>
      </a>`;
    });
  }
  html += `</div>`;

  // ── 笔记概念 ──
  if(ctx.concepts && ctx.concepts.length){
    html += `<div class="rightbar-section">
      <div class="rightbar-h">💡 本文概念</div>
      ${ctx.concepts.map(c => `<a class="rightbar-concept" href="#" data-action="showConceptPage" data-args='${JSON.stringify([c.path])}' title="${ESC(c.title)}">
        <span class="rc-dot" style="background:${c.fill}"></span>
        <span class="rc-name">${ESC(c.title)}</span>
      </a>`).join('')}
    </div>`;
  }

  // ── 页面操作 ──
  if(ctx.actions && ctx.actions.length){
    html += `<div class="rightbar-section">
      <div class="rightbar-h">⚡ 页面操作</div>
      <div class="rightbar-actions">
        ${ctx.actions.map(a => {
          const args = a.args ? JSON.stringify(a.args) : '[]';
          if(a.type === 'danger'){
            return `<button class="btn-g btn-danger" data-action="${a.action}" data-args='${args}'>${a.label}</button>`;
          }
          if(a.type === 'primary'){
            return `<button class="btn-p" data-action="${a.action}" data-args='${args}'>${a.label}</button>`;
          }
          return `<button class="btn-g" data-action="${a.action}" data-args='${args}'>${a.label}</button>`;
        }).join('')}
      </div>
    </div>`;
  }

  // ── 快速信息 ──
  if(ctx.info){
    html += `<div class="rightbar-section">
      <div class="rightbar-h">📋 信息</div>
      <div style="font-size:11.5px;color:var(--muted);line-height:1.7">${ctx.info}</div>
    </div>`;
  }

  el.innerHTML = html;
}

// 右侧栏折叠（状态持久化到 localStorage）
function toggleRightbar(){
  document.body.classList.toggle('rightbar-collapsed');
  try{ localStorage.setItem('kb_rightbar', document.body.classList.contains('rightbar-collapsed')?'1':'0'); }catch(e){}
}
