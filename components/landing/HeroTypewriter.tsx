"use client";

import { useEffect, useState } from "react";

const PROMPTS = [
  "Répétez après moi : « Bonjour à toutes et à tous. »",
  "Read the passage aloud, then submit your best take.",
  "Décrivez votre week-end en trois phrases.",
];

const HOLD_MS = 2600;

/**
 * Types practice prompts character by character with GitHub's asymmetric
 * blinking cursor (`.lp-cursor`, 0.75s cycle). Respects reduced motion by
 * rendering the first prompt statically.
 */
export function HeroTypewriter() {
  const [text, setText] = useState("");

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const timer = window.setTimeout(() => setText(PROMPTS[0] ?? ""), 0);
      return () => window.clearTimeout(timer);
    }

    let phraseIndex = 0;
    let charIndex = 0;
    let timer: number;

    const tick = () => {
      const phrase = PROMPTS[phraseIndex % PROMPTS.length] ?? "";
      if (charIndex <= phrase.length) {
        setText(phrase.slice(0, charIndex));
        charIndex += 1;
        timer = window.setTimeout(tick, 34 + Math.random() * 46);
      } else {
        phraseIndex += 1;
        charIndex = 0;
        timer = window.setTimeout(tick, HOLD_MS);
      }
    };

    tick();
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <span className="font-mono text-[0.78rem] text-white/72 sm:text-[0.82rem]">
      {text}
      <span className="lp-cursor" aria-hidden />
    </span>
  );
}
