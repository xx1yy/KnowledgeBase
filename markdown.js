// Markdown rendering
function renderInline(text){
  let html = ESC(text);
  html = html.replace(/\[\[([^\]|#]+)(?:[|#][^\]]+)?\]\]/g, (m, l) => {
    const name = l.split('/').pop().trim();
    return `<a href="#" onclick="event.preventDefault();openDetail('${encodeURIComponent(name)}.md')" style="color:var(--accent);font-weight:500;text-decoration:none">${ESC(name)}</a>`;
  });
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\[([^\]]*)\]\(([^)]*)\)/g, '<a href="$2" target="_blank" rel="noopener" style="color:var(--accent);text-decoration:underline">$1</a>');
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

function renderNoteContent(text){
  if(!text || !text.trim()) return '<p style="color:var(--faint)">暂无内容，点击「编辑」开始记录</p>';
  const lines = text.split('\n');
  let html = '';
  let inList = false, inQuote = false, tableBuf = [];
  function closeBlocks(){
    if(inList){ html += '</ul>'; inList = false; }
    if(inQuote){ html += '</blockquote>'; inQuote = false; }
  }
  function flushTable(){
    if(tableBuf.length >= 2 && mdIsSeparator(tableBuf[1])){
      html += mdRenderTable(tableBuf);
    } else {
      for(const l of tableBuf) html += `<p>${renderInline(l)}</p>`;
    }
    tableBuf = [];
  }
  for(let line of lines){
    const t = line.trim();
    // 表格行：含 | 则累积，遇非表格行再 flush
    if(t.includes('|')){
      if(inList){ html += '</ul>'; inList = false; }
      if(inQuote){ html += '</blockquote>'; inQuote = false; }
      tableBuf.push(line);
      continue;
    }
    if(tableBuf.length) flushTable();
    if(/^# [^#]/.test(t)){
      closeBlocks(); html += `<h1>${renderInline(t.slice(2))}</h1>`;
    } else if(/^## /.test(t)){
      closeBlocks(); html += `<h2>${renderInline(t.slice(3))}</h2>`;
    } else if(/^---+$/.test(t)){
      closeBlocks(); html += '<hr>';
    } else if(/^> /.test(t)){
      if(inList){ html += '</ul>'; inList = false; }
      if(!inQuote){ html += '<blockquote>'; inQuote = true; }
      html += '<p>' + renderInline(t.slice(2)) + '</p>';
    } else if(/^[-*] /.test(t)){
      if(inQuote){ html += '</blockquote>'; inQuote = false; }
      if(!inList){ html += '<ul>'; inList = true; }
      html += `<li>${renderInline(t.slice(2))}</li>`;
    } else if(t === ''){
      closeBlocks();
    } else {
      closeBlocks(); html += `<p>${renderInline(t)}</p>`;
    }
  }
  if(tableBuf.length) flushTable();
  if(inList) html += '</ul>';
  if(inQuote) html += '</blockquote>';
  return html;
}

function renderPreviewMd(text, maxLen){
  if(!text) return '';
  let lines = text.split('\n').filter(l => {
    const lt = l.trim();
    return !/^---+$/.test(lt) && !/^\|.*\|$/.test(lt) && !mdIsSeparator(lt);
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
