"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

/* Minimal typings for the Web Speech API (not in lib.dom for all targets). */
interface SpeechRecognitionResultLike { isFinal: boolean; 0: { transcript: string } }
interface SpeechRecognitionEventLike { resultIndex: number; results: ArrayLike<SpeechRecognitionResultLike> }
interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: SpeechRecognitionEventLike) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;
const noopSubscribe = () => () => {};

function getCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: SpeechRecognitionCtor; webkitSpeechRecognition?: SpeechRecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/**
 * Live speech-to-text using the browser's SpeechRecognition (Chrome, Safari,
 * Edge). Exposes `supported` so callers can fall back to typing.
 */
export function useSpeech(opts: { continuous?: boolean; lang?: string } = {}) {
  const supported = useSyncExternalStore(noopSubscribe, () => !!getCtor(), () => false);
  const [listening, setListening] = useState(false);
  const [finalText, setFinalText] = useState("");
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<string | null>(null);
  const rec = useRef<SpeechRecognitionLike | null>(null);
  const wantListening = useRef(false);

  const stop = useCallback(() => {
    wantListening.current = false;
    rec.current?.stop();
    setListening(false);
  }, []);

  const start = useCallback(() => {
    const Ctor = getCtor();
    if (!Ctor) {
      setError("Voice input isn't supported in this browser. You can type instead.");
      return;
    }
    setError(null);
    setInterim("");
    const r = new Ctor();
    r.lang = opts.lang ?? (typeof navigator !== "undefined" ? navigator.language : "en-US");
    r.continuous = opts.continuous ?? true;
    r.interimResults = true;
    r.onresult = (e) => {
      let interimChunk = "";
      let finalChunk = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        if (res.isFinal) finalChunk += res[0].transcript;
        else interimChunk += res[0].transcript;
      }
      if (finalChunk) setFinalText((t) => (t ? `${t} ${finalChunk.trim()}` : finalChunk.trim()));
      setInterim(interimChunk);
    };
    r.onerror = (e) => {
      if (e.error === "no-speech") return;
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        setError("Microphone access was blocked. Allow it in your browser settings, or type instead.");
        wantListening.current = false;
        setListening(false);
      } else if (e.error !== "aborted") {
        setError("Voice input hiccupped. Tap to try again or type instead.");
      }
    };
    r.onend = () => {
      setInterim("");
      // Chrome stops continuous recognition after a silence; restart while the user still wants to talk.
      if (wantListening.current && opts.continuous !== false) {
        try { r.start(); return; } catch { /* fall through */ }
      }
      setListening(false);
    };
    rec.current = r;
    wantListening.current = true;
    try {
      r.start();
      setListening(true);
    } catch {
      setError("Couldn't start the microphone.");
    }
  }, [opts.continuous, opts.lang]);

  const reset = useCallback(() => {
    setFinalText("");
    setInterim("");
    setError(null);
  }, []);

  useEffect(() => () => { wantListening.current = false; rec.current?.abort(); }, []);

  return { supported, listening, text: finalText, interim, error, start, stop, reset, setText: setFinalText };
}
