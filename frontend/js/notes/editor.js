// Notes — 在线编辑 / 保存（从原 note.js 拆分）
// 依赖 list.js 中的共享状态（currentNotePath / currentNoteData / currentBookFilter）
// 与 list.js 的 loadNoteContent、app 启动期的 renderNav / loadDashboard。

function toggleNoteEdit(){
  document.getElementById('noteReadMode').style.display = 'none';
  document.getElementById('noteEditMode').style.display = 'block';
}

function cancelNoteEdit(){
  document.getElementById('noteReadMode').style.display = 'block';
  document.getElementById('noteEditMode').style.display = 'none';
}

async function saveNoteContent(){
  if(!currentNotePath) return;
  const content = document.getElementById('noteTextarea').value;
  const titleEl = document.getElementById('noteTitleEdit');
  const title = titleEl ? titleEl.value.trim() : '';
  const chapterEl = document.getElementById('noteChapterEdit');
  const noteType = (currentNoteData && currentNoteData.type) || 'book-notes';
  const isNoChapter = (noteType === 'video-notes' || noteType === 'post-notes');
  const chapter = (!isNoChapter && chapterEl) ? chapterEl.value.trim() : '';
  const data = {path: currentNotePath, content: content};
  if(!isNoChapter && chapter) data.chapter = chapter;
  if(title) data.title = title;
  try{
    await put('/item', data);
    const ni = document.getElementById('ni-' + currentNotePath.replace(/[^a-zA-Z0-9]/g,''));
    if(ni){
      const nt = ni.querySelector('.nt');
      if(nt) nt.textContent = (title || '').replace(/-文学笔记$/,'').replace(/-视频笔记$/,'');
    }
    await loadNoteContent(encodeURIComponent(currentNotePath), {push:false});
    await loadDashboard();
    renderNav();
    // 刷新章节栏，让新的 chapter 分组立即生效
    if(currentBookFilter) renderChapterBar(currentBookFilter);
  }catch(e){
    alert('保存失败：' + e.message);
  }
}
