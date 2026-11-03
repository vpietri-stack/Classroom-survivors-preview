"use strict";

const $ = (id) => document.getElementById(id);
const lesson = window.ThinkParks;
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
function playClip(english, chinese, filename) {
    const audio = $("audio");
    const source = lesson.clip(filename);
    $("english").textContent = english;
    $("chinese").textContent = chinese;
    $("player").hidden = false;
    if (audio.getAttribute("src") === source) audio.currentTime = 0;
    else audio.src = source;
    audio.play().catch(() => {});
}

$("dismiss").onclick = () => {
    $("audio").pause();
    $("player").hidden = true;
};

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

for (const [english, chinese, key, image] of lesson.words) {
    const card = button("", () => playClip(english, chinese, "word-" + key + ".mp3"), "card");
    const picture = element("img");
    picture.alt = "";
    picture.loading = "lazy";
    picture.src = image;
    const icon = element("span", "♪", "listen-icon");
    icon.setAttribute("aria-hidden", "true");
    card.append(picture, element("strong", english), element("span", chinese), icon);
    $("cards").append(card);
}
renderArticle(lesson.parks);
