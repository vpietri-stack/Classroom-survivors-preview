"use strict";

const $ = (id) => document.getElementById(id);
const assets = "think_parks_assets/";
const newPictures = new Set([
    "public-park", "call-it", "almost", "wide", "at-one-end", "green-space",
    "lovely", "rose-garden", "glass-palace", "iguana", "real-name", "full-of", "get-there",
]);
const clozeTargets = [
    ["public park", "fountains", "call it", "museums"],
    ["Bridge", "almost", "wide", "at one end"],
    ["green space", "lake", "hill", "castle"],
    ["paths", "lovely", "rose garden", "glass palace"],
    ["real name", "iguana", "full of", "iguanas", "friendly", "feed them"],
    ["mountain", "get there", "by cable car", "path", "bridge", "view"],
];
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
function picture(key, className) {
    const node = element("img", "", className);
    node.alt = "";
    node.loading = "lazy";
    node.src = newPictures.has(key) ? assets + key + (key === "get-there" ? ".svg" : ".webp") : "images/vocab/" + key + ".png";
    return node;
}
function shuffle(values) {
    const result = [...values];
    for (let i = result.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
}

function clipUrl(filename) {
    const version = filename.startsWith("word-") ? "3" : "2";
    return assets + filename + "?v=" + version;
}

function playClip(english, chinese, filename) {
    const audio = $("audio");
    const source = clipUrl(filename);
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

function startPractice(words, parks) {
    $("audio").pause();
    $("player").hidden = true;
    const activity = $("activity");
    const promptAudio = new Audio();
    const sets = Array.from({ length: 5 }, (_, i) => words.slice(i * 5, i * 5 + 5));
    function recognition(round, targets = shuffle(sets[round]), index = 0) {
        const [answer, chinese, key] = targets[index];
        promptAudio.src = clipUrl("word-" + key + ".mp3");
        const listen = () => {
            promptAudio.currentTime = 0;
            promptAudio.play().catch(() => {});
        };
        const choices = element("div", "", "choices");
        const status = element("p");
        status.setAttribute("role", "status");
        const next = button("继续", () => {
            promptAudio.pause();
            if (index + 1 < targets.length) recognition(round, targets, index + 1);
            else if (round + 1 < sets.length) recognition(round + 1);
            else cloze(0);
        });
        next.hidden = true;
        for (const [word] of shuffle(sets[round])) {
            choices.append(button(word, () => {
                if (word !== answer) {
                    status.textContent = "再试一次。";
                    return;
                }
                status.textContent = "答对了！";
                for (const choice of choices.children) choice.disabled = true;
                next.hidden = false;
                next.focus();
            }));
        }
        activity.replaceChildren(
            element("h3", "Round A · 第 " + (round + 1) + " / 5 组"),
            element("p", (index + 1) + " / 5 · 听一听，看图和中文，选出对应的英文。"),
            picture(key, "clue"), element("strong", chinese),
            button("再听一次", listen), choices, status, next,
        );
        listen();
    }

    function cloze(index) {
        const [title, sentences] = parks[index];
        const text = sentences.map(([english]) => english).join(" ");
        const targets = clozeTargets[index];
        const pattern = new RegExp("\\b(" + targets.join("|") + ")\\b", "gi");
        const layout = element("div", "", "cloze");
        const paragraph = element("p");
        const bank = element("div", "", "bank");
        const status = element("p");
        status.setAttribute("role", "status");
        const gaps = [];
        let cursor = 0;
        let selected;
        const next = button(index === 5 ? "完成" : "下一段", () => {
            if (index < 5) cloze(index + 1);
            else activity.replaceChildren(element("h3", "全部完成！"), button("再练一次", () => startPractice(words, parks)));
        });
        next.hidden = true;
        for (const match of text.matchAll(pattern)) {
            paragraph.append(text.slice(cursor, match.index));
            const gap = button("___", () => {
                selected?.control.setAttribute("aria-pressed", "false");
                selected = entry;
                gap.setAttribute("aria-pressed", "true");
                status.textContent = "现在从词库选一个词。";
            }, "gap");
            const entry = { answer: match[0], control: gap };
            gap.setAttribute("aria-pressed", "false");
            gap.setAttribute("aria-label", "空格 " + (gaps.length + 1));
            gaps.push(entry);
            paragraph.append(gap);
            cursor = match.index + match[0].length;
        }
        paragraph.append(text.slice(cursor));
        const unique = new Map(gaps.map(({answer}) => [answer.toLowerCase(), answer.toLowerCase() === "iguana" ? "iguana" : answer]));
        for (const [key, word] of shuffle(unique)) {
            const option = button(word, () => {
                if (!selected) {
                    status.textContent = "请先点击一个空格。";
                    return;
                }
                if (key !== selected.answer.toLowerCase()) {
                    status.textContent = "再试一次。";
                    return;
                }
                const { control, answer } = selected;
                control.replaceWith(element("span", answer, "correct"));
                control.disabled = true;
                selected = undefined;
                option.disabled = !gaps.some((gap) => !gap.control.disabled && gap.answer.toLowerCase() === key);
                status.textContent = "答对了！";
                next.hidden = gaps.some((gap) => !gap.control.disabled);
                if (!next.hidden) next.focus();
            });
            bank.append(option);
        }
        layout.append(paragraph, bank);
        activity.replaceChildren(element("h3", "课文填空 · " + (index + 1) + " / 6"), element("strong", title),
            element("p", "先点空格，再从词库选择。"), layout, status, next);
    }
    recognition(0);
}

fetch("think_parks_data.json")
    .then((response) => {
        if (!response.ok) throw new Error(response.status);
        return response.json();
    })
    .then(({ words, parks }) => {
        for (const [english, chinese, key] of words) {
            const card = button("", () => playClip(english, chinese, "word-" + key + ".mp3"), "card");
            const icon = element("span", "♪", "listen-icon");
            icon.setAttribute("aria-hidden", "true");
            card.append(picture(key), element("strong", english), element("span", chinese), icon);
            $("cards").append(card);
        }
        renderArticle(parks);
        $("start").onclick = () => startPractice(words, parks);
    })
    .catch(() => { $("load-error").textContent = "页面内容加载失败，请刷新后重试。"; });
