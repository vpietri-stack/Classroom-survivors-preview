(function () {
    'use strict';
    const core = window.PreviewNotesState;
    if (!core) return; // A missing optional note asset must not break login.
    let viewer = null, opening = null;
    function enabled() {
        const host = location.hostname;
        return /^\/Classroom-survivors-preview(?:\/|$)/i.test(location.pathname)
            || location.protocol === 'file:' || host === 'localhost' || host === '127.0.0.1';
    }
    const user = () => typeof authActiveUser === 'undefined' ? null : authActiveUser;
    const isStudent = student => student && !['teacher', 'BM', 'admin'].includes(student.role);
    const key = student => 'csPreviewNotes:' + (/Classroom-survivors-preview/i.test(location.pathname) ? 'preview:' : 'local:') + student.id;
    function progress(student) {
        if (!student || !core) return {};
        let cached = {};
        try { cached = JSON.parse(localStorage.getItem(key(student)) || '{}'); } catch (_) {}
        return core.merge(student.previewNotes, cached, core.fromEvents(student.analytics));
    }
    function complete(student, id) { return !!progress(student)[id]; }
    function blocksAdvance(student, page) {
        if (!enabled() || typeof isTestMode !== 'undefined' && isTestMode || !isStudent(student)) return false;
        const note = core.atPage(page);
        return !!note && !complete(student, note.id);
    }
    function close() {
        opening = null;
        if (viewer) { viewer.remove(); viewer = null; }
        document.body.classList.remove('preview-notes-open');
    }
    function shell(title) {
        close();
        const overlay = document.createElement('section'); overlay.id = 'preview-notes-overlay';
        overlay.setAttribute('role', 'dialog'); overlay.setAttribute('aria-modal', 'true'); overlay.setAttribute('aria-label', title);
        const header = document.createElement('header'), heading = document.createElement('h2'), back = document.createElement('button');
        heading.textContent = title; back.textContent = '返回主界面'; back.type = 'button'; back.onclick = close;
        header.append(heading, back); overlay.append(header); document.body.append(overlay);
        document.body.classList.add('preview-notes-open'); viewer = overlay; back.focus();
        return overlay;
    }
    function openNote(id, review) {
        const student = user(), note = core.find(id);
        if (!enabled() || !isStudent(student) || !note) return;
        if (!review && (!core.atPage(student) || core.atPage(student).id !== id)) return;
        if (review && !complete(student, id)) return;
        const overlay = shell(note.title + ' · 预习笔记');
        const request = 'note-' + Date.now() + '-' + Math.random().toString(36).slice(2);
        const frame = document.createElement('iframe'); frame.title = note.title + ' 点读预习'; frame.allow = 'autoplay';
        opening = { id, review, owner: student.id, request, frame };
        const url = new URL(note.reader, location.href);
        url.searchParams.set('embed', '1'); url.searchParams.set('mode', review ? 'review' : 'intro'); url.searchParams.set('request', request);
        url.searchParams.set('v', '4'); frame.src = url.href; overlay.append(frame);
    }
    function openLibrary() {
        const student = user();
        if (!enabled() || !isStudent(student)) return;
        const overlay = shell('预习笔记'), list = document.createElement('div'); list.className = 'preview-notes-library';
        const done = progress(student), current = core.atPage(student);
        const available = core.catalog.filter(note => done[note.id] || current && current.id === note.id);
        if (!available.length) { const message = document.createElement('p'); message.textContent = '完成预习学习后，就能在这里再次查看笔记。'; list.append(message); }
        available.forEach(note => {
            const button = document.createElement('button'); button.type = 'button';
            button.textContent = note.title + (done[note.id] ? ' · 再看一遍' : ' · 开始预习');
            button.onclick = () => openNote(note.id, !!done[note.id]); list.append(button);
        });
        overlay.append(list);
    }
    function onLogin() {
        close(); const student = user(), button = document.getElementById('preview-notes-button');
        const active = enabled() && isStudent(student) && !(typeof isTestMode !== 'undefined' && isTestMode);
        if (button) button.classList.toggle('hidden', !active);
        if (!active) return;
        student.previewNotes = progress(student);
        const note = core.atPage(student);
        if (note && !complete(student, note.id)) openNote(note.id, false);
    }
    function prepareStudy(id) {
        const student = user(), note = core.find(id);
        if (!enabled() || !isStudent(student) || !note || !core.atPage(student) || core.atPage(student).id !== id) return null;
        if (!selectedClassContent || !core.atPage(selectedClassContent) || core.atPage(selectedClassContent).id !== id) return null;
        const content = TEACHING_CONTENT[note.book]?.[note.unit]?.[note.page];
        const words = shuffleArray(Array.from(new Set(content?.vocab || []))).slice(0, 5);
        const exercises = NonSpellingContent.selectPage(note.book, note.unit, note.page, 5);
        if (words.length !== 5 || exercises.length !== 5) { showStudyNotice('这一页的学习内容暂时没有准备好，请稍后再试。'); return null; }
        return { words, exercises, context: { id: note.id, owner: student.id, book: note.book, unit: note.unit, page: note.page, version: note.version } };
    }
    function completeStudy() {
        const student = user(), state = typeof STUDY_STATE === 'undefined' ? null : STUDY_STATE, context = state && state.previewNote;
        if (!context || !student || context.owner !== student.id || !state.active || state.words.length !== 5
            || !state.nonSpellingExercises || state.nonSpellingExercises.length !== 5 || state.currentNonSpellingIndex !== 5) return null;
        const { owner, ...marker } = context;
        return { ...marker, wordCount: 5, exerciseCount: 5 };
    }
    function markComplete(marker) {
        const student = user(); if (!student || !marker) return;
        const event = { type: 'session', sessionType: 'study', timestamp: new Date().toISOString(), data: { previewNote: marker } };
        student.previewNotes = core.merge(progress(student), core.fromEvents([event]));
        try { localStorage.setItem(key(student), JSON.stringify(student.previewNotes)); } catch (_) {}
        if (typeof saveActiveUserToCache === 'function') saveActiveUserToCache();
        if (typeof checkAndAdvancePageIfAllOnCooldown === 'function') checkAndAdvancePageIfAllOnCooldown();
    }
    window.addEventListener('message', event => {
        const current = opening, student = user();
        if (!current || !student || current.owner !== student.id || event.source !== current.frame.contentWindow
            || event.origin !== location.origin || event.data?.request !== current.request) return;
        if (event.data.action === 'close-note') close();
        if (event.data.action === 'start-note-study' && !current.review) {
            if (initStudyMode({ previewNoteId: current.id })) close();
            else current.frame.contentWindow.postMessage({ action: 'note-study-error', request: current.request }, location.origin);
        }
    });
    window.PreviewNotes = { onLogin, close, openLibrary, openNote, blocksAdvance, prepareStudy, completeStudy, markComplete, enabled };
})();
