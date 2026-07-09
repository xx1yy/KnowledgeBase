// Knowledge Graph
async function renderGraph(){
  document.getElementById('content').innerHTML = `<div class="graph-container" id="graphBox"><div class="empty" style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%)"><div class="big">🕸️</div>加载中…</div></div>`;
  const data = await get('/graph');
  setTimeout(()=>drawGraph(data),100);
}

function drawGraph(data){
  const box = document.getElementById('graphBox');
  const W = box.clientWidth, H = box.clientHeight;
  const colors = {book:'var(--green)','book-notes':'#5b8c5a',video:'var(--orange)','video-notes':'#c87f3e',concept:'var(--accent)',reflection:'#7c5ce7',problem:'var(--red)',plan:'var(--orange)'};
  const nodes = data.nodes||[], edges = data.edges||[];
  const linkedIds = new Set();
  edges.forEach(e=>{linkedIds.add(e.source);linkedIds.add(e.target)});
  const displayNodes = nodes.filter(n=>linkedIds.has(n.id));
  if(!displayNodes.length){ box.innerHTML = '<div class="empty"><div class="big">🕸️</div>暂无链接数据<br><span style="font-size:12px">在 .md 文件中使用 [[wikilinks]] 建立关联</span></div>'; return }

  const nodeMap = {};
  displayNodes.forEach((n,i)=>{
    const angle = (i/displayNodes.length)*Math.PI*2;
    const r = Math.min(W,H)*0.32;
    nodeMap[n.id] = {x:W/2+Math.cos(angle)*r, y:H/2+Math.sin(angle)*r, ...n};
  });
  for(let iter=0;iter<20;iter++){
    const forces = {};
    displayNodes.forEach(n=>forces[n.id]={fx:0,fy:0});
    edges.forEach(e=>{
      const s=nodeMap[e.source],t=nodeMap[e.target];
      if(!s||!t)return;
      const dx=t.x-s.x,dy=t.y-s.y,dist=Math.sqrt(dx*dx+dy*dy)||1;
      const f=0.04*(dist-150);
      forces[e.source].fx+=dx/dist*f; forces[e.source].fy+=dy/dist*f;
      forces[e.target].fx-=dx/dist*f; forces[e.target].fy-=dy/dist*f;
    });
    displayNodes.forEach(n=>{
      const f=forces[n.id];
      nodeMap[n.id].x+=f.fx*0.8; nodeMap[n.id].y+=f.fy*0.8;
      nodeMap[n.id].x=Math.max(60,Math.min(W-60,nodeMap[n.id].x));
      nodeMap[n.id].y=Math.max(40,Math.min(H-40,nodeMap[n.id].y));
    });
  }

  const svg = `<svg width="${W}" height="${H}" style="position:absolute;top:0;left:0">
    <rect width="${W}" height="${H}" fill="transparent"/>
    ${edges.map(e=>{
      const s=nodeMap[e.source],t=nodeMap[e.target];
      if(!s||!t)return'';
      return`<line x1="${s.x}" y1="${s.y}" x2="${t.x}" y2="${t.y}" stroke="#dde0ed" stroke-width="1.2"/>`;
    }).join('')}
    ${Object.values(nodeMap).map(n=>`<a href="#" data-action="openDetail" data-args='${JSON.stringify([n.path])}'>
      <circle cx="${n.x}" cy="${n.y}" r="${Math.max(1,Math.min(12,4+n.id.length*0.5)+5)}" fill="${colors[n.type]||'#999'}" opacity=".85" stroke="white" stroke-width="2"/>
    </a>`).join('')}
    ${Object.values(nodeMap).map(n=>`<text x="${n.x}" y="${n.y+22}" text-anchor="middle" font-size="11" fill="#333" font-family="system-ui" style="pointer-events:none">${ESC(n.label.slice(0,8))}</text>`).join('')}
  </svg>`;
  box.innerHTML = svg;
}
