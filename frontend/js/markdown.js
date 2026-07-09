// Markdown rendering
// 图片路径解析：外链/绝对路径原样返回，否则视为 vault 附件路径
function imgSrc(name){
  name = (name||'').trim();
  if(/^(https?:)?\/\//i.test(name) || name.startsWith('/')) return name;
  return '/api/file/' + encodeURI(name);
}
function renderInline(text){
  const imgs = [];
  let html = text;
  // 先把图片语法替换为占位 token，避免被下方 wikilink / 加粗正则误处理
  html = html.replace(/!\[\[([^\]]+)\]\]/g, (m, p) => {
    const token = '\u0000IMG' + imgs.length + '\u0000';
    const src = imgSrc(p.trim());
    const alt = ESC(p.trim().split('/').pop());
    imgs.push(`<img class="md-img" src="${src}" alt="${alt}" loading="lazy">`);
    return token;
  });
  html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (m, alt, url) => {
    const token = '\u0000IMG' + imgs.length + '\u0000';
    imgs.push(`<img class="md-img" src="${imgSrc(url.trim())}" alt="${ESC(alt)}" loading="lazy">`);
    return token;
  });
  html = ESC(html);
  html = html.replace(/\[\[([^\]|#]+)(?:[|#][^\]]+)?\]\]/g, (m, l) => {
    const name = l.split('/').pop().trim();
    return `<a href="#" onclick="event.preventDefault();showConceptPage('${encodeURIComponent(name)}.md')" style="color:var(--accent);font-weight:500;text-decoration:none">${ESC(name)}</a>`;
  });
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\[([^\]]*)\]\(([^)]*)\)/g, '<a href="$2" target="_blank" rel="noopener" style="color:var(--accent);text-decoration:underline">$1</a>');
  // 最后把占位 token 还原为真实 img 标签
  imgs.forEach((v, i) => { html = html.split('\u0000IMG' + i + '\u0000').join(v); });
  return html;
}

// ── 表格支持（GFM 表格）──
function mdTableCells(line){
  let s = line.trim();
  if(s.startsWith('|')) s = s.slice(1);
  if(s.endsWith('|')) s = s.slice(0, -1);
  return s.split('|').map(c => c.trim());
}
function mdIsSeparator(line){
  const cells = mdTableCells(line);
  return cells.length > 0 && cells.every(c => /^:?-{1,}:?$/.test(c));
}
function mdRenderTable(rows){
  const header = mdTableCells(rows[0]);
  const body = rows.slice(2).map(mdTableCells);
  let h = '<table class="md-table"><thead><tr>' + header.map(x => `<th>${renderInline(x)}</th>`).join('') + '</tr></thead><tbody>';
  for(const r of body) h += '<tr>' + r.map(x => `<td>${renderInline(x)}</td>`).join('') + '</tr>';
  return h + '</tbody></table>';
}

// ── Obsidian 风格 callout 标注框支持 ──
const CALLOUT_META = {
  note:    {icon:'📝', title:'笔记',   color:'#5468ff', soft:'#eef0ff'},
  info:    {icon:'ℹ️', title:'信息',   color:'#3b82f6', soft:'#e8f1ff'},
  tip:     {icon:'💡', title:'提示',   color:'#d97706', soft:'#fff3e0'},
  success: {icon:'✅', title:'成功',   color:'#16a34a', soft:'#e7f6ec'},
  question:{icon:'❓', title:'问题',   color:'#8b5cf6', soft:'#f1ebff'},
  warning: {icon:'⚠️', title:'警告',   color:'#d97706', soft:'#fff3e0'},
  failure: {icon:'❌', title:'失败',   color:'#dc2626', soft:'#ffeaea'},
  danger:  {icon:'🚨', title:'危险',   color:'#dc2626', soft:'#ffeaea'},
  bug:     {icon:'🐛', title:'缺陷',   color:'#db2777', soft:'#ffe9f3'},
  example: {icon:'📌', title:'示例',   color:'#0891b2', soft:'#e0f7fb'},
  quote:   {icon:'❝', title:'引用',   color:'#64748b', soft:'#eef1f5'},
  abstract:{icon:'📄', title:'摘要',   color:'#0891b2', soft:'#e0f7fb'},
};

