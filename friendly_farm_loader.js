(function (root) {
  'use strict';

  const ALLOWED_IDS = new Set([
    'pu1-u0-p5', 'pu1-u1-p8', 'pu1-u2-p20', 'pu1-u3-p32', 'pu1-u4-p46',
    'pu1-u5-p58', 'pu1-u6-p70', 'pu1-u7-p84', 'pu1-u8-p96', 'pu1-u9-p108',
    'pu2-u0-p5', 'pu2-u1-p8', 'pu2-u2-p20', 'pu2-u3-p32', 'pu2-u4-p46',
    'pu2-u5-p58', 'pu2-u6-p70', 'pu2-u7-p84', 'pu2-u8-p96', 'pu2-u9-p108',
    'pu3-u0-p5', 'pu3-u1-p8', 'pu3-u2-p20', 'pu3-u3-p32', 'pu3-u4-p46',
    'pu3-u5-p58', 'pu3-u6-p70', 'pu3-u7-p84', 'pu3-u8-p96', 'pu3-u9-p108'
  ]);

  function showNotice(message) {
    const pages = document.getElementById('pages');
    if (pages) {
      const box = document.createElement('p');
      box.id = 'friendly-farm-error';
      box.textContent = message;
      pages.replaceChildren(box);
    }
    const status = document.getElementById('playerStatus');
    if (status) status.textContent = message;
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.async = false;
      script.onload = resolve;
      script.onerror = () => reject(new Error('Failed to load ' + src));
      document.head.append(script);
    });
  }

  function applyLessonChrome(lesson) {
    if (!lesson) return;
    document.title = (lesson.label || lesson.title || '故事点读') + ' · 点读预习 · Classroom Survivors';
    const labelEl = document.getElementById('lesson-label');
    if (labelEl && lesson.label) labelEl.textContent = lesson.label;
    const navLink = document.querySelector('#lesson-nav a');
    if (navLink && lesson.pages?.[0]?.title) navLink.textContent = '1 ' + lesson.pages[0].title;
    const footerEl = document.getElementById('lesson-footer');
    if (footerEl && lesson.footer) footerEl.textContent = lesson.footer;
  }

  if (typeof module !== 'undefined' && module.exports && typeof document === 'undefined') {
    module.exports = { ALLOWED_IDS };
    return;
  }

  const params = new URLSearchParams(location.search);
  const id = params.get('id') || '';

  if (!ALLOWED_IDS.has(id)) {
    showNotice('请从预习笔记目录中选择要打开的故事课文。');
    root.FriendlyFarmLoader = { ALLOWED_IDS, ready: Promise.resolve(null) };
    return;
  }

  const ready = loadScript('friendly_farm_assets/' + id + '/data.js?v=1')
    .then(() => {
      applyLessonChrome(root.InteractiveNotesData);
      return loadScript('pu3_u3_p35_assets.js?v=1');
    })
    .then(() => loadScript('interactive_notes_poc.js?v=pu3-p35-v2'))
    .then(() => loadScript('notes_speech.js?v=2026-11-24c'))
    .then(() => root.InteractiveNotesData)
    .catch(() => {
      showNotice('这篇故事资源暂时没能加载，请检查网络或返回目录重试。');
      return null;
    });

  root.FriendlyFarmLoader = { ALLOWED_IDS, ready };
})(typeof window !== 'undefined' ? window : globalThis);
