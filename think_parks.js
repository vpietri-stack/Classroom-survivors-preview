"use strict";

const $ = (id) => document.getElementById(id);
const lesson = parent !== window && parent.ThinkParks || window.ThinkParks;
// Coordinates are relative to the 4x crop of the lower part of the source page.
const hotspots = [
    [[[55,49,426]],[[432,49,535],[55,78,583]],[[55,106,593],[55,135,515]]],
    [[[55,204,584],[55,233,587],[55,261,224]],[[229,261,571],[55,290,565]]],
    [[[55,359,583],[55,388,185]],[[190,388,568],[55,416,113]],[[121,416,539]]],
    [[[650,49,1139],[650,78,721]],[[726,78,1140],[650,106,834]],[[839,106,1160],[650,135,730]]],
    [[[650,204,1145],[650,233,1181],[650,261,770]],[[775,261,1057]],[[1061,261,1172],[650,290,910]]],
    [[[650,359,1137],[650,388,861]],[[865,388,1148],[650,416,689]],[[693,416,1178],[650,445,854]],[[859,445,1190]]],
];

function element(tag, text, className) {
    const node = document.createElement(tag);
    if (text) node.textContent = text;
    if (className) node.className = className;
    return node;
}
function button(text, action, className) {
    const node = element("button", text, className);
    node.type = "button";
    node.addEventListener("click", action);
    return node;
}
const embedded = new URLSearchParams(location.search);
if (parent === window || !parent.PreviewNotes?.isReader(window)) {
    location.replace('index.html');
    throw new Error('Open this preview from the notes library.');
}
const request = embedded.get('request');
const review = embedded.get('mode') === 'review';
const action = $('reader-study-start');
action.textContent = review ? '返回主界面' : '开始学习';
action.onclick = () => {
    stop();
    if (!review) action.disabled = true;
    parent.postMessage({ action: review ? 'close-note' : 'start-note-study', request }, location.origin);
};
window.addEventListener('message', event => {
    if (event.source === parent && event.origin === location.origin && event.data?.request === request && event.data.action === 'note-study-error') action.disabled = false;
});
let audio = null, current = null;
function stop() {
    if (audio) { audio.pause(); audio = null; }
    $('stop').disabled = true;
}
function playClip(english, chinese, filename) {
    stop();
    current = { english, chinese, filename };
    window.dispatchEvent(new CustomEvent('notes-select', { detail: { id: filename, text: english } }));
    $('nowPlaying').textContent = english;
    $('playerStatus').textContent = chinese;
    $('stop').disabled = false;
    $('replay').disabled = false;
    audio = new Audio(lesson.clip(filename));
    audio.playbackRate = Number($('speed').value);
    audio.play().catch(() => { $('playerStatus').textContent = '音频正在加载，请再试一次。'; });
}
$('stop').onclick = stop;
$('replay').onclick = () => { if (current) playClip(current.english, current.chinese, current.filename); };
$('speed').onchange = () => { if (audio) audio.playbackRate = Number($('speed').value); };
window.InteractiveNotesPOC = { pause: stop };
function renderArticle(parks) {
    let clip = 0;
    parks.forEach(([, sentences], parkIndex) => {
        sentences.forEach(([english, chinese], sentenceIndex) => {
            const filename = "sentence-" + (++clip) + ".mp3";
            const listen = () => playClip(english, chinese, filename);
            hotspots[parkIndex][sentenceIndex].forEach(([x, y, right], line) => {
                const area = button("", listen, "hotspot");
                area.setAttribute("aria-label", english);
                if (line) area.tabIndex = -1;
                area.style.left = (20 + x / 4) / 340.2 * 100 + "%";
                area.style.top = (325 + y / 4) / 461.52 * 100 + "%";
                area.style.width = (right - x) / 4 / 340.2 * 100 + "%";
                area.style.height = 26 / 4 / 461.52 * 100 + "%";
                $("scan").append(area);
            });
        });
    });
}

lesson.prefetchAudio("words");
const scan = $("scan");
if ("IntersectionObserver" in window) {
    const observer = new IntersectionObserver(entries => {
        if (entries.some(entry => entry.isIntersecting)) {
            lesson.prefetchAudio("sentences");
            observer.disconnect();
        }
    }, { rootMargin: "750px" });
    observer.observe(scan);
} else {
    scan.addEventListener("pointerenter", () => lesson.prefetchAudio("sentences"), { once: true });
}

const imagePacks = new Map();
function loadPicture(picture, image) {
    const part = window.ThinkParksImageIndex[image];
    if (!part) { picture.src = image; return; }
    const [group, offset, length, type] = part;
    if (!imagePacks.has(group)) imagePacks.set(group,
        fetch('think_parks_assets/images-' + group + '.bin?v=1')
            .then(response => { if (!response.ok) throw new Error('Images unavailable'); return response.arrayBuffer(); })
            .catch(() => null));
    imagePacks.get(group).then(pack => {
        picture.src = pack && offset + length <= pack.byteLength
            ? URL.createObjectURL(new Blob([pack.slice(offset, offset + length)], { type })) : image;
    });
}
const imageObserver = 'IntersectionObserver' in window ? new IntersectionObserver(entries => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            imageObserver.unobserve(entry.target);
            loadPicture(entry.target, entry.target.dataset.image);
        }
    });
}, { rootMargin: '500px' }) : null;
for (const [english, chinese, key, image] of lesson.words) {
    const card = button("", () => playClip(english, chinese, "word-" + key + ".mp3"), "card");
    const picture = element("img");
    picture.alt = "";
    picture.loading = "lazy";
    if (imageObserver) { picture.dataset.image = image; imageObserver.observe(picture); }
    else loadPicture(picture, image);
    const icon = element("span", "♪", "listen-icon");
    icon.setAttribute("aria-hidden", "true");
    card.append(picture, element("strong", english), element("span", chinese), icon);
    $("cards").append(card);
}
renderArticle(lesson.parks);

document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); });
