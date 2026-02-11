"use client";

import { useCallback, useRef } from "react";

export function useClickGuard(cooldownMs = 800) {
  const lastRef = useRef(0);
  return useCallback(() => {
    const now = Date.now();
    if (now - lastRef.current < cooldownMs) return false;
    lastRef.current = now;
    return true;
  }, [cooldownMs]);
}
