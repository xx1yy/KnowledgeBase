// Knowledge Graph — 力导向布局 + 可拖拽 + 缩放平移 + hover 高亮
// 节点散开（Fruchterman-Reingold），支持：拖节点移动 / 拖空白平移 / 滚轮缩放 / 悬停高亮邻居 / 点击打开详情

let _g = null;  // 模块级图谱状态
let _rawGraph = null;       // 最近一次 /graph 原始数据（过滤后重绘用）
let _hiddenTypes = new Set(); // 当前被隐藏的节点类型
let _windowBound = false;   // window 级(mousemove/up)只绑一次（读模块级 _g，永远最新）

// 节点类型 → 图标（与 core/utils.js 的 TYPE_MAP 保持一致，内联以保证图谱自包含）
const GRAPH_TYPE_ICONS = {book:'📚',video:'🎬',post:'📱',concept:'💡',reflection:'💭',problem:'❓',plan:'🎯','book-notes':'📝','video-notes':'📺','post-notes':'📱',quicknote:'⚡'};
const GRAPH_TYPE_LABELS = {book:'书籍',video:'视频',post:'帖子',concept:'概念',reflection:'反思',problem:'问题',plan:'计划','book-notes':'文学笔记','video-notes':'视频笔记','post-notes':'帖子笔记',quicknote:'闪念'};
// 关系类型 → 颜色（与 notes/concept-detail.js 的 RELATION_TYPES 保持一致，兜底用）
const GRAPH_REL_FB = [
  {value:'相关',label:'相关',color:'#9aa0b5'},{value:'延伸',label:'延伸',color:'#534AB7'},
  {value:'属于',label:'属于',color:'#0F6E56'},{value:'包含',label:'包含',color:'#1D9E75'},
  {value:'前置',label:'前置/依赖',color:'#185FA5'},{value:'对立',label:'对立/对比',color:'#A32D2D'},
  {value:'实例',label:'实例/应用',color:'#BA7517'},{value:'因果',label:'因果',color:'#993C1D'},
  {value:'来源',label:'来源/派生',color:'#712B13'},
];

// ── 布局持久化（localStorage，纯前端，跨刷新保留手动拖拽/缩放状态）──
const LS_KEY = 'kb-graph-layout-v1';
// 类型隐藏偏好（与布局分开存：重排只清布局，不清隐藏偏好）
const LS_KEY_HIDDEN = 'kb-graph-hidden-v1';
function _loadLayout(){
  try{ const raw=localStorage.getItem(LS_KEY); if(!raw) return null;
       const o=JSON.parse(raw); return (o&&o.nodes)?o:null;
  }catch(e){ return null; }
}
function _saveLayout(){
  if(!_g) return;
  const nodes={};
  _g.nodes.forEach(n=>{ nodes[n.id]={x:Math.round(n._x),y:Math.round(n._y),p:n._pinned?1:0}; });
  const payload={v:1, nodes, view:{x:Math.round(_g.view.x),y:Math.round(_g.view.y),s:_g.view.s}};
  try{ localStorage.setItem(LS_KEY, JSON.stringify(payload)); }catch(e){}
}
let _saveLayoutTimer=null;
function _saveLayoutDebounced(){
  if(_saveLayoutTimer) clearTimeout(_saveLayoutTimer);
  _saveLayoutTimer=setTimeout(_saveLayout, 300);
}
function _clearLayout(){ try{ localStorage.removeItem(LS_KEY); }catch(e){} }
// ── 类型隐藏偏好持久化 ──
function _loadHidden(){
  try{ const raw=localStorage.getItem(LS_KEY_HIDDEN); if(!raw) return new Set();
       const arr=JSON.parse(raw); return (Array.isArray(arr))?new Set(arr):new Set();
  }catch(e){ return new Set(); }
}
function _saveHidden(){
  try{ localStorage.setItem(LS_KEY_HIDDEN, JSON.stringify([..._hiddenTypes])); }catch(e){}
}
// 把当前 _x/_y 应用到 SVG（节点 transform + 边端点）。供「恢复布局」「重排」复用
function _applyPositions(){
  if(!_g) return;
  _g.nodeEls.forEach(n=>{ n._grp.setAttribute('transform',`translate(${n._x},${n._y})`); });
  _g.edgeEls.forEach(e=>{
    const s=_g.nodeById[e.source], t=_g.nodeById[e.target];
    if(s&&t){ e.el.setAttribute('x1',s._x); e.el.setAttribute('y1',s._y); e.el.setAttribute('x2',t._x); e.el.setAttribute('y2',t._y); }
  });
}

