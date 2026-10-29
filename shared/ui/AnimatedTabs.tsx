"use client";

import { useLayoutEffect, useRef } from "react";
import styles from "./animated-tabs.module.css";

type Props<T extends string> = {
  items: readonly { id: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  label: string;
  variant?: "underline" | "pills";
};
export function AnimatedTabs<T extends string>({
  items,
  value,
  onChange,
  label,
  variant = "underline",
}: Props<T>) {
  const root = useRef<HTMLDivElement>(null);
  const indicator = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const element = root.current;
    const active = element?.querySelector<HTMLElement>("[aria-pressed=true]");
    if (!element || !active || !indicator.current) return;
    const marker = indicator.current;
    let cancelled = false;
    let cleanup: (() => void) | undefined;
    void import("gsap").then(({ default: gsap }) => {
      if (cancelled) return;
      const update = () => {
        const animation = gsap.to(marker, {
          x: active.offsetLeft,
          width: active.offsetWidth,
          duration: window.matchMedia("(prefers-reduced-motion: reduce)")
            .matches
            ? 0
            : 0.35,
          ease: "power3.out",
          overwrite: true,
        });
        return animation;
      };
      update();
      const observer = new ResizeObserver(update);
      observer.observe(element);
      cleanup = () => {
        observer.disconnect();
        gsap.killTweensOf(marker);
      };
    });
    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, [items, value]);
  return (
    <div
      ref={root}
      role="group"
      aria-label={label}
      className={styles.root}
      data-variant={variant}
    >
      <span ref={indicator} className={styles.indicator} aria-hidden="true" />
      {items.map((item) => (
        <button
          type="button"
          key={item.id}
          aria-pressed={value === item.id}
          onClick={() => onChange(item.id)}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
