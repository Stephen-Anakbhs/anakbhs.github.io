import { useSyncExternalStore } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";

export const reducedMotion = () => matchMedia(QUERY).matches;

const subscribe = (onChange: () => void) => {
  const query = matchMedia(QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
};

/** Follows the system's reduced-motion setting, including changes while the page is open. */
export const useReducedMotion = () => useSyncExternalStore(subscribe, reducedMotion);
