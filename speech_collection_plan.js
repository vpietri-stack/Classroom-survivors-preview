// Public prompts only. Recordings and teacher judgements never belong in git.
export const PLAN_ID='word-collection-20261028-v1';
export const PHASES={clear:'1 · Clear readings',brisk:'2 · Naturally quick short words',contrast:'3 · Similar but different words',repeat:'4 · Repeatability check',sentence:'5 · Sentence controls',homophone:'6 · Same-sound spelling controls',soft:'7 · Quiet voice (optional)',mumble:'8 · Mumbled voice (optional)',accent:'9 · Imitated learner pronunciation (optional)',noise:'10 · Non-speech controls'};
export const LABELS=['clear','acceptable','wrong','unclear','no_speech'];
const families=[
 ['the','a','an','to','of','and','has','have','had','is','his','he','it','its','in','on','at','as','us','up'],
 ['bird','beard'],['bed','bad','bud'],['ship','sheep','chip'],['sit','seat'],['bit','beat'],['live','leave'],['pull','pool'],['full','fool'],['pen','pan','pin'],['cap','cup'],['hat','heart'],['cat','cut'],['ball','bowl'],['walk','work'],['rice','lice','right','light','write'],['thin','sin'],['think','sink'],['three','tree'],['this','these'],['then','den','ten'],['fan','van'],['very','wary'],['wet','vet'],['coat','goat'],['pay','bay'],['tie','die'],['sing','thing'],['mouth','mouse'],['watch','wash'],['vest','west'],
 ['spoon','school','square','squirrel','street','spring','strong'],['excited','exciting','excitement'],['bored','boring'],['frightened','frightening'],['interested','interesting'],['tired','tiring'],['surprised','surprising'],['walk','walked','walks'],['play','played','plays'],['want','wanted','wants'],['help','helped','helps'],['watch','watched','watches'],['see','sea'],['two','too'],['night','knight'],
 ['elephant','banana','tomorrow','computer','beautiful','different','important','remember','vegetable','comfortable','chocolate','Wednesday','February','library','usually','temperature','photograph','photography','uncomfortable','responsibility','opportunity','pronunciation']
];
// Unrelated words are independent; genuinely related forms stay together.
const independent=[...families.shift(),...families.pop()];
families.push(...independent.map(w=>[w]),['photograph','photography'],['comfortable','uncomfortable'],['as','has','have','had'],['is','his'],['it','its']);
// Union overlaps: e.g. watch/wash and watch/watched must share a test family.
const parent=new Map();function root(w){if(!parent.has(w))parent.set(w,w);if(parent.get(w)!==w)parent.set(w,root(parent.get(w)));return parent.get(w);}
for(const family of families)for(const word of family)parent.set(root(word),root(family[0]));
const allWords=[...new Set(families.flat())];
const familyOf=w=>allWords.filter(x=>root(x)===root(w)).sort().join('|');
function split(group){let n=2166136261;for(const c of group)n=Math.imul(n^c.charCodeAt(0),16777619)>>>0;return n%5===0?'reserved_word_check':'development';}
const tasks=[];
function add(phase,target,spoken=target,extra={}){const word=extra.focusWord||target,group=phase==='noise'?'non-speech':familyOf(word);tasks.push({id:'wc-'+String(tasks.length+1).padStart(3,'0'),phase,target,spoken,focusWord:word,family:group,split:split(group),...extra});}
for(const word of allWords)add('clear',word);
for(const word of ['the','a','an','to','of','and','has','have','had','is','his','he','it','its','in','on','at','as','us','up','bird','bed','ball','pen','cat','cap','sit','ship','thin','three','two','see'])add('brisk',word);
const contrasts=[['bird','beard'],['bed','bad'],['ship','sheep'],['sit','seat'],['bit','beat'],['live','leave'],['pull','pool'],['full','fool'],['pen','pan'],['cap','cup'],['hat','heart'],['cat','cut'],['ball','bowl'],['walk','work'],['rice','lice'],['right','light'],['thin','sin'],['think','sink'],['three','tree'],['this','these'],['then','den'],['fan','van'],['wet','vet'],['coat','goat'],['mouth','mouse'],['excited','exciting'],['bored','boring'],['frightened','frightening'],['interested','interesting'],['walk','walked'],['play','played'],['want','wanted'],['help','helped'],['watch','watches']];
for(const [a,b] of contrasts){add('contrast',a,b);add('contrast',b,a);}
for(const word of ['the','has','ball','bird','beard','bed','ship','sheep','excited','exciting','comfortable','pronunciation'])add('repeat',word);
for(const [focusWord,sentence] of [['the','The ball is red.'],['has','He has a red bag.'],['ball','This is a ball.'],['bird','I can see a bird.'],['beard','He has a beard.'],['bed','This is my bed.'],['ship','The ship is big.'],['sheep','The sheep is white.'],['excited','I am excited.'],['exciting','The game is exciting.'],['frightening','The thunder is frightening.'],['bored','I am bored.']])add('sentence',sentence,sentence,{focusWord});
for(const [a,b] of [['see','sea'],['two','too'],['right','write'],['night','knight']]){add('homophone',a,b,{equivalentSpellings:[a,b]});add('homophone',b,a,{equivalentSpellings:[a,b]});}
const stress=['the','has','ball','bird','beard','bed','ship','sheep','three','think','school','excited','exciting','comfortable','vegetable','pronunciation'];
for(const phase of ['soft','mumble','accent'])for(const word of stress)add(phase,word);
for(const kind of ['Quiet room: remain silent','Normal room sound: do not speak','One soft finger tap, no speech','A breath, no speech','Soft non-verbal humming'])add('noise','ball','',{noiseInstruction:kind});
export const TASKS=tasks;
export const WORDS=allWords;
export function instructions(t){return {
 clear:'Use your normal clear voice. Say the word once, naturally; do not stretch it. Leave a short pause before and after.',
 brisk:'Say the word once at a normal quick conversational speed. Stop soon after you finish. Do not deliberately clip the word or add extra words.',
 contrast:`The app would expect “${t.target}”. Deliberately say “${t.spoken}” clearly instead. Do not say the expected word.`,
 repeat:'Make a fresh, natural clear take. Do not copy the timing of your earlier recording or play it through the speakers.',
 sentence:'Read the whole sentence naturally. This is a sentence control, paired with its isolated focus word.',
 homophone:`Say “${t.spoken}” naturally. It sounds the same as “${t.target}”. This must not be treated as a pronunciation mistake just because the spelling differs.`,
 soft:'Say the word once softly but audibly. Do not move the microphone or whisper. Judge clarity separately from loudness.',
 mumble:'Deliberately blur or mumble the word once. After playback, label how understandable it actually was.',
 accent:'Optional: imitate a pronunciation pattern you have actually heard from a learner, without exaggerating. Describe what you changed in Notes. This is an adult imitation, not evidence of a child’s natural accent.',
 noise:t.noiseInstruction+'. Record about two seconds.'
 }[t.phase]+(t.spoken==='live'?' Use live as the verb in “I live here”.':'');}
