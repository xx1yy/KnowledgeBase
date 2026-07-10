// actions.js — 显式动作注册表 + 统一分发器
// 目的：消除 app.js / router.js 之间「靠 window[fn] 隐式互相调用」的双向耦合，
//       改为两者都只依赖本文件（叶节点），使依赖方向单向、可静态校验。
// 注意：本文件必须最后加载（见 dashboard.html）。

window.KB = window.KB || {};

// 所有可被 data-action / data-change / data-input / data-drag-* 触发的处理器名。
// 缺失的处理器会在控制台告警，但分发器会回退到 window[fn]，不影响运行。
const _ACTION_NAMES = [
  // 顶部/通用
  'toggleSidebar', 'toggleRightbar', 'openQuickCapture', 'closeModalOnMask',
  'showConceptPage', 'navigate', 'goBack', 'openDetail', 'pushHistory',
  // 标签 / 领域
  'viewTagItems', 'renameTag', 'deleteTag', 'closeModal', 'closeModalThenOpenDetail',
  // 笔记（书/视频/帖子）
  'showAddNoteModal', 'toggleBooks', 'selectBook', 'loadNoteContent', 'toggleChapters',
  'toggleNoteManualSort', 'loadChapterFirst', 'triggerImageUpload', 'cancelNoteEdit',
  'saveNoteContent', 'habitCheckin', 'uploadCover', 'saveEdit', 'saveQuickCapture',
  'saveNewNote',
  // 变更 / 输入 / 拖拽
  'changeNoteSort', 'onImageSelected',
  'noteDragStart', 'noteDragOver', 'noteDragEnd', 'noteDrop'
];

(function buildRegistry(){
  const reg = {};
  for (const n of _ACTION_NAMES) {
    if (typeof window[n] === 'function') {
      reg[n] = window[n];
    } else {
      console.warn('[KB] 注册表缺失处理器（将被跳过，请检查定义）:', n);
    }
  }
  KB.actions = reg;
})();

// 统一分发器：优先注册表，回退 window[fn]。供 app.js / router.js 调用，避免互相裸名引用。
window.callAction = function callAction(name, ...args) {
  const reg = (window.KB && window.KB.actions) || {};
  const fn = (typeof reg[name] === 'function') ? reg[name]
           : (typeof window[name] === 'function') ? window[name]
           : null;
  if (typeof fn === 'function') return fn(...args);
  return undefined;
};
