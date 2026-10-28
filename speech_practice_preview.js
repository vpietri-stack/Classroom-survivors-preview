(function () {
  'use strict';
  const prepare = document.getElementById('prepare'), practice = document.getElementById('practice'), status = document.getElementById('status'), sentence = document.getElementById('sentence');
  let ready = false;
  function showSentence() {
    if (!ready) return;
    practice.replaceChildren(SpeechUI.makeSentenceGate({ target: sentence.value, book: 'PU2', mode: 'study', onDone: function () {
      status.textContent = '已继续到下一句。本页没有记录分数或学习进度。';
      sentence.selectedIndex = (sentence.selectedIndex + 1) % sentence.options.length; showSentence();
    } }));
  }
  if (typeof SPEECH_PRACTICE_ENABLED === 'undefined' || !SPEECH_PRACTICE_ENABLED) { prepare.hidden = true; status.textContent = '此页面只在预览站开放。'; return; }
  sentence.addEventListener('change', showSentence);
  prepare.addEventListener('click', async function () {
    prepare.disabled = true; status.textContent = '正在准备语音模型。首次使用可能需要等待一会儿…';
    try {
      await LocalEngine.load(function (percent) { status.textContent = '正在下载语音文件：' + percent + '%。下载完成后会继续准备，请稍候。'; });
      ready = true; prepare.hidden = true; practice.hidden = false; status.textContent = '准备好了。点击录音，读完后点击停止。'; showSentence();
    } catch (_) { prepare.disabled = false; prepare.textContent = '重新准备'; status.textContent = '暂时没有准备好。可以稍后再试。'; }
  });
})();
