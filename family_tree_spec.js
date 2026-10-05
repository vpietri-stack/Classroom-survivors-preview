// family_tree_spec.js — geometry + highlights for the PU3 family-tree set.
// Regenerate with:
//   node extract_tiles.js vibe_images/fam_tier1_*.png tmp/tiles/gp 4
//   node extract_tiles.js vibe_images/fam_tier2_*.png tmp/tiles/ad 4
//   node extract_tiles.js vibe_images/fam_tier3a_*.png tmp/tiles/k1 2
//   node extract_tiles.js vibe_images/fam_tier3b_*.png tmp/tiles/k2 2 --bands "0.02,0.47;0.53,0.98"
//   node build_family_tree.js family_tree_spec.js images/vocab
// Feet lines, not centres: cy is where each figure STANDS, fh is its height as
// a fraction of the canvas, so the children read as smaller than the adults.

const X = [0.165, 0.375, 0.625, 0.835];
const T1 = { cy: 0.26, fh: 0.215 };
const T2 = { cy: 0.585, fh: 0.25 };
const T3 = { cy: 0.86, fh: 0.20 };

const m = (tile, i, T) => ({ tile, cx: X[i], cy: T.cy, fh: T.fh });

// junction x for each couple, and the y of the horizontal "bus" that carries
// the descent line to their children
const L = 0.27, R = 0.73;
const BAR1 = T1.cy - T1.fh * 0.55;   // must match the compositor's bar height
const BAR2 = T2.cy - T2.fh * 0.55;
const BUS1 = 0.30, BUS2 = 0.62;
const HEAD2 = T2.cy - T2.fh;         // top of a tier-2 head
const HEAD3 = T3.cy - T3.fh;

const toMum  = [[L, BAR1], [L, BUS1], [X[0], BUS1], [X[0], HEAD2]];
const toDad  = [[R, BAR1], [R, BUS1], [X[1], BUS1], [X[1], HEAD2]];
const toAunt = [[R, BAR1], [R, BUS1], [X[2], BUS1], [X[2], HEAD2]];
const toSon       = [[L, BAR2], [L, BUS2], [X[0], BUS2], [X[0], HEAD3]];
const toDaughter  = [[L, BAR2], [L, BUS2], [X[1], BUS2], [X[1], HEAD3]];
const toCousinBoy = [[R, BAR2], [R, BUS2], [X[2], BUS2], [X[2], HEAD3]];
const toCousinGirl= [[R, BAR2], [R, BUS2], [X[3], BUS2], [X[3], HEAD3]];

module.exports = {
  SIZE: 2048,
  tileRoot: 'tmp/tiles',
  members: {
    gp1: m('gp/tile-1.png', 0, T1),   // maternal grandma  (purple cardigan)
    gp2: m('gp/tile-2.png', 1, T1),   // maternal grandpa  (brown jacket)
    gp3: m('gp/tile-3.png', 2, T1),   // paternal grandma  (mustard cardigan)
    gp4: m('gp/tile-4.png', 3, T1),   // paternal grandpa  (red waistcoat)
    mum:     m('ad/tile-1.png', 0, T2),
    dad:     m('ad/tile-2.png', 1, T2),
    aunt:    m('ad/tile-3.png', 2, T2),   // dad's sister
    uncle:   m('ad/tile-4.png', 3, T2),   // her husband
    son:        m('k1/tile-1.png', 0, T3),
    daughter:   m('k1/tile-2.png', 1, T3),
    cousinBoy:  m('k2/tile-1.png', 2, T3),
    cousinGirl: m('k2/tile-2.png', 3, T3),
  },
  couples: [
    { a: 'gp1', b: 'gp2' }, { a: 'gp3', b: 'gp4' },
    { a: 'mum', b: 'dad' }, { a: 'aunt', b: 'uncle' },
  ],
  structure: [
    toMum, toDad, [[X[2], BUS1], [X[2], HEAD2]],
    toSon, toDaughter, toCousinBoy, toCousinGirl,
  ],
  // Each variant is CROPPED to the branch that carries the word. The tree is
  // identical in every file — same figures, same grey structure — but a 12-
  // person tree is unreadable at the 80-140px .vocab-image actually renders
  // at, so the frame closes in on the four or five people the word is about.
  variants: [
    { file: 'son.png', focus: ['mum', 'dad', 'son'],
      rings: ['son'], paths: [toSon] },
    { file: 'daughter.png', focus: ['mum', 'dad', 'daughter'],
      rings: ['daughter'], paths: [toDaughter] },
    { file: 'parents.png', focus: ['mum', 'dad', 'son', 'daughter'],
      brackets: [['mum', 'dad']], paths: [toSon, toDaughter] },
    { file: 'grandparents.png', focus: ['gp1', 'gp2', 'mum', 'dad', 'son', 'daughter'],
      brackets: [['gp1', 'gp2']], paths: [toMum, toSon, toDaughter] },
    { file: 'grandson.png', focus: ['gp1', 'gp2', 'mum', 'dad', 'son'],
      rings: ['son'], paths: [toMum, toSon] },
    { file: 'granddaughter.png', focus: ['gp1', 'gp2', 'mum', 'dad', 'daughter'],
      rings: ['daughter'], paths: [toMum, toDaughter] },
    { file: 'aunt.png', focus: ['gp3', 'gp4', 'mum', 'dad', 'aunt', 'uncle', 'son', 'daughter'],
      rings: ['aunt'], paths: [toDad, toAunt, toSon, toDaughter] },
    { file: 'uncle.png', focus: ['gp3', 'gp4', 'mum', 'dad', 'aunt', 'uncle', 'son', 'daughter'],
      rings: ['uncle'], paths: [toDad, toAunt, toSon, toDaughter] },
    { file: 'cousin.png', focus: ['gp3', 'gp4', 'mum', 'dad', 'aunt', 'uncle', 'son', 'cousinBoy'],
      rings: ['son', 'cousinBoy'],
      ties: [[[X[0], 0.878], [X[0], 0.952], [X[2], 0.952], [X[2], 0.878]]],
      paths: [toDad, toAunt, toSon, toCousinBoy] },
  ],
};
