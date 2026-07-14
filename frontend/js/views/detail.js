// views/detail.js — 通用条目详情页面（非概念专用视图）
// 全局函数 openDetail(filepath, opts) / showBookCover(it) / showVideoCover(it)。
// openDetail 同时被 callAction('openDetail') 与各视图直接调用；保持全局声明。

// 详情页（通用条目详情，非概念专用）
async function openDetail(filepath, opts){
  opts = opts || {};
  const it = await get(`/item?path=${encodeURIComponent(decodeURIComponent(filepath))}`);
  if(it.error) return alert('文件未找到');
  const t = TYPE_MAP[it.type];
  let html = `<div class="detail"><span class="detail-back" data-action="goBack" data-args='[]'>← 返回${t?.label||''}</span>`;
  html += `<div class="detail-card">`;
  if(it.type==='book'){
    // 书籍封面占位（异步填充，避免阻塞详情渲染）
    html += `<div class="book-cover-wrap" id="bookCoverWrap" style="display:none"><img class="book-cover" id="bookCoverImg" alt="${ESC(it.title)} 封面" referrerpolicy="no-referrer"></div>`;
  }
  if(it.type==='video'){
    // 视频封面占位（本地 cover 字段，无则显示重新获取按钮）
    html += `<div class="book-cover-wrap" id="videoCoverWrap" style="display:none"><img class="book-cover" id="videoCoverImg" alt="${ESC(it.title)} 封面" referrerpolicy="no-referrer"></div>`;
  }
  if(it.type!=='concept'){
    html += `<div class="detail-title">${ESC(it.title)}</div>`;
  html += `<div class="detail-meta">`;
  if(t) html += `<span class="type-badge ${t.typeCls}">${t.icon} ${t.label}</span>`;
  if(it.status) html += `<span class="type-badge ${statusColor(it.status)}">${it.status}</span>`;
  if(it.priority) html += `<span class="type-badge badge-gray">${it.priority}</span>`;
  if(it.mood) html += `<span class="type-badge badge-blue">${it.mood}</span>`;
  if(it.rating>0) html += `<span class="stars">${'★'.repeat(it.rating)}${'☆'.repeat(5-it.rating)}</span>`;
  html += `</div>`;
  if(it.author) html += `<div class="detail-section"><h4>作者</h4><p>${ESC(it.author)}</p></div>`;
  if(it.source) html += `<div class="detail-section"><h4>来源</h4><p>${ESC(it.source)}</p></div>`;
  if(it.url) html += `<div class="detail-section"><h4>链接</h4><p><a href="${ESC(it.url)}" target="_blank">${ESC(it.url)}</a></p></div>`;
  if(it.domain) html += `<div class="detail-section"><h4>领域</h4><p>${ESC(it.domain)}</p></div>`;
  }
  if(it.type==='concept'){
    // 概念类型：conceptViewHtml 已包含四字段 + 「被以下笔记引用」
    html += `<div class="detail-section">${conceptViewHtml(it, filepath)}</div>`;
  } else {
    if(it.content) html += `<div class="detail-section"><h4>内容</h4>${renderNoteContent(it.content)}</div>`;
    if(it.tags&&it.tags.length) html += `<div class="detail-section"><h4>标签</h4>${it.tags.map(t=>`<span class="tag">${ESC(t)}</span>`).join(' ')}</div>`;
  }
  if(it.type==='book'){
    const allBooks = await get(`/items?type=book`);
    const notes = allBooks.filter(b => b.type==='book-notes' && b.path.startsWith(it.path.replace(/[^/]+\.md$/,'')));
    if(notes.length){
      html += `<div class="detail-section"><h4>📝 文学笔记</h4><div class="detail-links">${notes.map(n=>`<a href="#" data-action="openDetail" data-args='${JSON.stringify([n.path])}'>📄 ${ESC(n.title)}</a>`).join(' · ')}</div></div>`;
    }
  }
  if(it.type==='video'){
    const allVideos = await get(`/items?type=video`);
    const notes = allVideos.filter(v => v.type==='video-notes' && v.path.startsWith(it.path.replace(/[^/]+\.md$/,'')));
    if(notes.length){
      html += `<div class="detail-section"><h4>📺 视频笔记</h4><div class="detail-links">${notes.map(n=>`<a href="#" data-action="openDetail" data-args='${JSON.stringify([n.path])}'>📄 ${ESC(n.title)}</a>`).join(' · ')}</div></div>`;
    }
  }
  if(it.type==='post'){
    const allPosts = await get(`/items?type=post`);
    const notes = allPosts.filter(p => p.type==='post-notes' && p.path.startsWith(it.path.replace(/[^/]+\.md$/,'')));
    if(notes.length){
      html += `<div class="detail-section"><h4>📱 帖子笔记</h4><div class="detail-links">${notes.map(n=>`<a href="#" data-action="openDetail" data-args='${JSON.stringify([n.path])}'>📄 ${ESC(n.title)}</a>`).join(' · ')}</div></div>`;
    }
  }
  // 概念类型已有专属「被以下笔记引用」区（conceptViewHtml），跳过通用「链接/被以下引用」，避免重复+错误路径+混入不相干笔记
  if(it.type!=='concept'){
    html += `<div class="detail-section"><h4>链接</h4><div class="detail-links">${(it.links||[]).map(l=>`<a href="#" data-action="openDetail" data-args='${JSON.stringify([l+".md"])}'>[[${ESC(l)}]]</a>`).join(' · ')||'无'}</div></div>`;
    if(it.backlinks&&it.backlinks.length) html += `<div class="detail-section"><h4>被以下引用</h4><div class="detail-links">${it.backlinks.map(bl=>`<a href="#" data-action="openDetail" data-args='${JSON.stringify([bl.path])}'>← ${ESC(bl.title)} (${TYPE_MAP[bl.type]?.label||bl.type})</a>`).join(' · ')}</div></div>`;
  }
  html += `<div class="detail-meta" style="font-size:11px;color:var(--faint)">创建于 ${FMT(it.created)} · 更新于 ${FMT(it.updated)} · 文件: ${it.path}</div>`;
  html += `</div></div>`;
  document.getElementById('content').innerHTML = html;
  document.getElementById('pageTitle').textContent = (t?.label||'')+' › 详情';
  document.getElementById('addBtn').style.display = 'none';
  if(it.type==='concept'){
    loadSourcesForConcept(it.title);
  }
  // 更新右侧栏
  const infoLines = [];
  if(it.author) infoLines.push(`作者：${it.author}`);
  if(it.source) infoLines.push(`来源：${it.source}`);
  if(it.status) infoLines.push(`状态：${it.status}`);
  if(it.rating > 0) infoLines.push(`评分：${'★'.repeat(it.rating)}`);
  if(it.domain) infoLines.push(`领域：${it.domain}`);
  if(it.concepts && it.concepts.length) infoLines.push(`相关概念：${it.concepts.length}个`);
  renderRightbar({
    actions: [
      {label:'✏️ 编辑', action:'openEdit', args:[it.path]},
      {label:'🗑 删除', action:'deleteItem', args:[it.path], type:'danger'}
    ],
    info: infoLines.join('<br>') || null
  });
  if(opts.push !== false) callAction('pushHistory', {type:'detail', path: filepath});
  // 书籍详情：显示本地封面 + 上传按钮
  if(it.type==='book'){
    showBookCover(it);
  }
  // 视频详情：显示本地封面 + 上传/重新获取按钮
  if(it.type==='video'){
    showVideoCover(it);
  }
}

