// Generous reading encouragement, not a pronunciation grade.
import {words,normalWord,editDistance,charSimilarity} from './speech_target.js?v=2026-10-28b';
const groups=[['AA','AE','AH','AO','AW','AY','EH','ER','EY','IH','IY','OW','OY','UH','UW'],['DH','F','S','SH','TH','V','Z','ZH'],['B','D','G','K','P','T'],['M','N','NG'],['L','R'],['W','Y'],['CH','JH']].map(x=>new Set(x));
const near=new Set(['B|P','D|T','G|K','F|V','S|Z','SH|ZH','DH|TH','CH|JH','D|N','N|T','B|M','M|P']);
const cost=(a,b)=>a===b?0:near.has([a,b].sort().join('|'))?.5:groups.some(g=>g.has(a)&&g.has(b))?.6:1;
const spokenNumbers=['zero','one','two','three','four','five','six','seven','eight','nine','ten','eleven','twelve','thirteen','fourteen','fifteen','sixteen','seventeen','eighteen','nineteen','twenty'];
export const normalSpokenWord=s=>{const word=normalWord(s);if(!/^\d+$/.test(word))return word;const n=Number(word);return spokenNumbers[n]||({30:'thirty',40:'forty',50:'fifty',60:'sixty',70:'seventy',80:'eighty',90:'ninety',100:'hundred'})[n]||word;};
export function expectedWordSimilarity(target,transcript,lexicon){
 const t=normalSpokenWord(target),heard=words(transcript).map(w=>normalSpokenWord(w.normal)),phones=lexicon[t];let best={phone:0,known:!!phones,char:0,charHeardKnown:false,exact:false,heard:''};
 for(let i=0;i<heard.length;i++){
  const h=heard[i],c=charSimilarity(t,h);if(c>best.char){best.char=c;best.charHeard=h;best.charHeardKnown=!!lexicon[h];}if(h===t)best.exact=true;
  let variants=[[]];for(let length=1;length<=3&&i+length<=heard.length;length++){
   const next=lexicon[heard[i+length-1]];if(!phones||!next)break;variants=variants.flatMap(a=>next.map(b=>[...a,...b])).slice(0,32);
   for(const a of phones)for(const b of variants){const similarity=1-editDistance(a,b,cost)/Math.max(a.length,b.length);if(similarity>best.phone)best={...best,phone:similarity,heard:heard.slice(i,i+length).join(' ')};}
  }
 }
 return best;
}
