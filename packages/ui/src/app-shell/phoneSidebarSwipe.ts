export type PhoneSidebarSwipeMode = "open" | "close";

/**
 * Shared threshold decision for the phone sidebar edge gestures (pointer path and the
 * legacy touch path must stay identical). A swipe triggers only when the horizontal
 * movement covers `triggerPx` in the mode's direction AND dominates the vertical
 * movement — tilt rejection so vertical scrolling never toggles the sidebar.
 * "open" swipes to the right (reveal from the left edge), "close" swipes to the left.
 */
export function isPhoneSidebarSwipeTriggered(params: {
  mode: PhoneSidebarSwipeMode;
  deltaX: number;
  deltaY: number;
  triggerPx: number;
}): boolean {
  const { mode, deltaX, deltaY, triggerPx } = params;
  if (Math.abs(deltaX) <= deltaY) {
    return false;
  }
  return mode === "open" ? deltaX >= triggerPx : deltaX <= -triggerPx;
}
