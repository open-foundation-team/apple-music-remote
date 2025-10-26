import { useEffect, useState } from "react";
import { normalizeBaseUrl, stripTrailingSlash } from "../utils/network";


export function useAutoDiscovery(baseUrl: string, onDiscovered: (url: string) => void): boolean {
  const [attempted, setAttempted] = useState(false);

  useEffect(() => {
    if (baseUrl || attempted) {
      return;
    }
    setAttempted(true);

    let cancelled = false;
    const candidates = new Set<string>();

    if (typeof window !== "undefined" && window.location.origin.startsWith("http")) {
      candidates.add(stripTrailingSlash(window.location.origin));
      const host = window.location.hostname;
      if (host && host !== "localhost") {
        candidates.add(`http://${host}:8777`);
      }
    }
    candidates.add("http://apple-music-remote.local:8777");

    (async () => {
      for (const candidate of candidates) {
        if (cancelled) {
          return;
        }
        try {
          const base = normalizeBaseUrl(candidate);
          const response = await fetch(`${base}/api/ping`, { method: "GET", mode: "cors" });
          if (!response.ok) {
            continue;
          }
          await response.json();
          if (!cancelled) {
            onDiscovered(base);
          }
          return;
        } catch {
          // try next candidate
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [attempted, baseUrl, onDiscovered]);

  return attempted;
}
