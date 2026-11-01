(() => {
  'use strict';

  const MISSING = NonSpellingContent.catalog.missing;
  const FIX = NonSpellingContent.catalog.fix;
  const WIDGET_HTML = "<div id=\"exercise-widget\" class=\"non-spelling-exercises\">\n    <div id=\"sentences\" class=\"nse-sentences\" lang=\"en\"></div>\n    <button id=\"bin\" class=\"nse-bin\" type=\"button\" hidden>\n      <span class=\"nse-bin-target\" aria-hidden=\"true\">\n        <svg class=\"nse-bin-icon\" viewBox=\"0 0 40 44\" fill=\"none\">\n          <path class=\"nse-bin-handle\" d=\"M15 9V6.5C15 5.1 16.1 4 17.5 4h5C23.9 4 25 5.1 25 6.5V9\" stroke=\"currentColor\" stroke-width=\"3.5\" stroke-linecap=\"round\"/>\n          <path class=\"nse-bin-body\" d=\"M9 14h22l-1.5 23.5a3.5 3.5 0 0 1-3.5-3.3H14a3.5 3.5 0 0 1-3.5-3.3L9 14Z\"/>\n          <path class=\"nse-bin-grooves\" d=\"m15.5 21 .7 12M20 21v12m4.5-12-.7 12\" stroke=\"currentColor\" stroke-width=\"2.5\" stroke-linecap=\"round\"/>\n          <path class=\"nse-bin-lid\" d=\"M6 11.5h28\" stroke=\"currentColor\" stroke-width=\"4.5\" stroke-linecap=\"round\"/>\n        </svg>\n        <i id=\"bin-mark\" aria-hidden=\"true\" hidden></i>\n      </span>\n      <span id=\"bin-label\" lang=\"en\">Bin</span>\n      <i id=\"bin-undo\" class=\"fas fa-undo\" aria-hidden=\"true\" hidden></i>\n    </button>\n    <div id=\"keyboard\" class=\"nse-keyboard\" role=\"group\" aria-label=\"可重复使用的字母键盘\"></div>\n    <div id=\"actions\" class=\"nse-actions\">\n      <button id=\"check\" lang=\"en\" class=\"game-btn bg-green-500 py-3 px-8 flex-1 max-w-[160px]\" type=\"button\">CHECK</button>\n      <button id=\"clear\" lang=\"en\" class=\"game-btn bg-gray-500 py-3 px-8 flex-1 max-w-[160px]\" type=\"button\">CLEAR</button>\n      <button id=\"backspace\" class=\"game-btn bg-gray-500 nse-backspace\" type=\"button\" aria-label=\"删除最后一个字母\">⌫</button>\n    </div>\n    <p id=\"feedback\" class=\"nse-feedback\" role=\"status\" aria-live=\"polite\"></p>\n    <div id=\"result-action\" class=\"mt-2 text-center\" hidden><button id=\"next\" lang=\"en\" class=\"game-btn bg-green-500 text-2xl py-4 px-8\" type=\"button\">NEXT</button></div>\n    <div id=\"summary\" class=\"nse-summary\" hidden></div>\n  </div>";
  let externalMode = null, widgetRoot = null;
  const REVEAL_MS = 3000;
  const STUDY_ADVANCE_MS = 1200;
  const $ = id => document.getElementById(id);
  let session = [], cursor = 0, input = [], activeBox = 0, selectedWord = null, binnedWord = null;
  let letters = [], verdict = null, locked = false, solved = false, resetTimer = null, drag = null, resetDue = 0;

  function shuffle(items) {
    const copy = [...items];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }
  function current() { return session[cursor]; }
  function prefix(index) { return current().type === 'missing' ? (current().prefixes || [])[index] || '' : ''; }
  function suffix(index) { return current().type === 'missing' ? (current().suffixes || [])[index] || '' : ''; }
  function fullAnswer(index) { return input[index] + suffix(index); }
  function makeButton(className, label, handler) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = className;
    button.textContent = label;
    if (handler) button.addEventListener('click', handler);
    return button;
  }
  function message(text, kind = '') {
    $('feedback').replaceChildren();
    $('feedback').className = 'nse-feedback' + (kind ? ' ' + kind : '');
    if (!text) return;
    if (kind) {
      const icon = document.createElement('i');
      icon.className = 'nse-feedback-icon fas ' + (kind === 'success' ? 'fa-check-circle' : 'fa-redo-alt');
      icon.setAttribute('aria-hidden', 'true');
      $('feedback').appendChild(icon);
    }
    const label = document.createElement('span');
    label.className = 'nse-feedback-text';
    label.textContent = text;
    $('feedback').appendChild(label);
  }
  function cancelTimer() { clearTimeout(resetTimer); resetTimer = null; resetDue = 0; }
  function later(fn,ms) { resetDue=Date.now()+ms; resetTimer=setTimeout(()=>{resetTimer=null;resetDue=0;fn();},ms); }
  function clearDrag() {
    if (drag && drag.ghost) drag.ghost.remove();
    drag = null;
    $('bin').classList.remove('drag-over');
  }
  function resetAnswer() {
    cancelTimer();
    clearDrag();
    input = current().type === 'missing' ? current().answers.map((_, index) => prefix(index)) : [''];
    activeBox = 0;
    selectedWord = binnedWord = null;
    verdict = null;
    locked = solved = false;
    message('');
    render();
  }
  function startExercise() {
    const exercise = current();
    const targets = exercise.type === 'missing' ? exercise.answers : [exercise.answer];
    letters = shuffle([...new Set(targets.map((target, index) => target.slice(prefix(index).length, target.length - suffix(index).length)).join('').toLowerCase())]);
    $('summary').hidden = true;
    $('sentences').hidden = false;
    $('actions').hidden = false;
    if (externalMode) { resetAnswer(); return; }
    const study = exercise.presentation === 'study';
    $('studyModeOverlay').classList.toggle('hidden', !study);
    $('grammarGame').classList.toggle('hidden', study);
    (study ? $('study-game-area') : $('game-exercise-area')).appendChild($('exercise-widget'));
    $('study-title').textContent = exercise.type === 'missing' ? 'Round D: Missing Words' : 'Round D: Find and Fix';
    $('study-instruction').textContent = exercise.type === 'missing' ? '点击空格，用字母补全单词。' : '找出用错的单词并改正。';
    $('game-title').textContent = exercise.type === 'missing' ? 'Missing Words!' : 'Find and Fix!';
    $('exercise-id').textContent = exercise.id;
    $('progress-label').textContent = (study ? '学习' : '游戏') + ' · 第' + (cursor + 1) + '/' + session.length + '题';
    renderProgress();
    resetAnswer();
  }
  function renderProgress() {
    if (externalMode) return;
    $('study-progress-indicator').replaceChildren();
    ['认单词', '拼单词', '写单词', '综合练习'].forEach((label, index) => {
      const marker = document.createElement('span');
      marker.className = 'flex-1 h-2 rounded-full transition-all duration-300 ' + (index < 3 ? 'bg-green-400' : 'bg-yellow-400 animate-pulse');
      marker.title = label;
      $('study-progress-indicator').appendChild(marker);
    });
  }
  function chooseBox(index) {
    if (locked) return;
    activeBox = index;
    render();
    $('sentences').querySelector('[data-box="' + index + '"]').focus({ preventScroll: true });
  }
  function answerBox(index, target) {
    const button = makeButton('nse-answer', '', () => chooseBox(index));
    button.dataset.box = index;
    button.setAttribute('aria-label', '第' + (index + 1) + '个空格：' + (fullAnswer(index) || '未填写'));
    button.setAttribute('aria-pressed', String(index === activeBox));
    if (index === activeBox && !locked) button.classList.add('active');
    if (verdict && current().type === 'fix') button.classList.add(verdict.word ? 'word-correct' : 'word-wrong');
    if (!input[index] && !verdict) {
      const placeholder = document.createElement('span');
      placeholder.className = 'nse-empty';
      placeholder.setAttribute('aria-hidden', 'true');
      button.appendChild(placeholder);
    } else {
      const count = verdict ? Math.max(input[index].length, target.length - suffix(index).length) : input[index].length;
      for (let i = 0; i < count; i++) {
        const span = document.createElement('span');
        span.className = 'letter';
        span.textContent = input[index][i] || '−';
        if (i < prefix(index).length) span.classList.add('nse-prefilled');
        else if (verdict) span.classList.add(input[index][i] === target[i] ? 'correct' : 'wrong');
        button.appendChild(span);
      }
      if (!verdict && prefix(index) && input[index].length === prefix(index).length) {
        const placeholder = document.createElement('span');
        placeholder.className = 'nse-empty';
        placeholder.setAttribute('aria-hidden', 'true');
        button.appendChild(placeholder);
      }
    }
    for (const letter of suffix(index)) {
      const span = document.createElement('span');
      span.className = 'letter nse-prefilled nse-suffix';
      span.textContent = letter;
      button.appendChild(span);
    }
    if (verdict) {
      button.classList.add(fullAnswer(index) === target ? 'spelling-correct' : 'spelling-wrong');
      if (fullAnswer(index) === target && (current().type === 'missing' || verdict.word)) button.classList.add('all-correct');
    }
    return button;
  }
  function plainWord(token) { return token.replace(/[.,!?]+$/, '').toLowerCase(); }
  function render() {
    const exercise = current();
    $('sentences').replaceChildren();
    if (exercise.type === 'missing') {
      let blank = 0;
      exercise.sentences.forEach(text => {
        const row = document.createElement('div');
        row.className = 'nse-sentence' + (exercise.presentation === 'game' ? ' sentence-row' : '');
        const tokens = text.split(/(___|\s+)/).filter(token => token.trim());
        const tailStart = tokens.lastIndexOf('___') + 1;
        const tailLength = tokens.length - tailStart;
        if (tailLength > 1) {
          const groupStart = tailLength <= 4 ? tailStart : tokens.length - 2;
          tokens.splice(groupStart, tokens.length - groupStart, tokens.slice(groupStart).join(' '));
        }
        tokens.forEach(token => {
          if (token === '___') {
            const box = answerBox(blank, exercise.answers[blank]);
            const previous = row.lastElementChild;
            if (exercise.answers[blank].startsWith("'") && previous && previous.classList.contains('nse-fixed-word')) {
              // A contraction is one visual word, even on a narrow phone.
              if (row.lastChild.nodeType === Node.TEXT_NODE) row.lastChild.remove();
              const group = document.createElement('span');
              group.className = 'nse-contraction';
              group.append(previous, box);
              row.appendChild(group);
            } else row.appendChild(box);
            if (blank === activeBox && !locked) row.classList.add('nse-active');
            blank++;
          } else {
            const word = document.createElement('span');
            word.className = 'nse-fixed-word';
            word.textContent = token;
            row.appendChild(word);
          }
          row.appendChild(document.createTextNode(' '));
        });
        $('sentences').appendChild(row);
      });
    } else {
      const row = document.createElement('div');
      row.className = 'nse-sentence' + (exercise.presentation === 'game' ? ' sentence-row' : '');
      exercise.sentence.split(' ').forEach((token, index) => {
        if (index === binnedWord) {
          row.appendChild(answerBox(0, exercise.answer));
          const punctuation = token.match(/[.,!?]+$/);
          if (punctuation) row.appendChild(document.createTextNode(punctuation[0]));
        } else {
          const word = makeButton('nse-word word ' + (exercise.presentation === 'study' ? 'study-word-tile' : 'draggable'), token, event => {
            if (event.currentTarget.dataset.dragged === 'true') {
              delete event.currentTarget.dataset.dragged;
              return;
            }
            if (locked || binnedWord !== null) return;
            selectedWord = index;
            render();
          });
          word.dataset.word = index;
          word.setAttribute('aria-label', '选择单词 ' + token);
          word.setAttribute('aria-pressed', String(selectedWord === index));
          word.disabled = locked || binnedWord !== null;
          if (selectedWord === index) word.classList.add('selected');
          word.addEventListener('pointerdown', event => beginDrag(event, index));
          row.appendChild(word);
        }
        row.appendChild(document.createTextNode(' '));
      });
      $('sentences').appendChild(row);
    }
    $('bin').hidden = exercise.type !== 'fix';
    $('bin').className = 'nse-bin';
    if (selectedWord !== null) $('bin').classList.add('ready');
    if (binnedWord !== null) $('bin').classList.add('has-word');
    $('bin').disabled = locked;
    $('bin-label').textContent = binnedWord !== null
      ? exercise.sentence.split(' ')[binnedWord]
      : selectedWord !== null ? 'Bin “' + exercise.sentence.split(' ')[selectedWord] + '”' : 'Bin';
    $('bin').setAttribute('aria-label', verdict && exercise.type === 'fix'
      ? (verdict.word ? '找对了错误单词：' : '选错了要改的单词：') + exercise.sentence.split(' ')[binnedWord]
      : binnedWord !== null ? '把 ' + exercise.sentence.split(' ')[binnedWord] + ' 放回句子' : '将所选单词放入垃圾桶');
    $('bin-undo').hidden = binnedWord === null || locked;
    $('bin-mark').hidden = !verdict || exercise.type !== 'fix';
    $('bin-mark').className = 'fas ' + (verdict && verdict.word ? 'fa-check-circle' : 'fa-times-circle');
    if (verdict && exercise.type === 'fix' && verdict.word) {
      const wordRect = $('bin-label').getBoundingClientRect();
      const binRect = $('bin').querySelector('.nse-bin-icon').getBoundingClientRect();
      $('bin').style.setProperty('--swallow-x', (binRect.left + binRect.width / 2 - wordRect.left - wordRect.width / 2) + 'px');
      $('bin').style.setProperty('--swallow-y', (binRect.top + binRect.height * .28 - wordRect.top - wordRect.height / 2) + 'px');
      $('bin').style.setProperty('--binned-width', wordRect.width + 'px');
    }
    if (verdict && exercise.type === 'fix') $('bin').classList.add(verdict.word ? 'word-correct' : 'word-wrong');
    const showKeyboard = exercise.type === 'missing' || binnedWord !== null;
    $('keyboard').hidden = !showKeyboard;
    $('keyboard').dataset.keyCount = letters.length;
    $('keyboard').replaceChildren();
    const rowLength = letters.length > 4 ? Math.ceil(letters.length / 2) : letters.length;
    let keyRow;
    if (showKeyboard) letters.forEach((letter, index) => {
      if (index % rowLength === 0) {
        keyRow = document.createElement('div');
        keyRow.className = 'nse-key-row';
        $('keyboard').appendChild(keyRow);
      }
      const key = makeButton('key ' + (exercise.presentation === 'study' ? 'study-letter-btn' : 'letter-bubble'), letter, () => typeLetter(letter));
      key.dataset.letter = letter;
      key.setAttribute('aria-label', letter === "'" ? '撇号' : '字母 ' + letter);
      key.disabled = locked;
      keyRow.appendChild(key);
    });
    $('backspace').disabled = locked || !showKeyboard || input[activeBox].length <= prefix(activeBox).length;
    $('clear').disabled = solved;
    $('check').hidden = solved;
    $('check').disabled = locked;
    $('actions').hidden = solved;
    $('result-action').hidden = !solved || exercise.presentation === 'study';
    $('next').textContent = externalMode && externalMode.nextLabel || 'GET POWER UP!';
    $('next').classList.toggle('animate-bounce', exercise.presentation === 'game');
  }
  function typeLetter(letter) {
    if (locked || !letters.includes(letter) || (current().type === 'fix' && binnedWord === null)) return;
    const target = current().type === 'missing' ? current().answers[activeBox] : current().answer;
    if (input[activeBox].length >= Math.max(12, target.length)) return;
    input[activeBox] += letter;
    message('');
    render();
  }
  function backspace() {
    if (locked || (current().type === 'fix' && binnedWord === null)) return;
    if (input[activeBox].length <= prefix(activeBox).length) return;
    input[activeBox] = input[activeBox].slice(0, -1);
    message('');
    render();
  }
  function putInBin(index) {
    if (locked || binnedWord !== null) return;
    binnedWord = index;
    selectedWord = null;
    input = [''];
    activeBox = 0;
    message('');
    render();
    $('sentences').querySelector('[data-box="0"]').focus({ preventScroll: true });
  }
  function handleBin() {
    if (locked) return;
    if (binnedWord !== null) {
      binnedWord = selectedWord = null;
      input = [''];
      render();
    } else if (selectedWord !== null) putInBin(selectedWord);
    else message('请先选择一个单词。');
  }
  function beginDrag(event, index) {
    if (locked || binnedWord !== null || event.button !== 0) return;
    const word = event.currentTarget;
    drag = { index, x: event.clientX, y: event.clientY, moved: false, ghost: null };
    word.setPointerCapture(event.pointerId);
    const move = moveEvent => {
      if (!drag) return;
      if (!drag.moved && Math.hypot(moveEvent.clientX - drag.x, moveEvent.clientY - drag.y) > 8) {
        drag.moved = true;
        drag.ghost = document.createElement('div');
        drag.ghost.className = 'drag-ghost';
        drag.ghost.textContent = word.textContent;
        document.body.appendChild(drag.ghost);
      }
      if (drag.moved) {
        drag.ghost.style.left = moveEvent.clientX + 'px';
        drag.ghost.style.top = moveEvent.clientY + 'px';
        const rect = $('bin').getBoundingClientRect();
        $('bin').classList.toggle('drag-over', moveEvent.clientX >= rect.left && moveEvent.clientX <= rect.right && moveEvent.clientY >= rect.top && moveEvent.clientY <= rect.bottom);
      }
    };
    const finish = finishEvent => {
      word.removeEventListener('pointermove', move);
      word.removeEventListener('pointerup', finish);
      word.removeEventListener('pointercancel', finish);
      if (!drag) return;
      const moved = drag.moved;
      const dropped = finishEvent.type === 'pointerup' && moved && $('bin').classList.contains('drag-over');
      clearDrag();
      if (moved) word.dataset.dragged = 'true';
      if (dropped) putInBin(index);
    };
    word.addEventListener('pointermove', move);
    word.addEventListener('pointerup', finish);
    word.addEventListener('pointercancel', finish);
  }
  function check() {
    if (locked || cursor >= session.length) return;
    const exercise = current();
    if (exercise.type === 'fix' && binnedWord === null) return message('请先把一个单词放入垃圾桶。');
    if (input.some((value, index) => value.length <= prefix(index).length)) return message('请先填好所有空格。');
    exercise.attempts++;
    if (exercise.type === 'missing') {
      verdict = { spelling: input.every((value, index) => fullAnswer(index) === exercise.answers[index]) };
    } else {
      const correctPosition = !Number.isInteger(exercise.wrongIndex) || binnedWord === exercise.wrongIndex;
      verdict = { word: correctPosition && plainWord(exercise.sentence.split(' ')[binnedWord]) === exercise.wrongWord, spelling: input[0] === exercise.answer };
    }
    solved = verdict.spelling && (exercise.type === 'missing' || verdict.word);
    locked = true;
    render();
    if (externalMode && externalMode.onCheck) externalMode.onCheck({ attempts: exercise.attempts, solved, verdict: { ...verdict } });
    if (solved) {
      exercise.complete = true;
      exercise.firstAttempt = exercise.attempts === 1;
      renderProgress();
      message(exercise.firstAttempt ? '答对了！' : '答对了！稍后再复习这题。', 'success');
      if (exercise.presentation === 'study') later(next, STUDY_ADVANCE_MS);
      else requestAnimationFrame(() => {
        if (current() !== exercise || !solved || !isActive()) return;
        $('result-action').scrollIntoView({ block: 'nearest', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
      });
    } else {
      exercise.firstAttempt = false;
      const text = exercise.type === 'missing' ? '请改正红色字母，整题将自动重置。'
        : !verdict.word && !verdict.spelling ? '单词选错了，新单词也拼错了。'
        : !verdict.word ? '单词选错了，但新单词拼对了。'
        : '单词选对了，请改正红色字母。';
      message(text, 'error');
      later(resetAnswer, REVEAL_MS);
    }
  }
  function finishSession() {
    cancelTimer();
    $('game-title').textContent = 'Test set complete!';
    $('exercise-id').textContent = '完成';
    $('progress-label').textContent = '8/8 题';
    ['sentences', 'bin', 'keyboard', 'actions', 'result-action'].forEach(id => { $(id).hidden = true; });
    message('首次答对 ' + session.filter(exercise => exercise.firstAttempt).length + '/8 题。', 'success');
    $('summary').replaceChildren();
    session.forEach(exercise => {
      const row = document.createElement('div');
      row.className = 'nse-summary-row';
      const label = document.createElement('span');
      label.textContent = (exercise.presentation === 'study' ? '学习' : '游戏') + ' · ' + exercise.id;
      const attempts = document.createElement('span');
      attempts.textContent = '检查 ' + exercise.attempts + ' 次';
      row.append(label, attempts);
      $('summary').appendChild(row);
    });
    const restart = makeButton('game-btn bg-green-500', '再练一组', newSession);
    restart.style.marginTop = '20px';
    $('summary').appendChild(restart);
    $('summary').hidden = false;
  }
  function next() {
    if (!solved) return;
    if (externalMode) {
      const onNext = externalMode.onNext;
      destroy();
      if (onNext) onNext();
      return;
    }
    cancelTimer();
    cursor++;
    if (cursor === session.length) finishSession();
    else startExercise();
  }
  function newSession() {
    cancelTimer();
    clearDrag();
    session = ['study', 'game'].flatMap(presentation => [
      ...shuffle(MISSING).slice(0, 2).map(exercise => ({ ...exercise, type: 'missing', presentation })),
      ...shuffle(FIX).slice(0, 2).map(exercise => ({ ...exercise, type: 'fix', presentation }))
    ]).map(exercise => ({ ...exercise, attempts: 0, firstAttempt: null, complete: false }));
    cursor = 0;
    startExercise();
  }


  function getState() { return { cursor, input: [...input], activeBox, selectedWord, binnedWord, locked, solved,
    letters:letters.slice(), verdict:verdict&&{...verdict}, attempts:current()&&current().attempts,
    firstAttempt:current()&&current().firstAttempt, remainingMs:resetDue?Math.max(0,resetDue-Date.now()):null,
    message:$('feedback')&&$('feedback').textContent, messageKind:$('feedback')&&$('feedback').classList.contains('success')?'success':$('feedback')&&$('feedback').classList.contains('error')?'error':'' }; }
  function restoreState(saved) {
    if(!saved||!Array.isArray(saved.input))return;
    cancelTimer();input=saved.input.slice();activeBox=saved.activeBox;selectedWord=saved.selectedWord;binnedWord=saved.binnedWord;
    locked=!!saved.locked;solved=!!saved.solved;letters=saved.letters.slice();verdict=saved.verdict;
    current().attempts=saved.attempts||0;current().firstAttempt=saved.firstAttempt;current().complete=solved;
    render();message(saved.message||'',saved.messageKind||'');
    if(locked)later(solved?next:resetAnswer,Math.max(0,Math.min(saved.remainingMs==null?100:saved.remainingMs,3000)));
  }
  function isActive() {
    if (!widgetRoot || !widgetRoot.isConnected) return false;
    const overlay = widgetRoot.closest('.overlay');
    return !overlay || !overlay.classList.contains('hidden');
  }
  function bindWidget() {
  $('bin').addEventListener('click', handleBin);
  $('backspace').addEventListener('click', backspace);
  $('clear').addEventListener('click', () => { if (!solved) resetAnswer(); });
  $('check').addEventListener('click', check);
  $('next').addEventListener('click', next);
    document.addEventListener('keydown', handleKeyboard, true);
  }
  function destroy() {
    cancelTimer();
    if (widgetRoot) {
      clearDrag();
      widgetRoot.remove();
    }
    document.removeEventListener('keydown', handleKeyboard, true);
    widgetRoot = null;
    externalMode = null;
  }
  function mount(container, exercise, options) {
    destroy();
    externalMode = options;
    container.insertAdjacentHTML('beforeend', WIDGET_HTML);
    widgetRoot = document.getElementById('exercise-widget');
    session = [{ ...exercise, type: exercise.type === 'missing-word' ? 'missing' : 'fix', presentation: options.presentation, attempts: 0, firstAttempt: null, complete: false }];
    cursor = 0;
    bindWidget();
    startExercise();
    if (options.resumeState) restoreState(options.resumeState);
  }
  function handleKeyboard(event) {
    if (!isActive()) return;
    event.stopImmediatePropagation();
    if (cursor >= session.length || event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.key === 'Enter' && event.target.closest && event.target.closest('#new-set, #themeToggleBtn, #bin, #clear, #backspace')) return;
    if (event.key === 'Enter') {
      event.preventDefault();
      if (solved) next(); else check();
    } else if (event.key === 'Backspace') {
      event.preventDefault(); backspace();
    } else if (/^[a-z'’]$/i.test(event.key) && letters.includes(event.key.replace(/’/g, "'").toLowerCase())) {
      event.preventDefault(); typeLetter(event.key.replace(/’/g, "'").toLowerCase());
    } else if (current().type === 'missing' && (event.key === 'ArrowRight' || event.key === 'ArrowLeft')) {
      event.preventDefault();
      chooseBox((activeBox + (event.key === 'ArrowRight' ? 1 : input.length - 1)) % input.length);
    }
  }

  function startPOC() {
    widgetRoot = document.getElementById('exercise-widget');
    bindWidget();
$('new-set').addEventListener('click', newSession);

  function updateTheme() {
    $('themeToggleIcon').textContent = document.body.classList.contains('kid-friendly') ? '🧸' : '☀️';
  }
  try {
    const savedTheme = localStorage.getItem('theme-kid-friendly');
    document.body.classList.toggle('kid-friendly', savedTheme === null || savedTheme === 'true');
  } catch { document.body.classList.add('kid-friendly'); }
  updateTheme();
  $('themeToggleBtn').addEventListener('click', () => {
    const enabled = document.body.classList.toggle('kid-friendly');
    try { localStorage.setItem('theme-kid-friendly', String(enabled)); } catch { /* keep theme in memory */ }
    updateTheme();
  });
  window.ExercisePOC = {
    catalog: { missing: MISSING, fix: FIX },
    revealMs: REVEAL_MS,
    studyAdvanceMs: STUDY_ADVANCE_MS,
    getSession: () => session.map(exercise => ({ ...exercise, answers: exercise.answers && [...exercise.answers] })),
    getState: getState
  };
  newSession();
  }
  window.NonSpellingWidget = { mount, destroy, isActive, getState, startPOC };
})();