async function renderGraph(){
  const content = document.getElementById('content');
  content.innerHTML = `<div class="graph-container" id="graphBox">
    <div class="graph-toolbar">
      <button class="gbtn" data-g="reset" title="重新计算布局（并清除已保存的手动布局）">⟲ 重排</button>
      <button class="gbtn" data-g="fit" title="适应窗口">⤢ 适应</button>
      <span class="graph-hint">拖节点移动 · 拖空白平移 · 滚轮缩放 · 悬停高亮 · 点击打开 · 布局与隐藏状态自动保存</span>
    </div>
    <div class="graph-filters" id="graphFilters"></div>
  </div>`;
  const box = document.getElementById('graphBox');
  const data = await get(withDomain('/graph'));
  _rawGraph = data;
  _hiddenTypes = _loadHidden(); // 读取上次保存的隐藏类型偏好
  _buildFilters();
  // box / 工具栏是 renderGraph 新建的，事件在此绑一次（重建 svg 时 box 不变，不会重复绑）
  box.addEventListener('mousedown', _onDown);
  box.querySelectorAll('.gbtn').forEach(b=>{
    b.removeEventListener('click', _onGbtn);
    b.addEventListener('click', _onGbtn);
  });
  _buildGraph(data);
}

// 顶部类型过滤条：点击切换某类节点的显隐
function _buildFilters(){
  const box = document.getElementById('graphBox');
  const el = box.querySelector('#graphFilters');
  if(!_rawGraph) return;
  const types = [...new Set(_rawGraph.nodes.map(n=>n.type))];
  el.innerHTML = types.map(t=>{
    const off = _hiddenTypes.has(t);
    return `<button class="gchip${off?' off':''}" data-type="${t}" title="${off?'显示':'隐藏'}${GRAPH_TYPE_LABELS[t]||t}">
      <span class="gchip-ico">${GRAPH_TYPE_ICONS[t]||'●'}</span>${GRAPH_TYPE_LABELS[t]||t}</button>`;
  }).join('');
  el.querySelectorAll('.gchip').forEach(b=>{
    b.addEventListener('click', ()=>{
      const t=b.dataset.type, lbl=GRAPH_TYPE_LABELS[t]||t;
      if(_hiddenTypes.has(t)){ _hiddenTypes.delete(t); b.classList.remove('off'); b.title='隐藏'+lbl; }
      else { _hiddenTypes.add(t); b.classList.add('off'); b.title='显示'+lbl; }
      _saveHidden();   // 持久化隐藏偏好，跨刷新保留
      _rebuild();
    });
  });
}

// 过滤/布局变更后，移除旧 svg+图例+空提示，用最新 raw 数据重绘
function _rebuild(){
  if(!_rawGraph) return;
  const box = document.getElementById('graphBox');
  box.querySelectorAll('.graph-svg, .graph-legend, .graph-empty').forEach(e=>e.remove());
  _buildGraph(_rawGraph);
}