export function suggestedLabel(t){return t.phase==='contrast'?'wrong':t.phase==='mumble'?'unclear':t.phase==='noise'?'no_speech':'clear';}
export function validateRecord(r){
 const t=TASKS.find(t=>t.id===r.taskId);
 if(!t||r.planId!==PLAN_ID||typeof r.id!=='string'||!/^[-a-zA-Z0-9]{8,80}$/.test(r.id))throw Error('Unknown recording or prompt');
 if(r.target!==t.target||r.phase!==t.phase||r.family!==t.family||r.split!==t.split)throw Error('Prompt metadata does not match the recording plan');
 if(!LABELS.includes(r.label)||r.reviewed!==true||typeof r.spoken!=='string'||r.spoken.length>200||typeof r.notes!=='string'||r.notes.length>1000)throw Error('Missing or invalid teacher review');
 if(typeof r.speaker!=='string'||!r.speaker.trim()||r.speaker.length>80||typeof r.device!=='string'||r.device.length>80)throw Error('Invalid speaker or device label');
 if(typeof r.createdAt!=='string'||!Number.isFinite(Date.parse(r.createdAt))||!r.audioStats||!(r.audioStats.seconds>0&&r.audioStats.seconds<=20)||!Number.isFinite(r.audioStats.peak)||r.audioStats.peak<0||r.audioStats.peak>1)throw Error('Invalid recording metadata');
 if(!(r.blob instanceof Blob)||r.blob.size<46||r.blob.size>640044||!/^[0-9a-f]{64}$/.test(r.sha256))throw Error('Invalid recording');
 return t;
}
