(function (root) {
  'use strict';
  const pair = (id, left, right, note, page, crops) => ({ id, left, right, note, page, crops });
  const example = (word, meaning, sentence, translation, scene) => ({
    id: 'pu3-u9-p111-' + word, word, meaning, sentence, translation, scene,
    audio: 'interactive_notes_assets/audio/' + word + '.mp3'
  });
  const data = {
    id: 'pu3-u9-p111', book: 'PU3', title: 'Feelings: -ing or -ed?',
    pairs: [
      pair('boring',
        example('boring', '无聊的；令人厌烦的', 'The film is boring.', '这部电影很无聊。', '电视里的电影只有一只慢慢爬的蜗牛。'),
        example('bored', '感到无聊的', 'The boy is bored.', '男孩感到很无聊。', '男孩看着同一部电影，托着下巴，觉得无聊。'),
        '电影让人觉得无聊，用 boring；男孩自己感到无聊，用 bored。', '02-boring-and-interesting.webp', [[31,354,475,281], [547,354,477,281]]),
      pair('interesting',
        example('interesting', '有趣的；引起兴趣的', 'The robot is interesting.', '这个机器人很有趣。', '一个小机器人正在用画笔画彩虹。'),
        example('interested', '感兴趣的', 'The girl is interested in the robot.', '女孩对这个机器人很感兴趣。', '女孩专心地看着机器人画彩虹。'),
        'be interested in ... = 对……感兴趣。机器人很有趣；女孩对它感兴趣。', '02-boring-and-interesting.webp', [[31,909,475,276], [547,909,477,276]]),
      pair('frightening',
        example('frightening', '吓人的；令人害怕的', 'The thunder is frightening.', '雷声很吓人。', '窗外正在打雷下雨，女孩待在屋里。'),
        example('frightened', '感到害怕的', 'The girl is frightened.', '女孩感到害怕。', '屋里的女孩抱着玩具熊，感到害怕。'),
        '雷声让人害怕，用 frightening；女孩自己感到害怕，用 frightened。', '03-frightening-and-tiring.webp', [[30,329,475,316], [547,329,477,316]]),
      pair('tiring',
        example('tiring', '累人的；令人疲倦的', 'The long walk is tiring.', '长时间走路很累人。', '男孩背着背包，正沿着很长的公园小路走。'),
        example('tired', '感到疲倦的', 'The boy is tired after the walk.', '走完后，男孩感到很累。', '走完路的男孩坐在长椅上休息，拿着一瓶水。'),
        'tiring 说活动让人累；tired 说自己感到累。', '03-frightening-and-tiring.webp', [[30,925,475,355], [547,925,477,355]]),
      pair('exciting',
        example('exciting', '令人兴奋的', 'The race is exciting.', '这场比赛令人兴奋。', '两名小选手正在冲向终点，比赛很激烈。'),
        example('excited', '感到兴奋的', 'The children are excited.', '孩子们感到很兴奋。', '旁边的两个孩子举起手，兴奋地为选手加油。'),
        'exciting 说比赛令人兴奋；excited 说孩子们感到兴奋。', '04-exciting-and-surprising.webp', [[37,401,477,305], [550,401,478,305]]),
      pair('surprising',
        example('surprising', '令人惊讶的；出人意料的', 'The purple carrot is surprising.', '这根紫色胡萝卜让人惊讶。', '男孩从菜地里拔出了一根真的紫色胡萝卜。'),
        example('surprised', '感到惊讶的', 'The boy is surprised.', '男孩感到很惊讶。', '男孩看着紫色胡萝卜，睁大眼睛，感到惊讶。'),
        'excited = 很期待、很兴奋；surprised = 没想到、很惊讶。', '04-exciting-and-surprising.webp', [[37,975,477,301], [550,975,478,301]])
    ]
  };
  const clips = {};
  data.pairs.forEach(pair => [pair.left, pair.right].forEach(item => {
    clips['word-' + item.word] = { id: 'word-' + item.word, kind: 'word', text: item.word, translation: item.meaning, audio: 'interactive_notes_assets/words/' + item.word + '.mp3' };
    clips['sentence-' + item.word] = { id: 'sentence-' + item.word, kind: 'sentence', text: item.sentence, translation: item.translation, audio: item.audio };
  }));
  const intro = [
    ['puppy', 'The puppy is surprising.', '这只小狗让人惊讶。'],
    ['girl', 'The girl is surprised.', '女孩感到惊讶。'],
    ['boy-boring', 'The boy is boring.', '这个男孩很无趣。'],
    ['boy-bored', 'The boy is bored.', '这个男孩感到无聊。'],
    ['now', 'I am excited now.', '我现在很兴奋。'],
    ['past', 'I was excited yesterday.', '我昨天很兴奋。'],
    ['future', 'I am going to be excited tomorrow.', '我明天会很兴奋。']
  ];
  intro.forEach(([id, text, translation]) => {
    clips['intro-' + id] = { id: 'intro-' + id, kind: 'sentence', text, translation,
      audio: id === 'boy-bored' ? 'interactive_notes_assets/audio/bored.mp3' : 'interactive_notes_assets/audio/intro-' + id + '.mp3' };
  });
  clips['interested-in'] = { id: 'interested-in', kind: 'phrase', text: 'be interested in', translation: '对……感兴趣', audio: 'interactive_notes_assets/audio/interested-in.mp3' };
  const hotspot = (clip, rect, kind = 'text') => ({ clip, rect, kind });
  const introSpots = [
    hotspot('intro-puppy', [24,560,422,224], 'picture'), hotspot('intro-puppy', [25,786,420,45]),
    hotspot('intro-girl', [613,560,420,224], 'picture'), hotspot('intro-girl', [614,786,419,45]),
    hotspot('intro-boy-boring', [20,952,315,188], 'picture'), hotspot('intro-boy-boring', [341,993,201,45]),
    hotspot('intro-boy-bored', [562,952,230,188], 'picture'), hotspot('intro-boy-bored', [797,1011,232,46]),
    hotspot('intro-now', [237,1228,474,49]), hotspot('intro-past', [237,1279,477,49]), hotspot('intro-future', [237,1329,482,49])
  ];
  const coordinates = [
    { words: [[34,221,320,85],[554,221,310,85],[30,781,381,78],[554,781,335,78]], sentences: [[34,648,475,49],[550,648,474,49],[32,1196,477,50],[546,1196,480,50]] },
    { words: [[28,210,337,88],[554,210,383,88],[27,790,262,84],[554,790,246,84]], sentences: [[30,652,475,56],[547,652,480,56],[30,1288,477,60],[545,1288,484,60]] },
    { words: [[34,280,327,110],[554,280,327,110],[30,850,393,86],[553,850,379,86]], sentences: [[35,709,478,55],[549,709,480,55],[33,1283,480,54],[548,1283,479,54]] }
  ];
  data.pages = [{ id: 'intro', title: '语法说明', file: '01-grammar-guide.webp', width: 1054, height: 1493, hotspots: introSpots }];
  for (let page = 0; page < 3; page++) {
    const pairs = data.pairs.slice(page * 2, page * 2 + 2);
    const examples = pairs.flatMap(pair => [pair.left, pair.right]);
    const spots = [];
    examples.forEach((item, index) => {
      spots.push(hotspot('word-' + item.word, coordinates[page].words[index], 'word'));
      spots.push(hotspot('sentence-' + item.word, coordinates[page].sentences[index]));
      spots.push(hotspot('sentence-' + item.word, pairs[Math.floor(index / 2)].crops[index % 2], 'picture'));
    });
    if (page === 0) spots.push(hotspot('interested-in', [29,1320,383,53]), hotspot('sentence-interested', [450,1338,570,48]));
    data.pages.push({ id: 'examples-' + (page + 1), title: pairs.map(p => p.left.word + ' / ' + p.right.word).join(' · '), file: pairs[0].page, width: 1054, height: page === 0 ? 1493 : 1492, hotspots: spots });
  }
  data.clips = clips;
  root.InteractiveNotesData = data;
  if (typeof module !== 'undefined' && module.exports) module.exports = data;
})(typeof window !== 'undefined' ? window : globalThis);
