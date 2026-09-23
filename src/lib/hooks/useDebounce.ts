"use client";

import { useState, useEffect } from "react";

/**
 * Custom hook to debounce any fast-changing value (e.g. search input).
 * @param value The raw input value
 * @param delay The delay in milliseconds (default 250ms)
 * @returns The debounced value
 */
export function useDebounce<T>(value: T, delay: number = 250): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}
