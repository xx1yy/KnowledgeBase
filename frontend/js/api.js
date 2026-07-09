// API Layer
const API_BASE = (location.host ? '' : 'http://localhost:16000') + '/api';
let apiOnline = true;
let _authToken = null;

// 获取认证 token（启动时调用一次，之后自动附加到所有请求）
async function fetchAuthToken(){
  try{
    const r = await fetch(API_BASE+'/token');
    if(r.ok){
      const d = await r.json();
      _authToken = d.token || null;
      if(_authToken) localStorage.setItem('kb_token', _authToken);
    }
  }catch(e){ /* 静默失败，旧版后端无此接口 */ }
  // 尝试从 localStorage 恢复（后端重启后 token 可能变，但至少有个备选）
  if(!_authToken) _authToken = localStorage.getItem('kb_token') || null;
}

function _appendToken(url, opts){
  if(!_authToken) return {url, opts};
  const sep = url.includes('?') ? '&' : '?';
  url = url + sep + 't=' + encodeURIComponent(_authToken);
  opts = opts || {};
  if(!opts.headers) opts.headers = {};
  opts.headers['X-Auth-Token'] = _authToken;
  return {url, opts};
}

async function apiFetch(path, opts={}){
  try{
    let result = _appendToken(path, opts);
    const r = await fetch(API_BASE+result.url, result.opts);
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
