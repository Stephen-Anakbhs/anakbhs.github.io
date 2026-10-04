import { useCallback, useEffect, useRef } from "react";

// Shared motion for glass sheets that grow out of the element that opened them.
// Everything animates transform/opacity through Web Animations with a sampled
// spring easing, so the compositor runs it even while the main thread is busy.
export type Box = { x: number; y: number; width: number; height: number };

export const boxOf = (element: Element): Box => {
  const rect = element.getBoundingClientRect();
  return { x: rect.left, y: rect.top, width: rect.width, height: rect.height };
};

export const reducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Samples a damped spring (unit mass) into a CSS linear() easing and its settle time. */
export function springTiming(stiffness: number, damping: number) {
  const omega = Math.sqrt(stiffness);
  const zeta = damping / (2 * omega);
  const settle = Math.min(1.2, 7 / (zeta * omega));
  const damped = omega * Math.sqrt(Math.max(1e-6, 1 - zeta * zeta));
  const points: string[] = [];
  const steps = 40;
  for (let i = 0; i <= steps; i++) {
    const t = (settle * i) / steps;
    const decay = Math.exp(-zeta * omega * t);
    const value = zeta < 1
      ? 1 - decay * (Math.cos(damped * t) + ((zeta * omega) / damped) * Math.sin(damped * t))
      : 1 - decay * (1 + omega * t);
    points.push(`${i === steps ? 1 : value.toFixed(4)} ${((100 * i) / steps).toFixed(1)}%`);
  }
  return { easing: `linear(${points.join(", ")})`, duration: Math.round(settle * 1000) };
}

// Open springs past its target a little; close lands firmly (Liquid DOM's menu morph).
export const openMotion = springTiming(240, 24);
export const closeMotion = springTiming(380, 38);

/** Transform that makes an element laid out at `to` (transform-origin 0 0) appear at `from`. */
export const flip = (from: Box, to: Box) =>
  `translate(${from.x - to.x}px, ${from.y - to.y}px) scale(${from.width / to.width}, ${from.height / to.height})`;

/** Where an image of the given size sits inside `frame` with object-fit: contain. */
export function containBox(frame: Box, width: number, height: number): Box {
  const scale = Math.min(frame.width / width, frame.height / height);
  const w = width * scale;
  const h = height * scale;
  return { x: frame.x + (frame.width - w) / 2, y: frame.y + (frame.height - h) / 2, width: w, height: h };
}

/** Starts transform keyframes from the element's current (possibly mid-animation) transform. */
export function currentTransform(element: Element) {
  const value = getComputedStyle(element).transform;
  return value === "none" ? "none" : value;
}

const finished = (animations: Animation[]) => Promise.all(animations.map(a => a.finished.catch(() => undefined)));

/**
 * Lifecycle of a modal glass dialog: open as a modal, hide the source element while
 * the sheet stands in for it, animate out, then reveal the source, close, and return
 * focus (not every browser restores it for modal dialogs).
 */
export function useMorphDialog(onClosed: () => void) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const focusFrame = useRef(0);
  const state = useRef<{ origin?: HTMLElement | null; returnFocus?: HTMLElement | null; closing: boolean; running: Animation[] }>({ closing: false, running: [] });
  const onClosedRef = useRef(onClosed);
  onClosedRef.current = onClosed;

  const show = useCallback((origin: HTMLElement | null | undefined) => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (!dialog.open) {
      state.current.returnFocus = origin?.matches("button, a[href], [tabindex]") ? origin
        : origin?.querySelector<HTMLElement>("button, a[href], [tabindex]")
          ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
      dialog.showModal();
    }
    delete dialog.dataset.settled;
    state.current.origin = origin;
    state.current.closing = false;
    if (origin) origin.style.visibility = "hidden";
  }, []);

  const run = useCallback((animations: Animation[]) => {
    state.current.running = animations;
    return finished(animations);
  }, []);

  const close = useCallback(async (animateOut?: () => Animation[]) => {
    const dialog = dialogRef.current;
    const current = state.current;
    if (!dialog?.open || current.closing) return;
    current.closing = true;
    if (animateOut && !reducedMotion()) {
      const animations = animateOut();
      current.running.forEach(a => a.cancel());
      await run(animations);
    }
    if (current.origin) current.origin.style.visibility = "";
    dialog.close();
  }, [run]);

  const handleClose = useCallback(() => {
    const current = state.current;
    current.running.forEach(a => a.cancel());
    if (current.origin) current.origin.style.visibility = "";
    const target = current.returnFocus;
    state.current = { closing: false, running: [] };
    onClosedRef.current();
    // Native dialog focus cleanup and React's unmount must finish before restoring focus.
    cancelAnimationFrame(focusFrame.current);
    focusFrame.current = requestAnimationFrame(() => {
      if (target?.isConnected && !dialogRef.current?.open) target.focus({ preventScroll: true });
    });
  }, []);

  useEffect(() => () => {
    cancelAnimationFrame(focusFrame.current);
    state.current.running.forEach(animation => animation.cancel());
    if (state.current.origin) state.current.origin.style.visibility = "";
  }, []);

  return { dialogRef, state, show, run, close, handleClose };
}