// 纯力导向布局：一次性把节点散开（用于初次/重排）
function _forceLayout(nodes, edges, W, H, iters){
  const N = nodes.length;
  const idx = {}; nodes.forEach((n,i)=>idx[n.id]=i);
  edges.forEach(e=>{ if(idx[e.source]!=null) nodes[idx[e.source]]._deg=(nodes[idx[e.source]]._deg||0)+1; if(idx[e.target]!=null) nodes[idx[e.target]]._deg=(nodes[idx[e.target]]._deg||0)+1; });
  // 初始：圆形 + 抖动，并尽量把同类节点放到相近角度（按 type 聚类，增强可读性）
  const typeOrder = {}; let tc=0;
  nodes.forEach(n=>{ if(!(n.type in typeOrder)) typeOrder[n.type]=tc++; });
  nodes.forEach((n,i)=>{
    const base = (typeOrder[n.type]||0)/Math.max(1,Object.keys(typeOrder).length);
    const a = (base + (i/N)*0.9)*Math.PI*2;
    const r = Math.min(W,H)*0.22;
    n._x = W/2 + Math.cos(a)*r + (Math.random()-0.5)*Math.min(W,H)*0.3;
    n._y = H/2 + Math.sin(a)*r + (Math.random()-0.5)*Math.min(W,H)*0.3;
    n._pinned = false;
  });
  const area = W*H;
  const k = 0.7*Math.sqrt(area/Math.max(1,N));    // 理想边长（偏小→图更紧凑）
  let t = Math.max(12, Math.min(W,H)*0.04);        // 低温退火：避免节点被轰飞
  for(let it=0; it<iters; it++){
    const disp = nodes.map(()=>({x:0,y:0}));
    // 斥力（库仑）：每对节点互相推开
    for(let i=0;i<N;i++){
      for(let j=i+1;j<N;j++){
        let dx=nodes[i]._x-nodes[j]._x, dy=nodes[i]._y-nodes[j]._y;
        let d2=dx*dx+dy*dy;
        if(d2<0.01){ dx=(Math.random()-0.5); dy=(Math.random()-0.5); d2=0.01; }
        const d=Math.sqrt(d2);
        const f=k*k/d;
        const fx=dx/d*f, fy=dy/d*f;
        disp[i].x+=fx; disp[i].y+=fy; disp[j].x-=fx; disp[j].y-=fy;
      }
    }
    // 引力（弹簧）：边两端拉近
    edges.forEach(e=>{
      const si=idx[e.source], ti=idx[e.target];
      if(si==null||ti==null)return;
      let dx=nodes[ti]._x-nodes[si]._x, dy=nodes[ti]._y-nodes[si]._y;
      const d=Math.sqrt(dx*dx+dy*dy)||0.01;
      const f=d*d/k;
      const fx=dx/d*f, fy=dy/d*f;
      disp[si].x+=fx; disp[si].y+=fy; disp[ti].x-=fx; disp[ti].y-=fy;
    });
    // 中心弱引力 + 应用位移（温度钳制）
    nodes.forEach((n,i)=>{
      if(n._pinned) return;
      disp[i].x += (W/2 - n._x)*0.6;
      disp[i].y += (H/2 - n._y)*0.6;
      const dl=Math.sqrt(disp[i].x*disp[i].x+disp[i].y*disp[i].y)||0.01;
      const lim=Math.min(dl, t);
      n._x += disp[i].x/dl*lim;
      n._y += disp[i].y/dl*lim;
      n._x=Math.max(24,Math.min(W-24,n._x));
      n._y=Math.max(24,Math.min(H-24,n._y));
    });
    t*=0.955; if(t<0.4)t=0.4;
  }
}

