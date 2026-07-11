// core/event-delegation.js — 统一事件委托
// 全局函数 initEventDelegation()，由 app.js 的 init() 启动期调用一次。
// 依赖 callAction()（actions.js，最后加载）；事件委托在用户交互时触发，callAction 彼时已就绪。
// 保持全局声明。

/* ── 统一事件委托（替代内联 onclick，消除 XSS 风险） ── */
function initEventDelegation(){
  // 挂载到 document 而非 #content，确保 nav / rightbar / modal 等所有区域的 data-action 都能响应
  const root = document;
  if(!root) return;

  // click 事件委托：data-action + data-args(JSON 数组)
  root.addEventListener('click', function(e){
    const el = e.target.closest('[data-action]');
    if(!el) return;
    const action = el.dataset.action;

    // 特殊处理：遮罩层关闭（仅当点击目标是遮罩本身）
    if(action === 'closeModalOnMask' && e.target !== el) return;

    let args = [];
    try{ args = JSON.parse(el.dataset.args || '[]'); }catch(ex){ args = []; }
    if(!Array.isArray(args)) args = [args];

    // 支持复合动作 "funcA|funcB"，各自带对应参数（args[索引] 为数组时优先）
    const actions = action.split('|');
    for(const a of actions){
      const fnName = a.trim();
      if(!fnName) continue;
      const argIdx = actions.indexOf(a);
      const subArgs = (argIdx >= 0 && Array.isArray(args[argIdx])) ? args[argIdx] : args;
      if(fnName.includes('.')){
        // 支持 "history.back" 这种多级属性路径（window.history.back）
        const parts = fnName.split('.');
        let obj = window;
        for(const p of parts){ if(obj) obj = obj[p]; }
        if(typeof obj === 'function') obj(...subArgs);
      } else {
        // callAction 是「执行式」分发器：在其内部执行处理器并传入参数。
        // 绝不能写成 `fn = callAction(name)` 再 `fn(...args)` —— 那会先无参执行一次，再把返回值当函数二次调用，导致 openDetail()/navigate() 丢失参数。
        callAction(fnName, ...subArgs);
      }
    }
    // 如果元素有 href="#" 且不是真正的链接，阻止默认行为
    if(el.tagName === 'A' && el.getAttribute('href') === '#') e.preventDefault();
  });

  // change 事件委托（select 等）
  root.addEventListener('change', function(e){
    const el = e.target.closest('[data-change]');
    if(!el) return;
    const action = el.dataset.change;
    callAction(action, e.target.value, el);
  });

  // input 事件委托
  root.addEventListener('input', function(e){
    const el = e.target.closest('[data-input]');
    if(!el) return;
    const action = el.dataset.input;
    callAction(action, e.target.value, el);
  });

  // 拖拽事件委托（dragstart/dragover/dragend/drop）
  ['dragstart','dragover','dragend','drop'].forEach(evtType => {
    const dataAttr = 'data-drag-' + evtType;
    const camel = 'drag' + evtType.charAt(0).toUpperCase() + evtType.slice(1);
    root.addEventListener(evtType, function(e){
      const el = e.target.closest('[' + dataAttr + ']');
      if(!el) return;
      const action = el.dataset[camel];
      let rawArgs = el.dataset.args || '[]';
      if(evtType === 'drop' && el.dataset.dropArgs) rawArgs = el.dataset.dropArgs;
      let args = [];
      try{ args = JSON.parse(rawArgs); }catch(ex){ args = []; }
      callAction(action, e, ...args);
      e.preventDefault();
    });
  });
}
