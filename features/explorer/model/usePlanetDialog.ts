"use client";

import { useLayoutEffect, useRef, type RefObject } from "react";
import type gsap from "gsap";
import type { CardOrigin } from "./useExplorer";

type Options = {
  root: RefObject<HTMLDialogElement | null>;
  panel: RefObject<HTMLDivElement | null>;
  closeButton: RefObject<HTMLButtonElement | null>;
  origin: CardOrigin | null;
  onClose: () => void;
  placeCanvas: (target: HTMLElement | null) => void;
};

export function usePlanetDialog({
  root,
  panel,
  closeButton,
  origin,
  onClose,
  placeCanvas,
}: Options) {
  const closing = useRef(false);
  const motion = useRef<typeof gsap | null>(null);
  const close = () => {
    if (closing.current) return;
    closing.current = true;
    const gsap = motion.current;
    if (
      !gsap ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      onClose();
      return;
    }
    gsap.to(root.current, {
      opacity: 0,
      duration: 0.28,
      ease: "power2.in",
      onComplete: onClose,
    });
    gsap.to(panel.current, { y: 16, duration: 0.28, ease: "power2.in" });
  };

  useLayoutEffect(() => {
    const dialog = root.current;
    const panelElement = panel.current;
    if (!dialog) return;
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    const previousPadding = document.body.style.paddingRight;
    const scrollbar = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = "hidden";
    if (scrollbar) document.body.style.paddingRight = `${scrollbar}px`;
    dialog.showModal();
    placeCanvas(dialog);
    closeButton.current?.focus({ preventScroll: true });
    let context: gsap.Context | undefined;
    let cancelled = false;
    void import("gsap").then(({ default: instance }) => {
      if (cancelled) return;
      motion.current = instance;
      context = instance.context(() => {
        if (window.matchMedia("(prefers-reduced-motion: reduce)").matches)
          return;
        instance.fromTo(dialog, { opacity: 0 }, { opacity: 1, duration: 0.35 });
        const offset = origin
          ? Math.max(-35, Math.min(35, origin.top - window.innerHeight / 2))
          : 20;
        instance.fromTo(
          panel.current,
          { y: offset },
          { y: 0, duration: 0.7, ease: "power3.out", clearProps: "transform" },
        );
      }, dialog);
    });
    return () => {
      cancelled = true;
      context?.revert();
      motion.current?.killTweensOf(dialog);
      motion.current?.killTweensOf(panelElement);
      motion.current = null;
      // Restore the host before the top-layer dialog is detached by React.
      placeCanvas(null);
      dialog.close();
      document.body.style.overflow = previousOverflow;
      document.body.style.paddingRight = previousPadding;
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected)
        previousFocus.focus({ preventScroll: true });
    };
  }, [root, panel, closeButton, origin, placeCanvas]);
  return close;
}
