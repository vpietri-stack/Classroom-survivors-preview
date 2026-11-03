(function (lesson) {
    "use strict";
    const packs = {};
    const pending = {};
    const urls = new Map();

    lesson.prefetchAudio = (group) => {
        if (packs[group] || pending[group]) return;
        pending[group] = fetch("think_parks_assets/" + group + ".bin?v=1")
            .then(response => {
                if (!response.ok) throw new Error("Audio pack unavailable");
                return response.arrayBuffer();
            })
            .then(buffer => { packs[group] = buffer; })
            .catch(() => {})
            .finally(() => { delete pending[group]; });
    };

    lesson.clip = (filename) => {
        const group = filename.startsWith("word-") ? "words" : "sentences";
        const range = lesson[group + "Audio"][filename];
        if (packs[group] && range && range[0] + range[1] <= packs[group].byteLength) {
            if (!urls.has(filename)) {
                const [offset, length] = range;
                const clip = packs[group].slice(offset, offset + length);
                urls.set(filename, URL.createObjectURL(new Blob([clip], { type: "audio/mpeg" })));
            }
            return urls.get(filename);
        }
        return "think_parks_assets/" + filename + "?v=" + (group === "words" ? "3" : "2");
    };
})(window.ThinkParks);
