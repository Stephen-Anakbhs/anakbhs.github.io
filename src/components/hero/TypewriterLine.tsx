import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";

type TypewriterLineProps = {
  prefix: string;
  words: string[];
};

export function TypewriterLine({ prefix, words }: TypewriterLineProps) {
  const reduceMotion = useReducedMotion();
  const [wordIndex, setWordIndex] = useState(0);
  const [letterIndex, setLetterIndex] = useState(() => (words[0] ?? "").length);
  const [deleting, setDeleting] = useState(false);
  const lineRef = useRef<HTMLSpanElement>(null);
  const [active, setActive] = useState(false);

  useEffect(() => {
    const line = lineRef.current;
    if (!line || reduceMotion) return;
    let inView = false;
    const sync = () => setActive(inView && !document.hidden);
    const observer = new IntersectionObserver(([entry]) => {
      inView = entry.isIntersecting;
      sync();
    });
    observer.observe(line);
    document.addEventListener("visibilitychange", sync);
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", sync);
    };
  }, [reduceMotion]);

  useEffect(() => {
    if (reduceMotion || !active || words.length === 0) return;
    const word = words[wordIndex] ?? "";
    const delay = deleting ? 38 : letterIndex === word.length ? 1800 : 75;

    const timer = window.setTimeout(() => {
      if (deleting) {
        if (letterIndex === 0) {
          setDeleting(false);
          setWordIndex((current) => (current + 1) % words.length);
          return;
        }

        setLetterIndex((current) => Math.max(current - 1, 0));
        return;
      }

      if (letterIndex === word.length) {
        setDeleting(true);
        return;
      }

      setLetterIndex((current) => current + 1);
    }, delay);

    return () => window.clearTimeout(timer);
  }, [deleting, letterIndex, wordIndex, words, reduceMotion, active]);

  const visibleWord = reduceMotion ? words[0] ?? "" : (words[wordIndex] ?? "").slice(0, letterIndex);

  return (
    <span ref={lineRef} className="typewriter-line" aria-label={`${prefix} ${words.join(", ")}`}>
      <span aria-hidden="true">{prefix} <strong>{visibleWord}</strong></span>
      {!reduceMotion && <span className="typing-cursor" aria-hidden="true" />}
    </span>
  );
}
