"use client";

import { useSyncExternalStore } from "react";
import { Moon, SunMedium } from "lucide-react";

/*
 * The `dark` class on <html> is the source of truth (set pre-hydration by the
 * root layout's init script). Subscribe to it directly instead of mirroring it
 * into component state.
 */
function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class"],
  });
  return () => observer.disconnect();
}

function getIsDark() {
  return document.documentElement.classList.contains("dark");
}

// Server snapshot: light is the product default.
function getServerIsDark() {
  return false;
}

/**
 * Flips the `dark` class on <html> and persists the choice in localStorage
 * ("lingua-theme"), which the root layout's init script replays before
 * hydration.
 */
export function ThemeToggle() {
  const isDark = useSyncExternalStore(subscribe, getIsDark, getServerIsDark);

  function toggle() {
    const next = !getIsDark();
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem("lingua-theme", next ? "dark" : "light");
    } catch {
      // Storage unavailable (private mode) — the toggle still works for the session.
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      className="text-muted-foreground flex size-9 items-center justify-center rounded-lg border bg-card transition-colors hover:text-foreground"
    >
      {isDark ? <SunMedium className="size-4" /> : <Moon className="size-4" />}
    </button>
  );
}
