(function (lesson) {
    "use strict";
    const audio = new Audio();
    const context = { book: "Think0", unit: "4", page: "44" };
    const words = new Map(lesson.words.map(word => [word[0], word]));
    const $ = id => document.getElementById(id);

    function playWord() {
        const word = words.get(currentTTSWord);
        if (!word) return;
        const source = lesson.clip("word-" + word[2] + ".mp3");
        if (audio.getAttribute("src") === source) audio.currentTime = 0;
        else audio.src = source;
        audio.play().catch(() => {});
    }

    function showWord(target) {
        const word = words.get(target);
        const translation = $("roundA-translation");
        const image = $("roundA-image");
        translation.textContent = word ? word[1] : "";
        translation.classList.toggle("hidden", !word);
        image.classList.toggle("hidden", !word);
        if (word) image.src = word[3];
    }

    function start() {
        if (!authActiveUser || isTestMode || (authActiveUser.role && authActiveUser.role !== "student")) {
            showStudyNotice("请先登录学生账号。");
            return;
        }
        lesson.prefetchAudio("words");
        initStudyMode({ parks: true });
    }

    function recognitionComplete() {
        const parks = STUDY_STATE.parks;
        if (parks.set < 4) {
            parks.set++;
            STUDY_STATE.words = lesson.words.slice(parks.set * 5, parks.set * 5 + 5).map(word => word[0]);
            startRoundA();
        } else {
            audio.pause();
            STUDY_STATE.round = "E";
            STUDY_STATE.currentSentenceIndex = 0;
            startExerciseTracking();
            renderCloze();
        }
    }

    function renderCloze() {
        const parks = STUDY_STATE.parks;
        const index = STUDY_STATE.currentSentenceIndex;
        const [heading, sentences] = lesson.parks[index];
        const text = sentences.map(sentence => sentence[0]).join(" ");
        const pattern = new RegExp("\\b(" + lesson.targets[index].join("|") + ")\\b", "gi");
        const matches = Array.from(text.matchAll(pattern));
        const answers = matches.map(match => match[0]);
        if (!parks.slots) {
            parks.slots = answers.map(() => null);
            parks.dock = answers.map((_, i) => i);
            for (let i = parks.dock.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [parks.dock[i], parks.dock[j]] = [parks.dock[j], parks.dock[i]];
            }
            parks.selected = 0;
            parks.verdict = null;
        }

        updateStudyUI("课文填空 · " + (index + 1) + " / 6", "请查看本页的课本第 44 页，填完所有空格后，再点击「检查」。");
        const board = document.createElement("div");
        board.className = "parks-cloze";
        const reader = document.createElement("details");
        reader.open = parks.readerOpen === true;
        reader.addEventListener("toggle", () => {
            if (parks.readerOpen === reader.open) return;
            parks.readerOpen = reader.open;
            if (window.StudyRecovery) StudyRecovery.capture();
        });
        const summary = document.createElement("summary");
        summary.textContent = "查看课本第 44 页";
        const scan = document.createElement("img");
        scan.src = "think_parks_assets/page.webp";
        scan.alt = "Think Starter 课本第 44 页";
        scan.width = 816;
        scan.height = 1108;
        scan.loading = "lazy";
        reader.append(summary, scan);
        const title = document.createElement("h3");
        title.textContent = heading;
        const layout = document.createElement("div");
        layout.className = "parks-cloze-layout";
        const paragraph = document.createElement("p");
        paragraph.lang = "en";
        const dock = document.createElement("div");
        dock.className = "parks-dock";
        dock.setAttribute("aria-label", "词库");
        const check = makeButton("检查", "game-btn bg-green-500 parks-check", () => {
            if (parks.slots.includes(null) || parks.verdict) return;
            parks.verdict = parks.slots.map((tile, slot) => answers[tile].toLowerCase() === answers[slot].toLowerCase());
            const correct = parks.verdict.every(Boolean);
            if (correct) {
                playHappySound();
                queueExerciseEvent("missingWord", "study", { id: "think0-u4-p44-paragraph-" + (index + 1), book: context.book, unit: context.unit, page: context.page,
                    sentences: [text], answers, response: parks.slots.map(tile => answers[tile]) });
            } else {
                synthError();
                incrementExerciseAttempts();
            }
            paint();
            studyLater(correct ? "parks_next" : "parks_reset", correct ? next : reset, correct ? 950 : 1550);
        });
        const feedback = document.createElement("p");
        feedback.setAttribute("role", "status");

        const slots = [];
        let cursor = 0;
        matches.forEach((match, i) => {
            paragraph.append(text.slice(cursor, match.index));
            const slot = makeButton("", "parks-gap", () => {
                if (parks.verdict) return;
                parks.slots[i] = null;
                parks.selected = i;
                paint();
            });
            slots.push(slot);
            paragraph.append(slot);
            cursor = match.index + match[0].length;
        });
        paragraph.append(text.slice(cursor));

        const tiles = parks.dock.map(tile => makeButton(answers[tile], "study-word-tile", () => {
            if (parks.verdict || parks.selected === null || parks.slots.includes(tile)) return;
            parks.slots[parks.selected] = tile;
            const empty = parks.slots.indexOf(null);
            parks.selected = empty === -1 ? null : empty;
            paint();
        }));
        dock.append(...tiles);

        function paint() {
            slots.forEach((slot, i) => {
                const tile = parks.slots[i];
                const answer = tile === null ? "" : answers[tile];
                slot.textContent = answer || "___";
                slot.setAttribute("aria-label", "空格 " + (i + 1) + (answer ? "，" + answer : ""));
                slot.setAttribute("aria-pressed", String(parks.selected === i && !parks.verdict));
                slot.disabled = !!parks.verdict;
                slot.classList.toggle("parks-right", parks.verdict?.[i] === true);
                slot.classList.toggle("parks-wrong", parks.verdict?.[i] === false);
            });
            tiles.forEach((tile, i) => { tile.hidden = parks.slots.includes(parks.dock[i]); });
            check.disabled = !!parks.verdict || parks.slots.includes(null);
            feedback.textContent = parks.verdict ? parks.verdict.every(Boolean) ? "全部答对了！" : "有些答案需要修改。所有词会回到词库，请再试一次。" : "";
        }
        layout.append(paragraph, dock);
        board.append(reader, title, layout, check, feedback);
        $("study-game-area").replaceChildren(board);
        paint();
    }

    function makeButton(text, className, action) {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = text;
        button.className = className;
        button.onclick = action;
        return button;
    }

    function reset() {
        const parks = STUDY_STATE.parks;
        parks.slots.fill(null);
        parks.selected = 0;
        parks.verdict = null;
        renderCloze();
    }

    function next() {
        const parks = STUDY_STATE.parks;
        if (++STUDY_STATE.currentSentenceIndex === lesson.parks.length) {
            finishStudySession();
            return;
        }
        parks.slots = null;
        startExerciseTracking();
        renderCloze();
    }

    function configureMenu() {
        const requested = new URLSearchParams(location.search).get("lesson") === "think-parks";
        $("think-parks-start").classList.toggle("hidden", !requested || !authActiveUser || isTestMode);
        if (requested) lesson.prefetchAudio("words");
    }

    window.ThinkParksStudy = { context, start, configureMenu, recognitionComplete, playWord, showWord,
        renderCloze, reset, next, pause: () => audio.pause() };
})(window.ThinkParks);
