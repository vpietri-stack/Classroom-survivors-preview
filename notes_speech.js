(function () {
  'use strict';
  if (!(/^\/Classroom-survivors-preview(?:\/|$)/i.test(location.pathname) || ['localhost', '127.0.0.1'].includes(location.hostname))) return;
  const player = document.querySelector('.player'), caption = document.getElementById('nowPlaying');
  const controls = document.createElement('div'); controls.className = 'notes-speech';
  const mic = document.createElement('button'), replay = document.createElement('button'), status = document.createElement('small');
  mic.id = 'notes-mic'; mic.type = replay.type = 'button'; mic.textContent = '🎤 试着读'; mic.disabled = true;
  mic.setAttribute('aria-label', '开始录音'); mic.setAttribute('aria-pressed', 'false');
  replay.id = 'notes-recording'; replay.textContent = '▷ 听我的录音'; replay.disabled = true;
  status.id = 'notes-speech-status'; status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
  status.textContent = '先点一个单词或句子，再点麦克风试读。';
  controls.append(mic, replay, status); player.append(controls);
  if (window.ResizeObserver) new ResizeObserver(() => document.documentElement.style.setProperty("--notes-player-height", player.offsetHeight + "px")).observe(player);
  let target = null, phase = 'idle', generation = 0, recorder = null, assessment = null, timer = null, recordingURL = null, ownAudio = null, runtime = null;
  const message = text => { status.textContent = text; };
  function idle() { phase = 'idle'; mic.disabled = !target; mic.textContent = '🎤 试着读'; mic.setAttribute('aria-label', '开始录音'); mic.setAttribute('aria-pressed', 'false'); }
  function cancel() {
    generation++; clearTimeout(timer); if (assessment) assessment.abort(); assessment = null;
    if (recorder) recorder.cancel(); recorder = null;
    if (ownAudio) { ownAudio.pause(); ownAudio.removeAttribute('src'); ownAudio.load(); ownAudio = null; }
    idle();
  }
  function discard() { if (recordingURL) URL.revokeObjectURL(recordingURL); recordingURL = null; replay.disabled = true; }
  function render(words) {
    caption.replaceChildren(); let index = 0, offset = 0;
    for (const match of target.text.matchAll(/[\p{L}\p{N}]+(?:['’\-][\p{L}\p{N}]+)*/gu)) {
      caption.append(document.createTextNode(target.text.slice(offset, match.index)));
      const span = document.createElement('span'); span.textContent = match[0];
      if (words && words[index]?.heardClear === true) span.className = 'notes-heard';
      caption.append(span); index++; offset = match.index + match[0].length;
    }
    caption.append(document.createTextNode(target.text.slice(offset)));
  }
  function script(src) {
    return new Promise((resolve, reject) => { const el = document.createElement('script'); el.src = src; el.onload = resolve; el.onerror = () => { el.remove(); reject(new Error('load')); }; document.head.append(el); });
  }
  async function engine() {
    try { if (parent !== window && parent.LocalEngine && parent.Recorder) return { engine: parent.LocalEngine, Recorder: parent.Recorder }; } catch (_) {}
    if (!runtime) runtime = (async () => {
      if (!window.Recorder) await script('speech_recorder.js?v=2');
      if (!window.LocalEngine) await script('speech_engine.js?v=12');
      return { engine: window.LocalEngine, Recorder: window.Recorder };
    })().catch(error => { runtime = null; throw error; });
    return runtime;
  }
  async function finish(ticket, api) {
    clearTimeout(timer); phase = 'checking'; mic.disabled = true; mic.textContent = '正在听…'; message('正在听你的录音…');
    const active = recorder; recorder = null;
    try {
      const blob = await active.stop();
      if (ticket !== generation) return;
      if (!blob || blob.size < 1000) { message('录音太短了，再试一次吧。'); return; }
      discard(); recordingURL = URL.createObjectURL(blob); replay.disabled = false;
      assessment = new AbortController(); timer = setTimeout(() => { cancel(); message('这次等得有点久，可以再试一次。'); }, 90000);
      const result = await api.engine.transcribe(blob, { target: target.text, signal: assessment.signal });
      if (ticket !== generation) return;
      render(result.targetWords);
      message(result.targetStatus === 'unavailable' ? '暂时没能检查这些词。可以听自己的录音，或再试一次。' : '绿色是听清的词。可以听自己的录音，或再读一次。');
    } catch (_) { if (ticket === generation) message('这次没听清。可以听自己的录音，或再试一次。'); }
    finally { if (ticket === generation) { clearTimeout(timer); assessment = null; idle(); } }
  }
  mic.addEventListener('click', async () => {
    if (phase === 'recording') { finish(generation, await engine()); return; }
    if (!target || phase !== 'idle') return;
    cancel(); const ticket = generation; discard(); render();
    window.InteractiveNotesPOC.pause();
    phase = 'preparing'; mic.disabled = true; message('正在准备语音，首次使用可能需要等一会儿…');
    timer = setTimeout(() => { cancel(); message('语音准备得有点久，可以再点麦克风重试。'); }, 120000);
    try {
      const api = await engine();
      if (ticket !== generation) return;
      if (!api.Recorder.isSupported()) throw new Error('unsupported');
      await api.engine.load(percent => { if (ticket === generation) message('正在准备语音：' + percent + '%，请稍候…'); });
      if (ticket !== generation) return;
      recorder = new api.Recorder(); await recorder.start();
      if (ticket !== generation) return;
      clearTimeout(timer); phase = 'recording'; mic.disabled = false; mic.textContent = '■ 停止录音'; mic.setAttribute('aria-label', '停止录音'); mic.setAttribute('aria-pressed', 'true');
      message('正在录音，读完再点一次麦克风。');
      timer = setTimeout(() => { if (ticket === generation) finish(ticket, api); }, 20000);
    } catch (error) {
      if (ticket !== generation) return;
      cancel(); message(error.name === 'NotAllowedError' ? '请允许使用麦克风，然后再试一次。' : '语音暂时没准备好。仍然可以点读，稍后再试。');
    }
  });
  replay.addEventListener('click', () => {
    if (!recordingURL || phase !== 'idle') return;
    window.InteractiveNotesPOC.pause(); if (ownAudio) ownAudio.pause(); ownAudio = new Audio(recordingURL);
    ownAudio.play().catch(() => message('录音暂时没能播放，请再点一次。'));
  });
  window.addEventListener('notes-select', event => {
    const changed = !target || target.id !== event.detail.id;
    cancel(); target = event.detail; mic.disabled = false;
    if (changed) { discard(); message('点麦克风试读，读完再点一次停止。'); }
  });
  document.getElementById('stop').addEventListener('click', () => { cancel(); message('已停止。可以继续点读或试读。'); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) { cancel(); discard(); message('已停止录音。'); } });
  function dispose() { cancel(); discard(); target = null; idle(); }
  window.NotesSpeech = { dispose };
  window.addEventListener('pagehide', dispose);
})();
