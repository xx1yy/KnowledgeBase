// Notes — 共享状态（笔记模块跨文件共享的可变状态）
//
// 原先这些 let 绑定散落在 list.js 顶部，chapters.js / editor.js / concept-detail.js /
// extract-concept.js 隐式依赖它们（仅靠 list.js 最先加载来避免 TDZ）。
// 现统一收敛到本文件，并由 dashboard.html 在 notes 段（concept-detail.js 之前）最先加载。
// 本文件只声明、不执行任何逻辑；其余文件对这些变量的赋值/读取保持不变。
// （window._bookNotesByFolder 是显式挂在 window 上的缓存，不属于词法全局耦合，保留原位。）

let currentNotePath = null;     // 当前打开笔记的 path
let currentNoteData = null;     // 当前打开笔记的数据对象
let currentNotesView = null;    // 当前笔记视图类型（'book-notes' | 'video-notes' | 'post-notes' | ...）
let currentBookFilter = null;   // 文学笔记当前选中的书籍/章节过滤
let noteSortMode = localStorage.getItem('kb_noteSortMode') || 'mtime'; // mtime|ctime|title
let noteManualSort = localStorage.getItem('kb_noteManualSort') === '1';
let _dragPath = null;           // 笔记拖拽中的源 path
