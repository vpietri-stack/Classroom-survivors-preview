import {resample,wav,stats} from './speech_word_core.js?v=1';
// Preserve untrimmed microphone audio so trimming can be compared later.
export class Capture {
 constructor(){this.cancelled=false;this.parts=[];}
 async start(){if(!navigator.mediaDevices?.getUserMedia)throw Error('Please use HTTPS and allow microphone access.');
  this.stream=await navigator.mediaDevices.getUserMedia({audio:{channelCount:1,echoCancellation:true,noiseSuppression:true}});
  if(this.cancelled){this.close();throw Error('Recording cancelled');}
  this.ctx=new (window.AudioContext||window.webkitAudioContext)();await this.ctx.resume();if(this.cancelled){this.close();throw Error('Recording cancelled');}
  this.rate=this.ctx.sampleRate;this.source=this.ctx.createMediaStreamSource(this.stream);this.node=this.ctx.createScriptProcessor(4096,1,1);this.node.onaudioprocess=e=>{if(!this.cancelled)this.parts.push(e.inputBuffer.getChannelData(0).slice());};this.source.connect(this.node);this.node.connect(this.ctx.destination);
 }
 close(){try{this.source?.disconnect();this.node?.disconnect();}catch(_){}this.stream?.getTracks().forEach(t=>t.stop());this.ctx?.close().catch(()=>{});}
 cancel(){this.cancelled=true;this.close();this.parts=[];}
 stop(){this.cancelled=true;this.close();const n=this.parts.reduce((n,p)=>n+p.length,0),pcm=new Float32Array(n);let offset=0;for(const p of this.parts){pcm.set(p,offset);offset+=p.length;}this.parts=[];const audio=resample(pcm,this.rate).slice(0,320000);if(!audio.length)throw Error('No audio captured. Please try again.');return {blob:wav(audio),audioStats:stats(audio),originalSampleRate:this.rate};}
}
