// API Layer
const API_BASE = (location.host ? '' : 'http://localhost:16000') + '/api';
let apiOnline = true;

async function apiFetch(path, opts={}){
  try{
    const r = await fetch(API_BASE+path, opts);
    if(!r.ok) throw new Error('HTTP '+r.status);
    apiOnline = true;
    updateApiStatus();
    return await r.json();
  }catch(e){
    apiOnline = false;
    updateApiStatus(e.message);
    throw e;
  }
}

async function get(path){ return apiFetch(path) }
async function post(url,data){ return apiFetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)}) }
async function put(url,data){ return apiFetch(url,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)}) }
async function del(url){ return apiFetch(url,{method:'DELETE'}) }

function updateApiStatus(msg){
  const el=document.getElementById('apiStatus');
  if(!el)return;
  if(apiOnline){
    el.textContent='🟢 已连接'; el.style.color='var(--green)';
  }else{
    el.textContent='🔴 未连接服务'+(msg?('：'+msg):'')+' — 请先运行「启动知识库.bat」'; el.style.color='var(--red)';
  }
}
