"use client";

import { useState, useEffect, useTransition, useCallback } from "react";
import { Search, X } from "lucide-react";

interface AdminSearchInputProps {
  placeholder?: string;
  onSearch: (query: string) => void;
  defaultValue?: string;
  className?: string;
  delayMs?: number;
}

/**
 * High-performance search input for Admin tables and lists.
 * Isolates local input state from the parent page to prevent cascading full-page re-renders on keystroke,
 * and defers heavy list filtering using React 18/19 startTransition to keep INP under 50ms.
 */
export function AdminSearchInput({
  placeholder = "Tìm kiếm...",
  onSearch,
  defaultValue = "",
  className = "",
  delayMs = 250,
}: AdminSearchInputProps) {
  const [value, setValue] = useState(defaultValue);
  const [isPending, startTransition] = useTransition();

  const [prevDefaultValue, setPrevDefaultValue] = useState(defaultValue);
  if (defaultValue !== prevDefaultValue) {
    setPrevDefaultValue(defaultValue);
    setValue(defaultValue);
  }

  useEffect(() => {
    const handler = setTimeout(() => {
      startTransition(() => {
        onSearch(value.trim());
      });
    }, delayMs);

    return () => clearTimeout(handler);
  }, [value, delayMs, onSearch]);

  const handleClear = useCallback(() => {
    setValue("");
    startTransition(() => {
      onSearch("");
    });
  }, [onSearch]);

  return (
    <div className={`relative w-full ${className}`}>
      <Search
        className={`w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 transition-colors pointer-events-none ${
          isPending ? "text-[#FFB98A] animate-pulse" : "text-[#A89B92]"
        }`}
      />
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="w-full pl-9 pr-8 py-2 rounded-2xl border border-[#F0E5D8] text-xs outline-none focus:border-[#FFB98A] bg-[#FFFDF9] transition-colors"
      />
      {value && (
        <button
          type="button"
          onClick={handleClear}
          title="Xóa tìm kiếm"
          aria-label="Xóa nội dung tìm kiếm"
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-0.5 rounded-full hover:bg-gray-100 transition-colors cursor-pointer"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}
