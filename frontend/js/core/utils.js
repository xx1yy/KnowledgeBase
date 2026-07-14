// Utilities & Constants
const ESC = s => String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const FMT = ts => {if(!ts)return'';const d=new Date(ts);return isNaN(d.getTime())?ts:`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`};
const FMTREL = ts => {if(!ts)return'';const d=Date.now()-(new Date(ts)).getTime();if(d<6e4)return'刚刚';if(d<36e5)return Math.floor(d/6e4)+'分前';if(d<864e5)return Math.floor(d/36e5)+'时前';if(d<6048e5)return Math.floor(d/864e5)+'天前';return FMT(ts)};

// 类型常量（TYPE_MAP / TYPES / TYPE_ICONS / TYPE_LABELS / RELATION_TYPES / RELATION_COLORS）
// 统一在 core/types.js 声明，由 dashboard.html 在本文件之前加载，避免重复维护。

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
