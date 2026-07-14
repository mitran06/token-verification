"use client";
import { useCallback, useRef, useState } from "react";

// Web Audio chime (no mp3 asset). Browser autoplay policy requires a user
// gesture to start the AudioContext, so the wall exposes an "Enable sound"
// affordance that calls enable().
export function useChime() {
  const ctxRef = useRef<AudioContext | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [muted, setMuted] = useState(false);

  const enable = useCallback(() => {
    if (!ctxRef.current) {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (Ctor) ctxRef.current = new Ctor();
    }
    void ctxRef.current?.resume();
    setEnabled(true);
  }, []);

  const play = useCallback(() => {
    const ctx = ctxRef.current;
    if (!ctx || muted) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = 880;
    const t = ctx.currentTime;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.3, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.4);
  }, [muted]);

  return { enabled, enable, muted, setMuted, play };
}
