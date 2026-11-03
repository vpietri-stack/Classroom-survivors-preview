(function (root) {
  'use strict';
  const clips = {};
  function clip(id, text, translation, kind = 'sentence') {
    clips[id] = { id, text, translation, kind, audio: 'pu1_u7_p85_assets/audio/' + id + '.mp3' };
  }
  [
    ['now', 'now', '现在', 'word'], ['look', 'Look!', '看！', 'word'], ['listen', 'Listen!', '听！', 'word'],
    ['i-am-riding', 'I am riding a horse.', '我正在骑马。'],
    ['she-is-swimming', 'She is swimming.', '她正在游泳。'],
    ['they-are-cleaning', 'They are cleaning the car.', '他们正在洗车。'],
    ['im', "I'm", 'I am 的缩写', 'word'], ['shes', "She's", 'She is 的缩写', 'word'], ['theyre', "They're", 'They are 的缩写', 'word'],
    ['what-are-you-doing', 'What are you doing?', '你正在做什么？'],
    ['im-riding', "I'm riding a horse.", '我正在骑马。'],
    ['whats-she-doing', "What's she doing?", '她正在做什么？'],
    ['what-is-she-doing', 'What is she doing?', '她正在做什么？'],
    ['shes-swimming', "She's swimming.", '她正在游泳。'],
    ['are-they-cleaning', 'Are they cleaning the car?', '他们正在洗车吗？'],
    ['yes-they-are', 'Yes, they are.', '是的。'],
    ['no-they-arent', "No, they aren't.", '不是。'],
    ['theyre-watering', "They're watering the flowers.", '他们正在浇花。'],
    ['she-isnt-sleeping', "She isn't sleeping.", '她没有在睡觉。'],
    ['shes-reading', "She's reading.", '她正在看书。'],
    ['isnt', "isn't", 'is not 的缩写', 'word'], ['arent', "aren't", 'are not 的缩写', 'word'],
    ['im-not', "I'm not", 'I am not 的缩写', 'phrase'],
    ['shes-swimming-now', "She's swimming now.", '她现在正在游泳。'],
    ['she-swims-every-day', 'She swims every day.', '她每天都游泳。']
  ].forEach(args => clip(...args));
  [['play','玩；踢球'],['playing','正在玩'],['clean','打扫；清洗'],['cleaning','正在打扫；正在清洗'],['read','阅读'],['reading','正在阅读'],
    ['ride','骑'],['riding','正在骑'],['make','制作'],['making','正在制作'],['run','跑'],['running','正在跑'],
    ['swim','游泳'],['swimming','正在游泳'],['sit','坐'],['sitting','正坐着']].forEach(([word, meaning]) => clip(word, word, meaning, 'word'));
  const spot = (clip, rect, kind = 'text') => ({ clip, rect, kind });
  const pages = [
    { title: '什么时候用？怎样组成？', file: '01-when-and-how.png', width: 1055, height: 1491, hotspots: [
      spot('now',[242,342,70,39],'word'), spot('look',[397,342,68,39],'word'), spot('listen',[546,342,85,39],'word'),
      spot('i-am-riding',[16,741,328,303],'picture'), spot('i-am-riding',[52,1050,265,101]),
      spot('she-is-swimming',[370,741,316,303],'picture'), spot('she-is-swimming',[396,1050,263,101]),
      spot('they-are-cleaning',[706,741,326,303],'picture'), spot('they-are-cleaning',[716,1050,315,101]),
      spot('im',[210,1234,76,53],'word'), spot('shes',[557,1234,104,53],'word'), spot('theyre',[905,1234,124,53],'word')
    ] },
    { title: '怎样提问和回答？', file: '02-questions-and-negatives-speakers.png', width: 1055, height: 1491, hotspots: [
      spot('what-are-you-doing',[45,292,255,39]), spot('im-riding',[351,282,143,58]),
      spot('whats-she-doing',[537,294,188,39]), spot('shes-swimming',[749,284,145,66]),
      spot('im-riding',[188,365,311,191],'picture'), spot('shes-swimming',[741,420,286,139],'picture'),
      spot('whats-she-doing',[216,575,294,47]), spot('what-is-she-doing',[553,575,321,47]),
      spot('are-they-cleaning',[48,744,226,61]), spot('yes-they-are',[312,788,164,38]),
      spot('are-they-cleaning',[535,744,230,61]), spot('no-they-arent',[805,777,202,44]),
      spot('they-are-cleaning',[31,913,439,153],'picture'), spot('theyre-watering',[868,876,154,86]),
      spot('theyre-watering',[534,982,317,85],'picture'), spot('she-isnt-sleeping',[481,1227,283,42]), spot('shes-reading',[778,1227,236,42]),
      spot('shes-reading',[96,1186,340,178],'picture'), spot('isnt',[264,1375,80,43],'word'), spot('arent',[574,1375,98,43],'word'), spot('im-not',[863,1375,111,43])
    ] },
    { title: '-ing 拼写与 now / every day', file: '03-ing-and-now-vs-every-day.png', width: 1054, height: 1492, hotspots: [
      spot('play',[61,302,75,39],'word'), spot('playing',[191,302,148,39],'word'), spot('clean',[61,346,87,38],'word'), spot('cleaning',[191,346,155,38],'word'),
      spot('read',[61,389,80,38],'word'), spot('reading',[191,389,151,38],'word'), spot('ride',[391,302,70,39],'word'), spot('riding',[518,302,137,39],'word'),
      spot('make',[388,346,91,38],'word'), spot('making',[518,346,149,38],'word'), spot('run',[728,302,64,39],'word'), spot('running',[840,302,169,39],'word'),
      spot('swim',[707,346,93,38],'word'), spot('swimming',[840,346,191,38],'word'), spot('sit',[741,389,49,38],'word'), spot('sitting',[840,389,155,38],'word'),
      spot('shes-swimming-now',[28,970,481,209],'picture'), spot('shes-swimming-now',[50,1186,450,43]),
      spot('she-swims-every-day',[545,970,478,209],'picture'), spot('she-swims-every-day',[553,1186,466,43])
    ] }
  ];
  const data = { id: 'pu1-u7-p85', book: 'PU1', title: 'Present continuous', label: 'PU1 Unit 7 p.85', assetBase: 'pu1_u7_p85_assets/', pages, clips };
  root.InteractiveNotesData = data;
  if (typeof module !== 'undefined' && module.exports) module.exports = data;
})(typeof window !== 'undefined' ? window : globalThis);
