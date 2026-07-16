// Core — 全局类型常量（类型映射 + 关系类型）
//
// 原先 TYPE_MAP 定义在 core/utils.js、GRAPH_TYPE_ICONS/GRAPH_TYPE_LABELS/GRAPH_REL_FB
// 内联在 views/graph.js、RELATION_TYPES/RELATION_COLORS 定义在 notes/concept-detail.js，
// 新增一种类型要同步改 4-5 处，容易漏。现统一收敛到此文件，并由 dashboard.html 在
// utils.js / graph.js / concept-detail.js 之前加载（api.js 之后）。

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
TYPE_MAP['book-notes']  = {key:'book-notes',  label:'文学笔记', icon:'📝', typeCls:'type-book'};
TYPE_MAP['video-notes'] = {key:'video-notes', label:'视频笔记', icon:'📺', typeCls:'type-video'};
TYPE_MAP['post-notes']  = {key:'post-notes',  label:'帖子笔记', icon:'📱', typeCls:'type-post'};
TYPE_MAP['quicknote']   = {key:'quicknote',   label:'闪念笔记', icon:'⚡', typeCls:'type-concept'};

// 图谱/图例便捷映射（仅图标 + 标签），从 TYPE_MAP 派生，避免重复维护
const TYPE_ICONS = {};
const TYPE_LABELS = {};
for(const k in TYPE_MAP){ TYPE_ICONS[k] = TYPE_MAP[k].icon; TYPE_LABELS[k] = TYPE_MAP[k].label; }

// 关系类型词典（概念间关联 + 图谱边着色），概念详情与图谱共用
const RELATION_TYPES = [
  {value:'相关', label:'相关',     color:'#9aa0b5'},
  {value:'延伸', label:'延伸',     color:'#534AB7'},
  {value:'属于', label:'属于',     color:'#0F6E56'},
  {value:'包含', label:'包含',     color:'#1D9E75'},
  {value:'前置', label:'前置/依赖', color:'#185FA5'},
  {value:'对立', label:'对立/对比', color:'#A32D2D'},
  {value:'实例', label:'实例/应用', color:'#BA7517'},
  {value:'因果', label:'因果',     color:'#993C1D'},
  {value:'来源', label:'来源/派生', color:'#712B13'},
];
const RELATION_COLORS = {};
RELATION_TYPES.forEach(r => { RELATION_COLORS[r.value] = r.color; });

// ── 领域色板（领域维度，与 type/relation 体系平行）──
// 概念卡片的左侧色条 / 极淡背景 tint / 领域 chip 共用，统一收敛到此文件，
// 避免散落在 dashboard.js 内联（增删领域只改这里一处）。
const DOMAIN_PALETTE = {
  '心理学':   '#0EA5E9', // cyan   青
  '认知':     '#8B5CF6', // purple 紫
  '元认知':   '#8B5CF6', // purple 紫（与认知同系）
  '人际关系': '#10B981', // emerald 翠绿
  '计算机科学':'#3B82F6', // blue  蓝
  '行为经济学':'#F59E0B', // amber 琥珀
  '哲学':     '#EC4899', // pink  粉
  '社会学':   '#14B8A6', // teal  蓝绿
};
// 领域背景底色 alpha（8 位 hex 后缀）：数值越大越浓，0x10≈6%、0x12≈7%、0x1A≈10%
const DOMAIN_TINT = '10';
// 领域颜色查询（容错 trim / 未命中返回空）
function domainColor(d){
  if(!d) return '';
  return DOMAIN_PALETTE[d] || DOMAIN_PALETTE[d.trim()] || '';
}
