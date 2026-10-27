(function (root) {
    'use strict';
    const catalog = [{ id: 'pu3-u9-p111', book: 'PU3', unit: '9', page: '111', version: 1,
        title: 'Power Up 3 · Unit 9 · 第111页', reader: 'interactive_notes_poc.html' }];
    const find = id => catalog.find(note => note.id === id);
    const atPage = page => page && catalog.find(note => note.book === page.book && note.unit === String(page.unit) && note.page === String(page.page));
    function normalize(value) {
        const result = {};
        for (const note of catalog) {
            const entry = value && value[note.id];
            if (entry && entry.version === note.version && Number.isFinite(Date.parse(entry.completedAt)))
                result[note.id] = { version: note.version, completedAt: new Date(entry.completedAt).toISOString() };
        }
        return result;
    }
    function fromEvents(events) {
        const result = {};
        for (const event of Array.isArray(events) ? events : []) {
            const marker = event && event.data && event.data.previewNote, note = marker && find(marker.id);
            if (!note || event.type !== 'session' || event.sessionType !== 'study' || marker.version !== note.version
                || marker.book !== note.book || String(marker.unit) !== note.unit || String(marker.page) !== note.page
                || marker.wordCount !== 5 || marker.exerciseCount !== 5 || !Number.isFinite(Date.parse(event.timestamp))) continue;
            const completedAt = new Date(event.timestamp).toISOString();
            if (!result[note.id] || completedAt < result[note.id].completedAt) result[note.id] = { version: note.version, completedAt };
        }
        return result;
    }
    function merge(...sources) {
        const result = {};
        for (const source of sources) for (const [id, entry] of Object.entries(normalize(source)))
            if (!result[id] || entry.completedAt < result[id].completedAt) result[id] = entry;
        return result;
    }
    function apply(user, events) {
        const progress = merge(user.previewNotes, fromEvents(events));
        if (Object.keys(progress).length) user.previewNotes = progress;
        return progress;
    }
    const api = { catalog, find, atPage, normalize, fromEvents, merge, apply };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.PreviewNotesState = api;
})(typeof window !== 'undefined' ? window : globalThis);
