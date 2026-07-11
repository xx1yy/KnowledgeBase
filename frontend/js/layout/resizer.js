// layout/resizer.js — 可拖拽分栏
// 全局函数 initSplitResizer() / initChapterResizer()，被 concept-detail.js / note.js 在运行时调用。
// 保持全局声明：由对应视图在加载内容后按需调用。

/* ── 可拖拽分栏分割条 ─────────────────── */
function initSplitResizer(){
  const resizer = document.getElementById('splitResizer');
  const split = document.getElementById('extractSplit');
  if(!resizer || !split) return;
  const left = split.querySelector('.extract-split-left');
  if(!left) return;

  // 从 localStorage 恢复上次宽度
  const saved = localStorage.getItem('kb_split_left_pct');
  if(saved){
    const pct = parseFloat(saved);
    if(pct >= 20 && pct <= 70){
      left.style.width = pct + '%';
    }
  }

  let startX, startWidth;
  resizer.addEventListener('mousedown', function(e){
    e.preventDefault();
    resizer.classList.add('active');
    startX = e.clientX;
    startWidth = left.offsetWidth;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    function onMove(e){
      const dx = e.clientX - startX;
      const containerW = split.offsetWidth;
      let newW = startWidth + dx;
      let newPct = (newW / containerW) * 100;
      newPct = Math.max(18, Math.min(68, newPct));
      left.style.width = newPct + '%';
    }
    function onUp(){
      resizer.classList.remove('active');
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      try{
        const pct = (left.offsetWidth / split.offsetWidth) * 100;
        localStorage.setItem('kb_split_left_pct', String(pct));
      }catch(e){}
    }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });
}

/* ── 章节栏宽度拖拽调整 ─────────────── */
function initChapterResizer(){
  const resizer = document.getElementById('chapterResizer');
  const layout = document.querySelector('.notes-layout');
  const bar = document.getElementById('chapterBar');
  if(!resizer || !layout || !bar) return;

  // 从 localStorage 恢复上次宽度（像素），写入 CSS 变量而非内联 width
  // 内联 width 会覆盖 .chapters-collapsed #chapterBar{width:44px} 导致「收回章节栏」失效
  const saved = localStorage.getItem('kb_chapter_width');
  if(saved){
    const px = parseFloat(saved);
    if(px >= 160 && px <= 600){
      layout.style.setProperty('--chapter-w', px + 'px');
    }
  }

  let startX, startWidth;
  resizer.addEventListener('mousedown', function(e){
    e.preventDefault();
    resizer.classList.add('active');
    startX = e.clientX;
    startWidth = bar.offsetWidth;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    function onMove(e){
      const dx = e.clientX - startX;
      let newW = startWidth + dx;
      const maxW = layout.offsetWidth * 0.6;
      newW = Math.max(160, Math.min(maxW, newW));
      layout.style.setProperty('--chapter-w', newW + 'px');
    }
    function onUp(){
      resizer.classList.remove('active');
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      try{
        localStorage.setItem('kb_chapter_width', String(bar.offsetWidth));
      }catch(e){}
    }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });
}