function _buildGraph(data){
  const box = document.getElementById('graphBox');
  if(!box) return;
  const W = box.clientWidth, H = box.clientHeight;
  const allNodes = data.nodes||[], edges = data.edges||[];
  const linkedIds = new Set();
  edges.forEach(e=>{linkedIds.add(e.source);linkedIds.add(e.target)});
  // 仅保留「有边相连」且「未被类型过滤隐藏」的节点
  const nodes = allNodes.filter(n=>linkedIds.has(n.id) && !_hiddenTypes.has(n.type));
  if(!nodes.length){
    // 不覆盖 box（会清掉工具栏/过滤条），只插入空提示
    const old = box.querySelector('.graph-empty'); if(old) old.remove();
    box.insertAdjacentHTML('beforeend', '<div class="graph-empty empty" style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center"><div class="big">🕸️</div>当前筛选下没有可显示的节点<br><span style="font-size:12px">在顶部过滤条重新勾选节点类型即可</span></div>');
    return;
  }

  _forceLayout(nodes, edges, W, H, 350);

  // 恢复已保存的手动布局：把保存过的节点钉到原坐标（pinned），其余交给力导向
  const saved = _loadLayout();
  if(saved && saved.nodes){
    let any=false;
    nodes.forEach(n=>{
      const s=saved.nodes[n.id];
      if(s){ n._x=s.x; n._y=s.y; n._pinned=!!s.p; any=true; }
    });
    if(any) _applyPositions();
  }

  const colors = {book:'var(--green)','book-notes':'#5b8c5a',video:'var(--orange)','video-notes':'#c87f3e',concept:'var(--accent)',reflection:'#7c5ce7',problem:'var(--red)',plan:'var(--orange)'};
  const _relGlobals = (typeof RELATION_COLORS !== 'undefined') ? RELATION_COLORS : {};
  const relColors = Object.assign({}, _relGlobals);
  GRAPH_REL_FB.forEach(r=>{ if(!relColors[r.value]) relColors[r.value]=r.color; });
  const nodeById = {}; nodes.forEach(n=>nodeById[n.id]=n);

  // 邻接表（用于 hover 高亮）
  const adj = {}; nodes.forEach(n=>adj[n.id]=new Set());
  edges.forEach(e=>{ if(nodeById[e.source]&&nodeById[e.target]){ adj[e.source].add(e.target); adj[e.target].add(e.source);} });

  const NS='http://www.w3.org/2000/svg';
  const svg=document.createElementNS(NS,'svg');
  svg.setAttribute('class','graph-svg');
  svg.setAttribute('width',W); svg.setAttribute('height',H);
  const g=document.createElementNS(NS,'g');
  svg.appendChild(g);
  box.appendChild(svg);

  // 边
  const edgeEls = edges.map(e=>{
    const s=nodeById[e.source], t=nodeById[e.target];
    if(!s||!t) return null;
    const line=document.createElementNS(NS,'line');
    line.setAttribute('stroke', relColors[e.relation]||'#dde0ed');
    line.setAttribute('stroke-width','1.4');
    line.setAttribute('x1',s._x); line.setAttribute('y1',s._y);
    line.setAttribute('x2',t._x); line.setAttribute('y2',t._y);
    g.appendChild(line);
    return {el:line, source:e.source, target:e.target};
  }).filter(Boolean);

  // 节点
  const nodeEls = nodes.map(n=>{
    const deg=n._deg||0;
    const r=Math.max(5, Math.min(20, 5+deg*1.6));
    const grp=document.createElementNS(NS,'g');
    grp.setAttribute('class','graph-node');
    grp.setAttribute('transform',`translate(${n._x},${n._y})`);
    const c=document.createElementNS(NS,'circle');
    c.setAttribute('r',r);
    c.setAttribute('fill', colors[n.type]||'#999');
    c.setAttribute('fill-opacity','0.9');
    c.setAttribute('stroke','#fff');
    c.setAttribute('stroke-width','2');
    const label=document.createElementNS(NS,'text');
    label.setAttribute('y', r+13);
    label.setAttribute('text-anchor','middle');
    label.setAttribute('font-size','11');
    label.setAttribute('font-family','system-ui');
    label.setAttribute('fill','#2b2f3a');
    label.textContent=ESC(n.label.slice(0,10));
    // 类型图标（emoji），居中 + 白色描边光晕，保证在彩色圆上可读
    const icon=document.createElementNS(NS,'text');
    icon.setAttribute('class','graph-node-ico');
    icon.setAttribute('text-anchor','middle');
    icon.setAttribute('dominant-baseline','central');
    icon.setAttribute('y','1');
    icon.setAttribute('font-size', Math.max(9, r*1.25));
    icon.textContent = GRAPH_TYPE_ICONS[n.type] || '●';
    grp.appendChild(c); grp.appendChild(icon); grp.appendChild(label);
    g.appendChild(grp);
    n._r=r; n._grp=grp; n._el=c; n._label=label; n._icon=icon;
    return n;
  });

  // 状态
  _g = {box, svg, g, W, H, nodes, nodeById, edges, edgeEls, nodeEls, adj,
        view:{x:0,y:0,s:1}, hoverId:null, drag:null, pan:null};

  // 图例：节点类型（图标）+ 关系类型（线色）
  const usedTypes = [...new Set(nodes.map(n=>n.type))];
  _buildLegend(box, usedTypes);

  _applyView();
  _bindEvents();
  // 有保存的视图（缩放/平移）则精确还原，否则首次自动适应
  if(saved && saved.view){
    _g.view={x:saved.view.x, y:saved.view.y, s:saved.view.s};
    _applyView();
  }else{
    _fit();
  }
}

