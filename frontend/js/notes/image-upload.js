// Image Upload — 图片上传管线（按钮选图 + 粘贴截图）

function triggerImageUpload(){
  const inp = document.getElementById('imgFileInput');
  if(inp) inp.click();
}
function readFileAsDataURL(file){
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}
function insertAtCursor(ta, text){
  const start = ta.selectionStart != null ? ta.selectionStart : ta.value.length;
  const end = ta.selectionEnd != null ? ta.selectionEnd : ta.value.length;
  ta.value = ta.value.slice(0, start) + text + ta.value.slice(end);
  const pos = start + text.length;
  ta.focus();
  ta.setSelectionRange(pos, pos);
}
async function uploadAndInsert(file, filename){
  if(!file) return;
  const btn = document.getElementById('insertImgBtn');
  const oldLabel = btn ? btn.textContent : '插入图片';
  if(btn){ btn.disabled = true; btn.textContent = '上传中…'; }
  try{
    const dataUrl = await readFileAsDataURL(file);
    const res = await post('/upload', {filename: filename || file.name || 'pasted.png', content: dataUrl});
    const ta = document.getElementById('noteTextarea');
    if(ta && res && res.path){
      insertAtCursor(ta, `![[${res.path}]]`);
    }
  }catch(e){
    alert('图片上传失败：' + (e && e.message ? e.message : e));
  }finally{
    if(btn){ btn.disabled = false; btn.textContent = oldLabel; }
  }
}
async function onImageSelected(input){
  const file = input.files && input.files[0];
  if(!file) return;
  await uploadAndInsert(file);
  input.value = '';
}

// 粘贴截图自动上传：编辑框聚焦时，若剪贴板含图片则直接上传并插入
if(!window.__notePasteBound){
  window.__notePasteBound = true;
  document.addEventListener('paste', function(e){
    const ta = document.getElementById('noteTextarea');
    if(!ta || document.activeElement !== ta) return;
    const cd = e.clipboardData || window.clipboardData;
    if(!cd || !cd.items) return;
    let file = null;
    for(const it of cd.items){
      if(it.kind === 'file' && it.type && it.type.startsWith('image/')){
        file = it.getAsFile();
        if(file) break;
      }
    }
    if(!file) return; // 纯文字粘贴 → 放行
    e.preventDefault();
    const extMap = {'image/png':'png','image/jpeg':'jpg','image/gif':'gif','image/webp':'webp','image/bmp':'bmp'};
    const ext = extMap[file.type] || 'png';
    const fname = 'pasted-' + new Date().toISOString().replace(/[:.]/g,'-') + '.' + ext;
    uploadAndInsert(file, fname);
  });
}
