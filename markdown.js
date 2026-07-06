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

function renderNoteContent(text){
  if(!text || !text.trim()) return '<p style="color:var(--faint)">暂无内容，点击「编辑」开始记录</p>';
  const lines = text.split('\n');
  let html = '';
  let inList = false, inQuote = false;

  for(let line of lines){
    const t = line.trim();
    if(/^# [^#]/.test(t)){
      if(inList){html+='</ul>';inList=false}
      if(inQuote){html+='</blockquote>';inQuote=false}
      html += `<h1>${renderInline(t.slice(2))}</h1>`;
    } else if(/^## /.test(t)){
      if(inList){html+='</ul>';inList=false}
      if(inQuote){html+='</blockquote>';inQuote=false}
      html += `<h2>${renderInline(t.slice(3))}</h2>`;
    } else if(/^---+$/.test(t)){
      if(inList){html+='</ul>';inList=false}
      if(inQuote){html+='</blockquote>';inQuote=false}
      html += '<hr>';
    } else if(/^> /.test(t)){
      if(inList){html+='</ul>';inList=false}
      if(!inQuote){html+='<blockquote>';inQuote=true}
      html += '<p>' + renderInline(t.slice(2)) + '</p>';
    } else if(/^[-*] /.test(t)){
      if(inQuote){html+='</blockquote>';inQuote=false}
      if(!inList){html+='<ul>';inList=true}
      html += `<li>${renderInline(t.slice(2))}</li>`;
    } else if(t === ''){
      if(inList){html+='</ul>';inList=false}
      if(inQuote){html+='</blockquote>';inQuote=false}
    } else {
      if(inList){html+='</ul>';inList=false}
      if(inQuote){html+='</blockquote>';inQuote=false}
      html += `<p>${renderInline(t)}</p>`;
    }
  }
  if(inList) html+='</ul>';
  if(inQuote) html+='</blockquote>';
  return html;
}

function renderPreviewMd(text, maxLen){
  if(!text) return '';
  let lines = text.split('\n').filter(l => !/^---+$/.test(l.trim()));
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
