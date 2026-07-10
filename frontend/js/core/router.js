// Router — 路由系统（浏览器历史栈 + 视图导航）
let currentView = 'dashboard';

function pushHistory(state){ history.pushState(state, ''); }

// 显式返回上一页（替代 data-action="history.back" 的属性链解析，更可靠）
function goBack(){ history.back(); }

async function restoreNotesView(path, done){
  const fp = decodeURIComponent(path);
  let view = 'book-notes';
  try{
    const it = await get('/item?path=' + encodeURIComponent(fp));
    if(it.type === 'video-notes') view = 'video-notes';
    else if(it.type === 'post-notes') view = 'post-notes';
    else view = 'book-notes';
  }catch(e){}
  if(!document.getElementById('noteReader')){
    currentNotesView = view;
    if(view === 'video-notes'){ await renderVideoNotes(); }
    else if(view === 'post-notes'){ await renderPostNotes(); }
    else { await renderBookNotes(); }
  }
  if(done) await done();
}

function applyRoute(state){
  if(!state){ navigate('dashboard', {push:false}); return; }
  if(state.type === 'view'){ navigate(state.view, {push:false}); return; }
  if(state.type === 'detail'){ callAction('openDetail', state.path, {push:false}); return; }
  if(state.type === 'note'){ restoreNotesView(state.path, () => loadNoteContent(state.path, {push:false})); return; }
  if(state.type === 'extract'){ restoreNotesView(state.path, async () => { await loadNoteContent(state.path, {push:false}); showExtractConcept(state.path, {push:false}); }); return; }
  if(state.type === 'concept'){
    const notePath = state.notePath;
    if(notePath){
      restoreNotesView(notePath, async () => {
        await loadNoteContent(notePath, {push:false});
        showConceptPage(state.conceptPath, {push:false});
      });
    } else {
      showConceptPage(state.conceptPath, {push:false});
    }
    return;
  }
  navigate('dashboard', {push:false});
}
window.addEventListener('popstate', (e)=> applyRoute(e.state));

async function navigate(view, opts){
  opts = opts || {};
  currentView = view;
  callAction('renderNav');
  const t = document.getElementById('pageTitle');
  const a = document.getElementById('addBtn');
  await callAction('loadRecentConcepts'); // 确保右侧栏有数据
  if(view === 'dashboard'){ t.textContent = '仪表盘'; a.style.display='none'; renderDashboard(); callAction('renderRightbar', {actions:[]}); }
  else if(view === 'search'){ t.textContent = '搜索'; a.style.display='none'; renderSearch(); callAction('renderRightbar', {actions:[]}); }
  else if(view === 'graph'){ t.textContent = '知识图谱'; a.style.display='none'; renderGraph(); callAction('renderRightbar', {actions:[]}); }
  else if(view === 'book-notes'){ currentNotesView = 'book-notes'; t.textContent = '文学笔记'; a.style.display='none'; renderBookNotes(); callAction('renderRightbar', {actions:[
    {label:'＋ 新建笔记', action:'showAddNoteModal', args:['book'], type:'primary'}
  ]}); }
  else if(view === 'video-notes'){ currentNotesView = 'video-notes'; t.textContent = '视频笔记'; a.style.display='none'; renderVideoNotes(); callAction('renderRightbar', {actions:[
    {label:'＋ 新建笔记', action:'showAddNoteModal', args:['video'], type:'primary'}
  ]}); }
  else if(view === 'post-notes'){ currentNotesView = 'post-notes'; t.textContent = '帖子笔记'; a.style.display='none'; renderPostNotes(); callAction('renderRightbar', {actions:[
    {label:'＋ 新建笔记', action:'showAddNoteModal', args:['post'], type:'primary'}
  ]}); }
  else if(view === 'tags'){ t.textContent = '标签'; a.style.display='none'; renderTags(); callAction('renderRightbar', {actions:[]}); }
  else if(view === 'domains'){ t.textContent = '领域'; a.style.display='none'; renderDomains(); callAction('renderRightbar', {actions:[]}); }
  else {
    const ti = TYPE_MAP[view];
    if(ti){
      t.textContent = ti.label;
      a.style.display='inline-flex';
      renderList(view);
      callAction('renderRightbar', {actions:[
        {label:'＋ 新建', action:'openQuickCapture', args:[view], type:'primary'}
      ]});
    }
  }
  if(opts.push !== false) pushHistory({type:'view', view});
}
