(function () {
  'use strict';
  const lesson = window.InteractiveNotesData;
  const $ = id => document.getElementById(id);
  let current = null, audio = null, generation = 0, playing = false, timer = null, fetchController = null;
  const audioCache = new Map();
  function updateActive(id) {
    document.querySelectorAll('.hotspot').forEach(button => {
      button.classList.toggle('active', !!id && button.dataset.clip === id);
      button.setAttribute('aria-pressed', String(!!id && button.dataset.clip === id));
    });
  }
  function stop() {
    generation++; clearTimeout(timer); timer = null;
    if (fetchController) fetchController.abort();
    fetchController = null;
    if (audio) { audio.onended = null; audio.onerror = null; audio.pause(); audio.removeAttribute('src'); audio.load(); audio = null; }
    playing = false; $('stop').disabled = true; updateActive(null);
  }
  function play(id) {
    const clip = lesson.clips[id];
    if (!clip) return;
    stop(); current = id; const token = generation;
    $('nowPlaying').textContent = clip.text;
    $('playerStatus').textContent = '正在播放 · ' + clip.translation;
    delete $('playerStatus').dataset.audioError;
    $('replay').disabled = false; $('stop').disabled = false;
    playing = true; updateActive(id);
    let usedBlob = audioCache.has(clip.audio);
    function failed(error) {
      if (token !== generation) return;
      $('playerStatus').dataset.audioError = (error && error.name) || (audio && audio.error ? 'media-' + audio.error.code : 'playback-timeout');
      stop(); $('playerStatus').textContent = '这段音频暂时没能播放，请点“再听一次”重试。';
    }
    async function retryFullFile(error) {
      if (token !== generation) return;
      if (usedBlob || (error && error.name === 'NotAllowedError')) { failed(error); return; }
      usedBlob = true; clearTimeout(timer);
      if (audio) { audio.onended = null; audio.onerror = null; audio.onplaying = null; audio.pause(); audio.removeAttribute('src'); audio.load(); }
      $('playerStatus').textContent = '正在加载这段音频，请稍等…';
      const controller = new AbortController(); fetchController = controller;
      const timeout = setTimeout(() => controller.abort(), 15000);
      try {
        // A static-host range/media request can stall while a regular full GET
        // succeeds. Reuse the same saved MP3 through a local Blob URL instead.
        const response = await fetch(clip.audio, { signal: controller.signal });
        if (!response.ok) throw new Error('audio unavailable');
        const bytes = await response.arrayBuffer();
        if (bytes.byteLength < 1000) throw new Error('empty audio');
        if (token !== generation) return;
        const url = URL.createObjectURL(new Blob([bytes], { type: 'audio/mpeg' }));
        audioCache.set(clip.audio, url); startAudio(url);
      } catch (failure) { if (token === generation) failed(failure); }
      finally { clearTimeout(timeout); if (fetchController === controller) fetchController = null; }
    }
    function startAudio(source) {
      if (token !== generation) return;
      let failureHandled = false;
      const onFailure = error => {
        if (failureHandled) return;
        failureHandled = true; retryFullFile(error);
      };
      audio = new Audio(source); audio.playbackRate = Number($('speed').value);
      audio.onended = () => {
        if (token !== generation) return;
        stop(); $('playerStatus').textContent = clip.translation + ' · 还想听就再点一次。';
      };
      audio.onplaying = () => {
        if (token !== generation) return;
        clearTimeout(timer); timer = setTimeout(failed, 45000);
        $('playerStatus').textContent = '正在播放 · ' + clip.translation;
      };
      audio.onerror = onFailure;
      timer = setTimeout(onFailure, 4000);
      audio.play().catch(onFailure);
    }
    startAudio(audioCache.get(clip.audio) || clip.audio);
  }
  lesson.pages.forEach((page, index) => {
    const article = document.createElement('article'); article.className = 'note-page'; article.id = 'page-' + (index + 1);
    const label = document.createElement('div'); label.className = 'page-label';
    const number = document.createElement('b'); number.textContent = String(index + 1).padStart(2, '0') + ' / 04';
    const title = document.createElement('span'); title.textContent = page.title; label.append(number, title);
    const viewport = document.createElement('div'); viewport.className = 'paper-viewport';
    const paper = document.createElement('div'); paper.className = 'paper'; paper.style.aspectRatio = page.width + ' / ' + page.height;
    const image = document.createElement('img'); image.className = 'page-image'; image.src = 'interactive_notes_assets/' + page.file;
    image.alt = 'PU3 Unit 9 p.111 预习图，第 ' + (index + 1) + ' 页：' + page.title;
    image.width = page.width; image.height = page.height; image.draggable = false;
    if (index > 0) image.loading = 'lazy';
    paper.append(image);
    page.hotspots.forEach(spot => {
      const clip = lesson.clips[spot.clip];
      const button = document.createElement('button'); button.type = 'button'; button.className = 'hotspot ' + spot.kind;
      button.dataset.clip = spot.clip; button.setAttribute('aria-label', '听' + (clip.kind === 'word' ? '单词' : '例句') + '：' + clip.text);
      button.setAttribute('aria-pressed', 'false'); button.title = '♪ ' + clip.text;
      const [x, y, w, h] = spot.rect;
      Object.assign(button.style, { left: x / page.width * 100 + '%', top: y / page.height * 100 + '%', width: w / page.width * 100 + '%', height: h / page.height * 100 + '%' });
      button.addEventListener('click', () => play(spot.clip)); paper.append(button);
    });
    viewport.append(paper); article.append(label, viewport); $('pages').append(article);
  });
  const embedded = new URLSearchParams(location.search);
  if (embedded.get('embed') === '1' && parent !== window) {
    const request = embedded.get('request');
    document.querySelector('.toolbar-title a').removeAttribute('href');
    const action = document.createElement('div'); action.className = 'reader-study-action';
    const button = document.createElement('button'); button.type = 'button';
    const review = embedded.get('mode') === 'review';
    button.id = 'reader-study-start'; button.textContent = review ? '返回主界面' : '开始学习';
    button.onclick = () => {
      stop();
      if (!review) { button.disabled = true; button.textContent = '正在开始学习…'; }
      parent.postMessage({ action: review ? 'close-note' : 'start-note-study', request }, location.origin);
    };
    action.append(button); $('pages').after(action);
    window.addEventListener('message', event => {
      if (event.source === parent && event.origin === location.origin && event.data?.request === request && event.data.action === 'note-study-error') {
        button.disabled = false; button.textContent = '开始学习';
      }
    });
  }
  $('showAreas').addEventListener('change', () => document.body.classList.toggle('show-areas', $('showAreas').checked));
  $('zoom').addEventListener('change', () => document.documentElement.style.setProperty('--zoom', $('zoom').value));
  $('speed').addEventListener('change', () => { if (audio) audio.playbackRate = Number($('speed').value); });
  $('stop').addEventListener('click', () => { stop(); $('playerStatus').textContent = '已停止。点单词、图片或句子继续听。'; });
  $('replay').addEventListener('click', () => { if (current) play(current); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); });
  window.addEventListener('pagehide', () => { stop(); audioCache.forEach(url => URL.revokeObjectURL(url)); audioCache.clear(); });
  window.InteractiveNotesPOC = { snapshot: () => ({ pageCount: lesson.pages.length, currentClip: current, playing, mode: 'listening-only' }) };
})();
