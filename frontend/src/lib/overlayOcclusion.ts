const PLAYBACK_CONTROLS_SELECTOR = ".flight-controls";
const ZONE_PADDING_PX = 6;
/** Minimum opacity multiplier when label fully overlaps playback controls. */
const MIN_VISIBILITY = 0.12;

let cachedFrame = -1;
let cachedZone: DOMRect | null = null;

function inflateRect(rect: DOMRect, padding: number): DOMRect {
  return new DOMRect(
    rect.left - padding,
    rect.top - padding,
    rect.width + padding * 2,
    rect.height + padding * 2,
  );
}

function rectOverlapRatio(labelRect: DOMRect, zoneRect: DOMRect): number {
  const overlapLeft = Math.max(labelRect.left, zoneRect.left);
  const overlapRight = Math.min(labelRect.right, zoneRect.right);
  const overlapTop = Math.max(labelRect.top, zoneRect.top);
  const overlapBottom = Math.min(labelRect.bottom, zoneRect.bottom);

  if (overlapRight <= overlapLeft || overlapBottom <= overlapTop) return 0;

  const overlapArea = (overlapRight - overlapLeft) * (overlapBottom - overlapTop);
  const labelArea = Math.max(labelRect.width * labelRect.height, 1);
  return Math.min(1, overlapArea / labelArea);
}

function getPlaybackControlsZone(frame: number): DOMRect | null {
  if (cachedFrame === frame) return cachedZone;
  cachedFrame = frame;

  const el = document.querySelector<HTMLElement>(PLAYBACK_CONTROLS_SELECTOR);
  cachedZone = el ? inflateRect(el.getBoundingClientRect(), ZONE_PADDING_PX) : null;
  return cachedZone;
}

/** Returns 1 when clear, down to MIN_VISIBILITY when fully over playback controls. */
export function getPlaybackControlsOcclusionFactor(element: HTMLElement, frame: number): number {
  const zone = getPlaybackControlsZone(frame);
  if (!zone) return 1;

  const overlap = rectOverlapRatio(element.getBoundingClientRect(), zone);
  if (overlap <= 0) return 1;

  return 1 - overlap * (1 - MIN_VISIBILITY);
}
