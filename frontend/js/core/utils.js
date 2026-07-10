// Utilities & Constants
const ESC = s => String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const FMT = ts => {if(!ts)return'';const d=new Date(ts);return isNaN(d.getTime())?ts:`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`};
const FMTREL = ts => {if(!ts)return'';const d=Date.now()-(new Date(ts)).getTime();if(d<6e4)return'刚刚';if(d<36e5)return Math.floor(d/6e4)+'分前';if(d<864e5)return Math.floor(d/36e5)+'时前';if(d<6048e5)return Math.floor(d/864e5)+'天前';return FMT(ts)};

const TYPES = [
  {key:'book',label:'书籍',icon:'📚',typeCls:'type-book'},
  {key:'video',label:'视频',icon:'🎬',typeCls:'type-video'},
  {key:'post',label:'帖子',icon:'📱',typeCls:'type-post'},
  {key:'concept',label:'概念',icon:'💡',typeCls:'type-concept'},
  {key:'reflection',label:'反思',icon:'💭',typeCls:'type-reflection'},
  {key:'problem',label:'问题',icon:'❓',typeCls:'type-problem'},
  {key:'plan',label:'计划',icon:'🎯',typeCls:'type-plan'},
];

const TYPE_MAP = Object.fromEntries(TYPES.map(t=>[t.key,t]));
TYPE_MAP['book-notes'] = {key:'book-notes',label:'文学笔记',icon:'📝',typeCls:'type-book'};
TYPE_MAP['video-notes'] = {key:'video-notes',label:'视频笔记',icon:'📺',typeCls:'type-video'};
TYPE_MAP['post-notes'] = {key:'post-notes',label:'帖子笔记',icon:'📱',typeCls:'type-post'};
TYPE_MAP['quicknote'] = {key:'quicknote',label:'闪念笔记',icon:'⚡',typeCls:'type-concept'};

function statusColor(s){
  if(/已|解决|完成|读|看/.test(s))return'badge-green';
  if(/待/.test(s))return'badge-gray';
  if(/中/.test(s))return'badge-orange';
  return'badge-blue';
}

function makeOptions(opts, type, current){
  let mo = opts[type] || [''];
  if(!mo.length) return `<option>${current||''}</option>`;
  return mo.map(o=>`<option ${o===current?'selected':''}>${o}</option>`).join('');
}
