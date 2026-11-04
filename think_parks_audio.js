(function (lesson) {
    "use strict";
    const packs = {};
    const pending = {};
    const urls = new Map();

    // Try the local page and the app's persistent, mirror-aware cache in parallel.
    lesson.fetchAsset = (path) => {
        let cache;
        try { cache = parent !== window && parent.AssetCache || window.AssetCache; } catch (_) {}
        const direct = fetch(path).then(response => {
            if (!response.ok) throw new Error('Asset unavailable');
            return response.arrayBuffer();
        });
        if (!cache) return direct;
        const mirrored = cache.getBlobUrl(path).then(url => {
            if (!url) throw new Error('Mirror unavailable');
            return fetch(url).then(response => response.arrayBuffer());
        });
        return new Promise((resolve, reject) => {
            let failures = 0;
            const failed = () => { if (++failures === 2) reject(new Error('Asset unavailable')); };
            direct.then(resolve, failed);
            mirrored.then(resolve, failed);
        });
    };

    lesson.prefetchAudio = (group) => {
        if (packs[group] || pending[group]) return;
        pending[group] = lesson.fetchAsset("think_parks_assets/" + group + ".bin")
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
