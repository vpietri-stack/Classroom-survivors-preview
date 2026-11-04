(function () {
    'use strict';
    const base = 'jasmins_diary_assets/';
    const clip = file => base + file;
    const audioUrls = new Map();
    function audioSource(file) {
        const path = clip(file);
        if (!audioUrls.has(path)) {
            const pending = fetch(path).then(async response => {
                if (!response.ok) throw new Error('Audio unavailable');
                const bytes = await response.arrayBuffer();
                return URL.createObjectURL(new Blob([bytes], { type: 'audio/mpeg' }));
            }).catch(async () => {
                try {
                    const cache = parent !== window && parent.AssetCache || window.AssetCache;
                    const url = await cache?.getBlobUrl(path);
                    if (url) return url;
                } catch (_) {}
                audioUrls.delete(path);
                return path;
            });
            audioUrls.set(path, pending);
        }
        return audioUrls.get(path);
    }
    const words = [
        ['compass', '指南针'],
        ['first aid kit', '急救包'],
        ['torch', '手电筒'],
        ['sun cream', '防晒霜'],
        ['pyramid', '金字塔'],
        ['rainforest', '热带雨林'],
        ['disaster', '突发的糟糕情况'],
        ['find your way', '找到该走的路'],
        ['daytime', '白天'],
        ['solution', '解决办法'],
        ['the sun rises', '太阳升起'],
        ['the sun sets', '太阳落下'],
        ['usual', '平常的'],
        ['metal needle', '金属针'],
        ['rub', '摩擦'],
        ['magnet', '磁铁'],
        ['point north', '指向北方'],
        ['safe', '安全的']
    ].map(([english, chinese]) => {
        const key = english.replaceAll(' ', '-');
        return [english, chinese, key, base + 'illustrations/' + key + '.webp'];
    });
    const parks = [
        ['1 · 登上特波斯特科山', [
            ['Day five in Mexico!', '在墨西哥的第五天！'],
            ['Today was very interesting.', '今天真有意思。'],
            ['We went to visit a pyramid at the top of the Tepozteco Mountain in Morelos.', '我们去参观了莫雷洛斯州特波斯特科山顶的一座金字塔。'],
            ['It was a beautiful walk.', '一路上的景色很美。'],
            ['We went past waterfalls and amazing rainforests!', '我们经过了瀑布和令人惊叹的热带雨林！'],
            ['We walked very far because the pyramid is very high up the mountain.', '我们走了很远，因为金字塔在山上很高的地方。'],
            ['On the way, we saw lots of lizards.', '路上我们看到了很多蜥蜴。'],
            ['We rested at the top of the mountain and we had a picnic.', '我们在山顶休息，还吃了野餐。'],
            ['The view was lovely; we could look down on the beautiful town of Tepoztlan.', '景色很美，我们可以俯瞰美丽的特波斯特兰小镇。'],
            ['Danny took lots of pictures.', '丹尼拍了很多照片。']
        ]],
        ['2 · 指南针坏了', [
            ['When we were preparing to go back down the mountain, disaster happened!', '正当我们准备下山时，糟糕的事发生了！'],
            ['Danny fell and our compass broke.', '丹尼摔倒了，我们的指南针也坏了。'],
            ['Oh no!', '糟了！'],
            ['How could we find our way with no compass?', '没有指南针，我们怎么找到该走的路呢？']
        ]],
        ['3 · 太阳指路', [
            ['We couldn’t look at the stars because it was day time.', '我们没法看星星，因为当时是白天。'],
            ['Danny wanted to make a compass but we didn’t have the right materials.', '丹尼想做一个指南针，可是我们没有合适的材料。'],
            ['Then Mum found the solution.', '后来妈妈找到了办法。'],
            ['The sun was getting lower in the sky.', '太阳在天空中越来越低了。'],
            ['Of course!', '对呀！'],
            ['The sun rises in the east and it sets in the west.', '太阳从东边升起，从西边落下。'],
            ['Now we knew where west was and it was easy to find south.', '现在我们知道西边在哪儿了，也就很容易找到南边。']
        ]],
        ['4 · 安全回到酒店', [
            ['We arrived back at the hotel hot and dirty, but safe.', '我们回到酒店时又热又脏，但大家都平安无事。'],
            ['Mum is now the superhero of the family.', '妈妈现在是我们家的超级英雄。'],
            ['What’s going to happen to us tomorrow?', '明天我们又会遇到什么事呢？']
        ]]
    ];
    const columns = [
        { image: 'diary-tepozteco', alt: '特波斯特科山和山上的金字塔', paragraphs: [0] },
        { image: 'diary-sunset', alt: '太阳落向地平线', paragraphs: [1, 2] },
        { image: 'diary-stars', alt: '夜空中的星星和月亮', paragraphs: [3] }
    ];
    const targets = [
        ['pyramid', 'rainforests'],
        ['disaster', 'compass', 'find our way'],
        ['day time', 'compass', 'solution', 'rises', 'sets'],
        ['safe']
    ];
    window.JasminsDiary = { words, parks, columns, targets, clip, audioSource, wordFile: key => 'vocab-audio/' + key + '.mp3' };
})();
