import { useEffect, useRef, useState } from 'react';
interface Recognition {
  lang:string; interimResults:boolean; continuous:boolean;
  onresult:((event:{results:ArrayLike<ArrayLike<{transcript:string}>>})=>void)|null;
  onerror:((event:{error:string})=>void)|null; onend:(()=>void)|null; start():void; stop():void; abort():void;
}
type VoiceWindow = Window & { SpeechRecognition?:new()=>Recognition; webkitSpeechRecognition?:new()=>Recognition; };
export function useVoice(language:string, muted:boolean,onTranscript:(text:string)=>void) {
  const [listening,setListening] = useState(false); const [speaking,setSpeaking] = useState(false); const [error,setError] = useState('');
  const recognition = useRef<Recognition|null>(null); const callback = useRef(onTranscript); callback.current = onTranscript;
  const recognitionCtor = (window as VoiceWindow).SpeechRecognition || (window as VoiceWindow).webkitSpeechRecognition;
  const speechSupported = 'speechSynthesis' in window;
  function stopSpeaking() { window.speechSynthesis?.cancel(); setSpeaking(false); }
  function stopListening() { recognition.current?.stop(); setListening(false); }
  function startListening() {
    if (!recognitionCtor) { setError('Speech recognition is unavailable in this browser. You can type your message.'); return; }
    stopSpeaking(); setError(''); recognition.current?.abort();
    const rec = new recognitionCtor(); rec.lang = language; rec.interimResults = false; rec.continuous = false;
    rec.onresult = e => { const transcript = Array.from(e.results).map(r=>r[0].transcript).join(' '); callback.current(transcript); };
    rec.onerror = e => { setListening(false); setError(e.error === 'not-allowed' || e.error === 'service-not-allowed' ? 'Microphone permission was denied. Allow it in your browser settings, or type instead.' : e.error === 'no-speech' ? 'No speech was detected. Try again or type your message.' : 'Voice recognition could not connect. Please type or try again.'); };
    rec.onend = () => { if (recognition.current === rec) { setListening(false); recognition.current = null; } }; recognition.current = rec;
    try { rec.start(); setListening(true); } catch { setError('Could not start the microphone. Please try again.'); }
  }
  function speak(text:string) {
    if (!speechSupported) { setError('Read aloud is unavailable in this browser.'); return; }
    if (muted) { setError('Read aloud is muted. Change this in Settings.'); return; }
    stopListening(); stopSpeaking(); setError(''); const utterance = new SpeechSynthesisUtterance(text.replace(/[#*_`]/g,'').slice(0,20000)); utterance.lang = language;
    const voice = window.speechSynthesis.getVoices().find(v=>v.lang.toLowerCase().startsWith(language.slice(0,2))); if (voice) utterance.voice = voice;
    utterance.onend = () => setSpeaking(false); utterance.onerror = () => setSpeaking(false); setSpeaking(true); window.speechSynthesis.speak(utterance);
  }
  useEffect(()=>()=>{ recognition.current?.abort(); window.speechSynthesis?.cancel(); },[]);
  useEffect(()=>{ recognition.current?.abort(); setListening(false); window.speechSynthesis?.cancel(); setSpeaking(false); },[language,muted]);
  return {listening,speaking,error,recognitionSupported:!!recognitionCtor,speechSupported,startListening,stopListening,speak,stopSpeaking,clearError:()=>setError('')};
}
