(function (lesson) {
  'use strict';
  let cache;
  try { cache = window.AssetCache || (parent !== window && parent.AssetCache); } catch (_) {}
  const pending = new Map(), packs = new Map(), urls = new Map();
  function asset(path) {
    if (pending.has(path)) return pending.get(path);
    const request = cache ? cache.getBlobUrl(path, { race: true }).then(url => {
      if (!url) throw new Error('Asset unavailable');
      return url;
    }) : Promise.resolve(path);
    pending.set(path, request); request.catch(() => pending.delete(path));
    return request;
  }
  function pack(id) {
    if (!packs.has(id)) {
      const request = asset(lesson.assetBase + 'audio-' + id + '.bin').then(url => fetch(url))
        .then(response => { if (!response.ok) throw new Error('Audio unavailable'); return response.arrayBuffer(); });
      packs.set(id, request); request.catch(() => packs.delete(id));
    }
    return packs.get(id);
  }
  lesson.loadAudio = async id => {
    if (urls.has(id)) return urls.get(id);
    const [group, offset, length] = lesson.clips[id].audioPack;
    const bytes = await pack(group);
    if (offset + length > bytes.byteLength) throw new Error('Incomplete audio');
    const url = URL.createObjectURL(new Blob([bytes.slice(offset, offset + length)], { type: 'audio/mpeg' }));
    urls.set(id, url); return url;
  };
  const observer = 'IntersectionObserver' in window ? new IntersectionObserver(entries => {
    for (const entry of entries) if (entry.isIntersecting) {
      observer.unobserve(entry.target); entry.target.loadLessonAsset();
    }
  }, { rootMargin: '450px' }) : null;
  lesson.loadImage = (image, path, index) => {
    image.loadLessonAsset = () => {
      asset(path).then(url => { image.src = url; }).catch(() => { image.src = path; });
      for (const group of lesson.pages[index].audioPacks) pack(group).catch(() => {});
    };
    if (!index || !observer) image.loadLessonAsset(); else observer.observe(image);
  };
  window.addEventListener('pagehide', () => { if (observer) observer.disconnect(); urls.forEach(url => URL.revokeObjectURL(url)); });
})(window.InteractiveNotesData);