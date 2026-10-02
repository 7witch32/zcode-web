import { useEffect, useState } from "react";

// Touch-first devices (iPhone/Android Safari). Same query as the mobile focus-zoom
// guard in styles.css. Used to swap hover-only affordances for touch-visible ones and
// to hint that shortcut recording needs a physical (e.g. Bluetooth) keyboard.
export function useIsCoarsePointerDevice(): boolean {
  const [isCoarsePointer, setIsCoarsePointer] = useState(() =>
    typeof window !== "undefined"
      ? window.matchMedia("(hover: none) and (pointer: coarse)").matches
      : false,
  );
  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const query = window.matchMedia("(hover: none) and (pointer: coarse)");
    const onChange = (event: MediaQueryListEvent) => setIsCoarsePointer(event.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);
  return isCoarsePointer;
}
