const MARGIN = 8;

/** Horizontal offset of a control's label from the centred position: centred under the control when it fits,
 * otherwise flush with the control's left (or right) edge so it lines up with the control above it; the
 * viewport margin is only a last resort for labels wider than the space beside the control. */
export function tooltipShift(anchor: DOMRect, width: number) {
  const viewport = document.documentElement.clientWidth;
  const centred = anchor.left + anchor.width / 2 - width / 2;
  let left = centred;
  if (centred < MARGIN) left = anchor.left;
  else if (centred + width > viewport - MARGIN) left = anchor.right - width;
  left = Math.min(Math.max(left, MARGIN), viewport - MARGIN - width);
  return left - centred;
}