// 渲染图例：底部统一横条，左半=关系（线色），右半=节点类型（图标）
function _buildLegend(box, usedTypes){
  const relList = (typeof RELATION_TYPES !== 'undefined') ? RELATION_TYPES : GRAPH_REL_FB;
  const relItems = relList.map(r=>`<span class="lg-item"><span class="lg-line" style="background:${r.color}"></span>${ESC(r.label)}</span>`).join('');
  const typeItems = usedTypes.map(t=>`<span class="lg-item"><span class="lg-ico">${GRAPH_TYPE_ICONS[t]||'●'}</span>${ESC(GRAPH_TYPE_LABELS[t]||t)}</span>`).join('');
  box.insertAdjacentHTML('beforeend', `
    <div class="graph-legend">
      <div class="lg-section">
        <div class="lg-title">关系 · 线的颜色</div>
        <div class="lg-row">${relItems}</div>
      </div>
      <div class="lg-section lg-section-typ">
        <div class="lg-title">节点 · 图标</div>
        <div class="lg-row">${typeItems}</div>
      </div>
    </div>`);
}

function _applyView(){
  if(!_g) return;
  const {g,view}=_g;
  g.setAttribute('transform',`translate(${view.x},${view.y}) scale(${view.s})`);
  if(_g.nodeEls) _refreshLabels();
}

// 标签显隐：放大到一定程度（或 hover）才显示，避免全览时文字糊成一团
function _refreshLabels(){
  const show = _g.view.s >= 0.5;
  const hover = _g.hoverId;
  _g.nodeEls.forEach(n=>{
    if(hover){
      n._label.style.opacity = (n.id===hover || _g.adj[hover].has(n.id)) ? '1' : '0';
    }else{
      n._label.style.opacity = show ? '1' : '0';
    }
  });
}

// 屏幕坐标 → 内容坐标
function _toContent(clientX, clientY){
  const r=_g.svg.getBoundingClientRect();
  return {x:(clientX-r.left-_g.view.x)/_g.view.s, y:(clientY-r.top-_g.view.y)/_g.view.s};
}

function _hitNode(cx, cy){
  let best=null, bestD=1e9;
  for(const n of _g.nodes){
    const dx=cx-n._x, dy=cy-n._y, d=dx*dx+dy*dy;
    const rr=(n._r+5)*(n._r+5);
    if(d<rr && d<bestD){ best=n; bestD=d; }
  }
  return best;
}

function _bindEvents(){
  const {svg}=_g;
  // window 级只绑一次（回调读模块级 _g，永远指向当前图）
  if(!_windowBound){
    _windowBound = true;
    window.addEventListener('mousemove', _onMove);
    window.addEventListener('mouseup', _onUp);
  }
  // svg 每次重建都是新元素，旧 svg 已移除，直接绑滚轮
  svg.addEventListener('wheel', _onWheel, {passive:false});
}

// 工具栏按钮（重排/适应）—— 在 renderGraph 里绑定，稳定引用避免重复绑
function _onGbtn(ev){
  const b = ev.currentTarget;
  if(b.dataset.g==='reset') _reset(); else _fit();
}

function _onDown(ev){
  const p=_toContent(ev.clientX, ev.clientY);
  const n=_hitNode(p.x, p.y);
  if(n){
    _g.drag={node:n, moved:false, sx:ev.clientX, sy:ev.clientY};
    n._grp.classList.add('dragging');
  }else{
    _g.pan={sx:ev.clientX, sy:ev.clientY, ox:_g.view.x, oy:_g.view.y};
    _g.svg.classList.add('panning');
  }
}

function _onMove(ev){
  if(_g.drag){
    const n=_g.drag.node;
    const p=_toContent(ev.clientX, ev.clientY);
    n._x=p.x; n._y=p.y; n._pinned=true;
    n._grp.setAttribute('transform',`translate(${n._x},${n._y})`);
    _updateEdgesOf(n.id);
    if(Math.abs(ev.clientX-_g.drag.sx)+Math.abs(ev.clientY-_g.drag.sy)>4) _g.drag.moved=true;
  }else if(_g.pan){
    _g.view.x=_g.pan.ox+(ev.clientX-_g.pan.sx);
    _g.view.y=_g.pan.oy+(ev.clientY-_g.pan.sy);
    _applyView();
  }else{
    // hover 高亮
    const p=_toContent(ev.clientX, ev.clientY);
    const n=_hitNode(p.x, p.y);
    const id=n?n.id:null;
    if(id!==_g.hoverId){ _g.hoverId=id; _applyHighlight(); _refreshLabels(); }
  }
}

