// Isolated experiment helpers. PCM is always mono 16 kHz; no student data leaves the page.
export const RATE = 16000;
export const tokens = text => (String(text).toLowerCase().replace(/’/g, "'").match(/[\p{L}\p{N}]+(?:['\-][\p{L}\p{N}]+)*/gu) || []);
export const matches = (a,b) => tokens(a).join(' ') === tokens(b).join(' ') && tokens(a).length > 0;
export function stats(pcm) {
  let sum=0,peak=0; for(const x of pcm){sum+=x*x;peak=Math.max(peak,Math.abs(x));}
  return {seconds:pcm.length/RATE,peak,rmsDbfs:20*Math.log10(Math.max(1e-12,Math.sqrt(sum/Math.max(1,pcm.length))))};
}
export function resample(pcm, rate) {
  if(rate===RATE)return pcm.slice();
  const out=new Float32Array(Math.round(pcm.length*RATE/rate));
  for(let i=0;i<out.length;i++){const x=i*rate/RATE,j=Math.floor(x);out[i]=pcm[j]*(1-(x-j))+(pcm[Math.min(j+1,pcm.length-1)]||0)*(x-j);}
  return out;
}
export function trimStart(pcm) {
  // Same first-voice-window rule as Recorder.findSpeechStart, at 16 kHz.
  const end=Math.min(pcm.length,RATE*2),win=800;let peak=0;
  for(let i=0;i<end;i++)peak=Math.max(peak,Math.abs(pcm[i]));
  const threshold=Math.max(.015,peak*.12);
  for(let i=0;i<end;i+=win/2){let sum=0;const n=Math.min(i+win,end)-i;for(let j=i;j<i+n;j++)sum+=pcm[j]*pcm[j];if(Math.sqrt(sum/n)>threshold)return pcm.slice(i);}
  return pcm.slice();
}
export function variants(raw) {
  const trimmed=trimStart(raw),padded=new Float32Array(trimmed.length+RATE*.5);padded.set(trimmed,RATE*.25);
  return [
    {id:'current',label:'Whisper · current preparation',audio:trimmed,repeatThresholdSec:1.5},
    {id:'trimmed',label:'Whisper · no repetition',audio:trimmed,repeatThresholdSec:1e-9},
    {id:'padded',label:'Whisper · ¼-second silence at each end',audio:padded,repeatThresholdSec:1e-9},
    {id:'raw',label:'Whisper · keep beginning, no repetition',audio:raw.slice(),repeatThresholdSec:1e-9}
  ];
}
export function wav(pcm){const b=new ArrayBuffer(44+pcm.length*2),v=new DataView(b);const str=(p,s)=>{for(let i=0;i<s.length;i++)v.setUint8(p+i,s.charCodeAt(i));};str(0,'RIFF');v.setUint32(4,b.byteLength-8,true);str(8,'WAVEfmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);v.setUint32(24,RATE,true);v.setUint32(28,RATE*2,true);v.setUint16(32,2,true);v.setUint16(34,16,true);str(36,'data');v.setUint32(40,pcm.length*2,true);for(let i=0;i<pcm.length;i++)v.setInt16(44+i*2,Math.round(Math.max(-1,Math.min(1,pcm[i]))*32767),true);return new Blob([b],{type:'audio/wav'});}
export function snapshot(target,spoken,label,raw,rows){return {schema:'single_word_poc_v1',createdAt:new Date().toISOString(),target,spoken,teacherLabel:label,audio:stats(raw),rows};}
