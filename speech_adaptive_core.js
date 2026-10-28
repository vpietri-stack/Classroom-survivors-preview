import {featureVector,normalWord,words} from './speech_target.js?v=2026-10-28b';
import {expectedWordSimilarity} from './speech_adaptive_phonetic.js?v=1';
export function compactLexicon(data){
 if(data.schema!==1||data.phones.length!==39||!data.words)throw Error('Invalid phonetic dictionary');
 const alphabet='abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ',cache=new Map();
 return new Proxy(Object.create(null),{get(_target,key){if(typeof key!=='string'||!Object.prototype.hasOwnProperty.call(data.words,key))return undefined;if(cache.has(key))return cache.get(key);const value=data.words[key].map(p=>[...p].map(c=>data.phones[alphabet.indexOf(c)]));cache.set(key,value);if(cache.size>1024)cache.delete(cache.keys().next().value);return value;}});
}
export function binaryProbability(model,x){
 if(x.length!==model.featureNames.length||x.some(v=>!Number.isFinite(v)))return 0;
 let score=model.baseScore;for(const tree of model.trees){let node=tree;while(node.feature!==undefined)node=x[node.feature]<=node.threshold?node.left:node.right;score+=model.learningRate*node.value;}return 1/(1+Math.exp(-Math.max(-40,Math.min(40,score))));
}
export function sentenceFeatures(evidence,vadScores,lexicon){
 const global=evidence.hypothesisScores[0].actual,maximum=Math.max(...vadScores),mean=vadScores.reduce((a,b)=>a+b,0)/vadScores.length,voiced=vadScores.filter(v=>v>=.3).length/vadScores.length,exact=evidence.words.filter(w=>w.normal===normalWord(w.heard)).length/evidence.words.length;
 return evidence.words.map(w=>[...featureVector(w,lexicon),global.meanLogProb,global.eosLogProb,maximum,mean,voiced,exact]);
}
export function decide(evidence,vadScores,lexicon,model,config){
 const target=evidence.hypothesisScores[0],targetWords=words(target.text),speech=Math.max(...vadScores)>=config.vad.thresholdMax,within=evidence.audioStats.seconds>=config.audio.minimumSeconds&&evidence.audioStats.seconds<=config.audio.maximumSeconds;
 if(!speech||!within)return targetWords.map(w=>({text:w.text,heardClear:false,basis:null}));
 if(targetWords.length===1){const rule=config.word,transcript=/^\[.*\]$|^\(.*\)$/.test(evidence.transcript.trim())?'':evidence.transcript,s=expectedWordSimilarity(targetWords[0].text,transcript,lexicon),acoustic=target.gainFullMean>=rule.causalGainFullMeanMinimum&&target.actual.fullMeanLogProb>=rule.causalFullMeanMinimum,spelling=!s.charHeardKnown&&s.char>=rule.unknownWordCharThreshold&&target.actual.fullMeanLogProb>=rule.unknownWordFullMeanMinimum,heard=s.exact||s.phone>=rule.phoneThreshold||acoustic||spelling;return [{text:targetWords[0].text,heardClear:heard,basis:s.exact?'transcript':heard?'target':null}];}
 const features=sentenceFeatures(evidence,vadScores,lexicon);return evidence.words.map((w,i)=>{const heardClear=binaryProbability(model,features[i])>=config.sentence.threshold;return {text:w.text,heardClear,basis:heardClear?'target':null};});
}