// ── 书籍封面显示 + 上传（详情页） ──
function showBookCover(it){
  const wrap = document.getElementById('bookCoverWrap');
  const img = document.getElementById('bookCoverImg');
  if(!wrap || !img) return;
  const coverUrl = it.cover || '';
  if(coverUrl){
    img.src = coverUrl;
    img.style.display = 'block';
  } else {
    img.style.display = 'none';
  }
  // 始终显示上传按钮（即使暂无封面也能上传）
  wrap.style.display = 'block';
  // 在封面区域添加上传按钮
  const uploadBtn = document.createElement('button');
  uploadBtn.className = 'btn-g sm';
  uploadBtn.textContent = coverUrl ? '📁 更换封面' : '📁 上传封面';
  uploadBtn.style.cssText = 'margin-top:8px;font-size:12px';
  uploadBtn.setAttribute('data-action', 'uploadCover');
  uploadBtn.setAttribute('data-args', JSON.stringify([it.path]));
  wrap.appendChild(uploadBtn);
}

// ── 视频封面显示 + 上传/重新获取（详情页） ──
function showVideoCover(it){
  const wrap = document.getElementById('videoCoverWrap');
  const img = document.getElementById('videoCoverImg');
  if(!wrap || !img) return;
  const coverUrl = it.cover || '';
  if(coverUrl){
    img.src = coverUrl;
    img.style.display = 'block';
  } else {
    img.style.display = 'none';
  }
  // 始终显示上传按钮（即使暂无封面也能上传）
  wrap.style.display = 'block';
  // 上传封面按钮
  const uploadBtn = document.createElement('button');
  uploadBtn.className = 'btn-g sm';
  uploadBtn.textContent = '📁 更换封面';
  uploadBtn.style.cssText = 'margin-top:8px;font-size:12px;margin-right:6px';
  uploadBtn.setAttribute('data-action', 'uploadCover');
  uploadBtn.setAttribute('data-args', JSON.stringify([it.path]));
  wrap.appendChild(uploadBtn);
  // 重新从 B 站获取封面按钮（本地无封面或想刷新时）
  const refreshBtn = document.createElement('button');
  refreshBtn.className = 'btn-g sm';
  refreshBtn.textContent = '🔄 重新获取';
  refreshBtn.style.cssText = 'margin-top:8px;font-size:12px';
  refreshBtn.onclick = async function(){
    refreshBtn.disabled = true;
    refreshBtn.textContent = '获取中…';
    try{
      const r = await post('/video-cover-refresh', {path: it.path});
      if(r.ok && r.cover){
        img.src = r.cover;
        wrap.style.display = 'block';
        it.cover = r.cover;
      } else if(r.ok && !r.cover){
        alert('未找到 B 站封面（链接可能无效或外网不可达）。可改用手动上传。');
      } else {
        alert(r.error || '获取失败');
      }
    }catch(e){
      alert('获取失败：' + e.message);
    }finally{
      refreshBtn.disabled = false;
      refreshBtn.textContent = '🔄 重新获取';
    }
  };
  wrap.appendChild(refreshBtn);
}
