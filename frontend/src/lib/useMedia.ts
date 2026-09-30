/**
 * Viewport queries, as a hook.
 *
 * Deliberately self-contained: the list components need to know "are we on a
 * phone" to swap a table for cards, and that answer has to agree with the CSS
 * breakpoint exactly. One constant, one listener, no context.
 */

import { useEffect, useState } from "react";

/** Same number as the `max-width:760px` blocks in styles/list-mobile.css. */
export const PHONE_QUERY = "(max-width: 760px)";

function matches(query: string): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  try {
    return window.matchMedia(query).matches;
  } catch {
    return false;
  }
}

/** Subscribe to a media query. Returns false where matchMedia is unavailable. */
export function useMedia(query: string): boolean {
  const [on, setOn] = useState(() => matches(query));

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia(query);
    const sync = () => setOn(mq.matches);
    sync();
    /* Safari < 14 only has the deprecated pair. */
    if (typeof mq.addEventListener === "function") {
      mq.addEventListener("change", sync);
      return () => mq.removeEventListener("change", sync);
    }
    mq.addListener(sync);
    return () => mq.removeListener(sync);
  }, [query]);

  return on;
}

/** True below the list screens' phone breakpoint. */
export function useIsPhone(): boolean {
  return useMedia(PHONE_QUERY);
}
