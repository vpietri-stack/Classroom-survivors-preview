(function (root) {
    'use strict';
    const catalog = [{ id: 'pu3-u9-p111', book: 'PU3', unit: '9', page: '111', version: 1,
        title: 'Power Up 3 · Unit 9 · 第111页', reader: 'interactive_notes_poc.html' },
        { id: 'pu1-u7-p85', book: 'PU1', unit: '7', page: '85', version: 1,
        title: 'Power Up 1 · Unit 7 · 第85页', reader: 'pu1_u7_p85_notes.html' },
        { id: 'pu2-u5-p59', book: 'PU2', unit: '5', page: '59', version: 1,
        title: 'Power Up 2 · Unit 5 · 第59页', reader: 'pu2_u5_p59_notes.html' },
        { id: 'pu3-u8-p97', book: 'PU3', unit: '8', page: '97', version: 1,
        title: 'Power Up 3 · Unit 8 · 第97页', reader: 'pu3_u8_p97_notes.html' },
        { id: 'pu3-u3-p35', book: 'PU3', unit: '3', page: '35', version: 1,
        title: 'Power Up 3 · Unit 3 · 第34–35页', reader: 'pu3_u3_p35_notes.html' },
        { id: 'think0-u4-p44', book: 'Think0', unit: '4', page: '44', version: 1,
        title: 'Think Starter · Unit 4 · 第44页', reader: 'think_parks.html', wordCount: 25, exerciseCount: 6 },
        { id: 'pu3-u9-p112', book: 'PU3', unit: '9', page: '112', version: 1,
        title: 'Power Up 3 · Unit 9 · 第112–113页', reader: 'jasmins_diary.html', wordCount: 18, exerciseCount: 4 },
        { id: 'pu2-u1-p14', book: 'PU2', unit: '1', page: '14', version: 1,
        title: 'Power Up 2 · Unit 1 · 第14–15页', reader: 'pu2_race.html', wordCount: 14, exerciseCount: 5 }];
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
                || marker.wordCount !== (note.wordCount || 5) || marker.exerciseCount !== (note.exerciseCount || 5) || !Number.isFinite(Date.parse(event.timestamp))) continue;
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