function renderNoteContent(text){
  if(!text || !text.trim()) return '<p style="color:var(--faint)">暂无内容，点击「编辑」开始记录</p>';
  const lines = text.split('\n');
  let html = '';
  let inList = false, tableBuf = [];
  const quoteBuf = [];
  const callout = {active:false, type:'note', fold:'', title:'', buf:[]};
  function flushQuote(){
    if(!quoteBuf.length) return;
    const paras = [];
    let cur = [];
    for(const raw of quoteBuf){
      const line = raw.replace(/^>\s?/, '');
      if(line === ''){
        if(cur.length){ paras.push(cur); cur = []; }
      } else {
        cur.push(line);
      }
    }
    if(cur.length) paras.push(cur);
    const body = paras.map(p => '<p>' + p.map(l => renderInline(l)).join('<br>') + '</p>').join('');
    html += '<blockquote>' + body + '</blockquote>';
    quoteBuf.length = 0;
  }
  function closeBlocks(){
    if(inList){ html += '</ul>'; inList = false; }
    flushQuote();
  }
  function flushTable(){
    if(tableBuf.length >= 2 && mdIsSeparator(tableBuf[1])){
      html += mdRenderTable(tableBuf);
    } else {
      for(const l of tableBuf) html += `<p>${renderInline(l)}</p>`;
    }
    tableBuf = [];
  }
  function flushCallout(){
    if(!callout.active) return;
    const meta = CALLOUT_META[callout.type] || {icon:'💡', title:callout.type, color:'var(--accent)', soft:'var(--asoft)'};
    const title = callout.title || meta.title;
    const inner = callout.buf.length ? renderNoteContent(callout.buf.join('\n')) : '';
    if(callout.fold){
      html += `<details class="md-callout ${callout.type}"${callout.fold==='+'?' open':''}><summary><span class="ci">${meta.icon}</span><span class="ct">${renderInline(title)}</span></summary>${inner}</details>`;
    } else {
      html += `<div class="md-callout ${callout.type}"><div class="cc-head"><span class="ci">${meta.icon}</span><span class="ct">${renderInline(title)}</span></div>${inner}</div>`;
    }
    callout.active = false;
    callout.buf = [];
  }
  for(let line of lines){
    const t = line.trim();
    // 表格行：含 | 则累积，遇非表格行再 flush
    if(t.includes('|')){
      if(inList){ html += '</ul>'; inList = false; }
      flushQuote();
      tableBuf.push(line);
      continue;
    }
    if(tableBuf.length) flushTable();

    // ── Callout 标注框（Obsidian 语法 > [!type][+/-] 标题）──
    const cm = t.match(/^>\s*\[!(\w+)\]([-+]?)\s*(.*)$/);
    if(cm){
      if(inList){ html += '</ul>'; inList = false; }
      flushQuote();
      flushCallout();
      callout.active = true;
      callout.type = cm[1].toLowerCase();
      callout.fold = cm[2];
      callout.title = cm[3].trim();
      callout.buf = [];
      continue;
    }
    if(callout.active){
      if(/^>/.test(t)){
        callout.buf.push(t === '>' ? '' : t.slice(1).trim());
        continue;
      }
      flushCallout();
      // 非 > 行：结束标注框，按普通行继续处理
    }

    // 普通引用块：连续 > 行收集为一个 blockquote，空 > 行作为段内换行
    if(/^>/.test(t)){
      quoteBuf.push(t);
      continue;
    }
    flushQuote();
    if(/^# [^#]/.test(t)){
      closeBlocks(); html += `<h1>${renderInline(t.slice(2))}</h1>`;
    } else if(/^## /.test(t)){
      closeBlocks(); html += `<h2>${renderInline(t.slice(3))}</h2>`;
    } else if(/^---+$/.test(t)){
      closeBlocks(); html += '<hr>';
    } else if(/^[-*] /.test(t)){
      flushQuote();
      if(!inList){ html += '<ul>'; inList = true; }
      html += `<li>${renderInline(t.slice(2))}</li>`;
    } else if(t === ''){
      closeBlocks();
    } else if(/^!\[\[[^\]]+\]\]$/.test(t) || /^!\[[^\]]*\]\([^)]+\)$/.test(t)){
      closeBlocks();
      html += renderInline(t);
    } else {
      closeBlocks(); html += `<p>${renderInline(t)}</p>`;
    }
  }
  if(tableBuf.length) flushTable();
  flushCallout();
  flushQuote();
  if(inList) html += '</ul>';
  return html;
}

function renderPreviewMd(text, maxLen){
  if(!text) return '';
  let lines = text.split('\n').filter(l => {
    const lt = l.trim();
    if(/^---+$/.test(lt)) return false;
    if(/^\|.*\|$/.test(lt)) return false;
    if(mdIsSeparator(lt)) return false;
    if(/^>\s*\[!(\w+)\]/.test(lt)) return false; // 跳过 callout 头
    return true;
  }).map(l => {                                   // 去掉 callout 正文行的前导 >
    const lt = l.trim();
    return lt.startsWith('>') ? l.replace(/^>\s?/, '') : l;
  });
  if(/^#+ /.test(lines[0])) lines.shift();
  let result = lines.join(' ').trim();
  result = renderInline(result);
  result = result.replace(/<p>(.*?)<\/p>/g, '<em>$1</em>');
  const tmp = document.createElement('div');
  tmp.innerHTML = result;
  const plain = tmp.textContent || tmp.innerText || '';
  if(plain.length > maxLen){
    result = plain.slice(0, maxLen) + '…';
  } else {
    result = tmp.innerHTML;
  }
  return result;
}
