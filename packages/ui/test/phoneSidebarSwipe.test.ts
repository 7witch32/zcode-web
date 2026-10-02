import assert from "node:assert/strict";
import test from "node:test";
import { isPhoneSidebarSwipeTriggered } from "../src/app-shell/phoneSidebarSwipe.ts";

const TRIGGER = 48;

test("open mode triggers on a rightward swipe past the trigger distance", () => {
  assert.equal(
    isPhoneSidebarSwipeTriggered({ mode: "open", deltaX: 48, deltaY: 0, triggerPx: TRIGGER }),
    true,
  );
  assert.equal(
    isPhoneSidebarSwipeTriggered({ mode: "open", deltaX: 120, deltaY: 10, triggerPx: TRIGGER }),
    true,
  );
  assert.equal(
    isPhoneSidebarSwipeTriggered({ mode: "open", deltaX: 47, deltaY: 0, triggerPx: TRIGGER }),
    false,
  );
});

test("close mode triggers on a leftward swipe past the trigger distance", () => {
  assert.equal(
    isPhoneSidebarSwipeTriggered({ mode: "close", deltaX: -48, deltaY: 0, triggerPx: TRIGGER }),
    true,
  );
  assert.equal(
    isPhoneSidebarSwipeTriggered({ mode: "close", deltaX: -120, deltaY: 10, triggerPx: TRIGGER }),
    true,
  );
  assert.equal(
    isPhoneSidebarSwipeTriggered({ mode: "close", deltaX: -47, deltaY: 0, triggerPx: TRIGGER }),
    false,
  );
  // A rightward swipe must never trigger the close gesture.
  assert.equal(
    isPhoneSidebarSwipeTriggered({ mode: "close", deltaX: 120, deltaY: 0, triggerPx: TRIGGER }),
    false,
  );
});

test("vertical movement dominates: tilt rejection keeps scrolling from toggling", () => {
  // Pure vertical scroll.
  assert.equal(
    isPhoneSidebarSwipeTriggered({ mode: "open", deltaX: 0, deltaY: 200, triggerPx: TRIGGER }),
    false,
  );
  // 45° diagonal: horizontal no longer strictly dominates vertical.
  assert.equal(
    isPhoneSidebarSwipeTriggered({ mode: "open", deltaX: 48, deltaY: 48, triggerPx: TRIGGER }),
    false,
  );
  assert.equal(
    isPhoneSidebarSwipeTriggered({ mode: "close", deltaX: -60, deltaY: 59, triggerPx: TRIGGER }),
    true,
  );
});