function _onUp(ev){
  if(_g.drag){
    const n=_g.drag.node;
    n._grp.classList.remove('dragging');
    if(!_g.drag.moved){ // 视为点击 → 打开详情
      callAction('openDetail', [n.path]);
    }
    _g.drag=null;
    _saveLayoutDebounced();        // 拖拽后持久化布局
  }
  if(_g.pan){ _g.svg.classList.remove('panning'); _g.pan=null; _saveLayoutDebounced(); }
}

function _onWheel(ev){
  ev.preventDefault();
  const r=_g.svg.getBoundingClientRect();
  const mx=ev.clientX-r.left, my=ev.clientY-r.top;
  const factor=ev.deltaY<0?1.12:1/1.12;
  const ns=Math.max(0.2, Math.min(4, _g.view.s*factor));
  // 以鼠标为锚点缩放
  _g.view.x = mx - (mx-_g.view.x)*(ns/_g.view.s);
  _g.view.y = my - (my-_g.view.y)*(ns/_g.view.s);
  _g.view.s = ns;
  _applyView();
  _saveLayoutDebounced();          // 缩放后持久化视图
}

// 拖动某节点时，更新所有与之相连的边端点
function _updateEdgesOf(id){
  for(const e of _g.edgeEls){
    if(e.source===id||e.target===id){
      const s=_g.nodeById[e.source], t=_g.nodeById[e.target];
      if(!s||!t) continue;
      e.el.setAttribute('x1',s._x); e.el.setAttribute('y1',s._y);
      e.el.setAttribute('x2',t._x); e.el.setAttribute('y2',t._y);
    }
  }
}

// hover 高亮：高亮节点及其邻居，淡化其余
function _applyHighlight(){
  const id=_g.hoverId;
  if(!id){
    _g.nodeEls.forEach(n=>{ n._grp.style.opacity='1'; n._label.textContent=ESC(n.label.slice(0,10)); });
    _g.edgeEls.forEach(e=>{ e.el.style.opacity='0.75'; e.el.setAttribute('stroke-width','1.4'); });
    return;
  }
  const near=_g.adj[id];
  _g.nodeEls.forEach(n=>{
    if(n.id===id || near.has(n.id)){ n._grp.style.opacity='1'; }
    else { n._grp.style.opacity='0.12'; }
  });
  _g.edgeEls.forEach(e=>{
    if(e.source===id||e.target===id){ e.el.style.opacity='0.95'; e.el.setAttribute('stroke-width','2.4'); }
    else { e.el.style.opacity='0.05'; e.el.setAttribute('stroke-width','1'); }
  });
}

function _reset(){
  const {W,H}=_g;
  _clearLayout();                 // 重排 = 放弃手动布局，恢复自动力导向
  _g.nodes.forEach(n=>{ n._pinned=false; });
  _forceLayout(_g.nodes, _g.edges, W, H, 350);
  _applyPositions();
  _g.nodeEls.forEach(n=>{ n._grp.style.opacity='1'; });
  _g.edgeEls.forEach(e=>{ e.el.style.opacity='0.75'; e.el.setAttribute('stroke-width','1.4'); });
  _fit();
}

// 适应窗口：根据所有节点包围盒设置 view，使其居中且尽量填满（底部留出图例空间）
function _fit(){
  if(!_g) return;
  let minX=1e9,minY=1e9,maxX=-1e9,maxY=-1e9;
  _g.nodes.forEach(n=>{ minX=Math.min(minX,n._x); minY=Math.min(minY,n._y); maxX=Math.max(maxX,n._x); maxY=Math.max(maxY,n._y); });
  const pad=40, bottomPad=48; // 底部额外留空给图例横条
  const bw=Math.max(1,maxX-minX), bh=Math.max(1,maxY-minY);
  const s=Math.min((_g.W-pad*2)/bw, (_g.H-pad-bottomPad*2)/bh, 2.2);
  const sc=Math.max(0.2, s);
  _g.view.s=sc;
  _g.view.x=(_g.W - (minX+maxX)*sc)/2;
  _g.view.y=(_g.H - (minX+maxY)*sc)/2 - bottomPad;
  _applyView();
}
