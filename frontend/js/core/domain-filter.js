// core/domain-filter.js — 全局领域过滤器（多选 OR；持久化到 localStorage）
// 全局状态 currentDomain（逗号分隔的已选领域，空串=全部）、withDomain(url) 拼接查询串。
// 保持全局声明：actions.js 注册表 / window 兜底分发依赖全局函数名。

let currentDomain = localStorage.getItem('kb_domain') || '';

// 把领域过滤参数正确拼到 URL（自动选择 ? 或 &）
function withDomain(url){
  if(!currentDomain) return url;
  const sep = url.includes('?') ? '&' : '?';
  return url + sep + 'domain=' + encodeURIComponent(currentDomain);
}

function updateDomainLabel(){
  const label = document.getElementById('domainFilterLabel');
  if(!label) return;
  if(!currentDomain){ label.textContent = '全部领域'; }
  else { const n = currentDomain.split(',').filter(Boolean).length; label.textContent = n + ' 个领域'; }
}

async function initDomainFilter(){
  const root = document.getElementById('domainFilter');
  const pop = document.getElementById('domainFilterPop');
  const list = document.getElementById('domainFilterList');
  const all = document.getElementById('dfAll');
  const btn = document.getElementById('domainFilterBtn');
  if(!root || !pop || !list || !all || !btn) return;

  updateDomainLabel();

  // 拉取领域列表填充复选项
  let domains = [];
  try { domains = await get('/domains'); } catch(e){ domains = []; }
  list.innerHTML = (domains || []).map(d =>
    `<label class="domain-opt"><input type="checkbox" class="df-item" value="${ESC(d.name)}"> ${ESC(d.name)} <span class="domain-cnt">${d.count}</span></label>`
  ).join('');

  // 恢复已选状态（来自 localStorage）
  const saved = currentDomain.split(',').filter(Boolean);
  if(saved.length){
    all.checked = false;
    list.querySelectorAll('.df-item').forEach(cb => { cb.checked = saved.includes(cb.value); });
  }

  // 展开 / 收起弹层
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    pop.style.display = (pop.style.display === 'block') ? 'none' : 'block';
  });
  document.addEventListener('click', (e) => {
    if(!root.contains(e.target)) pop.style.display = 'none';
  });

  function applySelection(){
    const checked = [...list.querySelectorAll('.df-item:checked')].map(cb => cb.value);
    if(checked.length === 0){
      all.checked = true;
      currentDomain = '';
    } else {
      all.checked = false;
      currentDomain = checked.join(',');
    }
    localStorage.setItem('kb_domain', currentDomain);
    updateDomainLabel();
    dashboardData = null;   // 强制仪表盘下次重新拉取（含新过滤）
    if(typeof navigate === 'function') navigate(currentView, {push:false});
  }

  all.addEventListener('change', applySelection);
  list.querySelectorAll('.df-item').forEach(cb => cb.addEventListener('change', applySelection));
}
