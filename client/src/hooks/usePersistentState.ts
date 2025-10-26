import { useEffect, useState, type Dispatch, type SetStateAction } from "react";

type Initializer<T> = T | (() => T);

function resolveInitial<T>(value: Initializer<T>): T {
  return typeof value === "function" ? (value as () => T)() : value;
}

function safeRead<T>(key: string, fallback: Initializer<T>): T {
  if (typeof window === "undefined") {
    return resolveInitial(fallback);
  }
  try {
    const stored = window.localStorage.getItem(key);
    if (stored !== null) {
      return stored as unknown as T;
    }
  } catch {
    // ignore storage errors and fall back
  }
  return resolveInitial(fallback);
}

export function usePersistentState<T>(key: string, initialValue: Initializer<T>): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() => safeRead<T>(key, initialValue));

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    try {
      window.localStorage.setItem(key, String(value));
    } catch {
      // ignore write errors
    }
  }, [key, value]);

  return [value, setValue];
}
