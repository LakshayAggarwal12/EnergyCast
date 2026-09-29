import { useEffect, useRef } from "react";

/** Calls `fn` every `ms` while `active` is true (and once immediately when it turns active). */
export function usePolling(fn, active, ms = 2500) {
  const saved = useRef(fn);
  saved.current = fn;
  useEffect(() => {
    if (!active) return undefined;
    const id = setInterval(() => saved.current(), ms);
    return () => clearInterval(id);
  }, [active, ms]);
}
