"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Periodically re-runs the server component tree for live pages.
 *
 * Uses router.refresh() rather than a client-side fetch loop, so the refreshed
 * data flows through the same server cache and attribution path as the initial
 * render — one code path, not two.
 *
 * Pauses while the tab is hidden: polling a background tab wastes the upstream
 * rate-limit budget that every other visitor shares.
 */
export function AutoRefresh({ seconds = 45 }: { seconds?: number }) {
  const router = useRouter();

  useEffect(() => {
    if (typeof document === "undefined") return;

    const interval = setInterval(() => {
      if (document.visibilityState === "visible") {
        router.refresh();
      }
    }, seconds * 1000);

    const onVisible = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [router, seconds]);

  return null;
}
