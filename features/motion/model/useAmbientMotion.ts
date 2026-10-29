"use client";

import { useEffect, useRef, type RefObject } from "react";
import type gsap from "gsap";

/** Scope lifetime, motion preference and visibility are shared by all decorations. */
export function useAmbientMotion(
  rootRef: RefObject<HTMLDivElement | null>,
  paused: boolean,
) {
  const timelineRef = useRef<gsap.core.Timeline | null>(null);
  const pausedRef = useRef(paused);
  useEffect(() => {
    let cancelled = false;
    let cleanup: (() => void) | undefined;
    void Promise.all([import("gsap"), import("./createAmbientTimeline")]).then(
      ([{ default: gsap }, { createAmbientTimeline }]) => {
        if (cancelled) return;
        const setup = () => {
          const root = rootRef.current;
          if (!root) return;
          const media = gsap.matchMedia();
          media.add("(prefers-reduced-motion: no-preference)", () => {
            const timeline = createAmbientTimeline(root, gsap);
            const interaction = gsap.context(() => {}, root);
            timelineRef.current = timeline;
            timeline.paused(pausedRef.current || document.hidden);

            const buttonFor = (target: EventTarget | null) => {
              const button =
                target instanceof Element
                  ? target.closest<HTMLElement>("[data-motion-button]")
                  : null;
              return button && root.contains(button) ? button : null;
            };
            const enter = (event: Event) =>
              interaction.add(() => {
                const button = buttonFor(event.target);
                if (
                  !button ||
                  (event instanceof PointerEvent &&
                    button.contains(event.relatedTarget as Node | null))
                )
                  return;
                gsap.to(button, {
                  "--motion-y": "-3px",
                  "--motion-scale": 1.025,
                  duration: 0.3,
                  ease: "power2.out",
                  overwrite: "auto",
                });
                const icon = button.querySelector<SVGElement>(
                  "[data-motion-button-icon], svg",
                );
                if (icon)
                  gsap.to(icon, {
                    x: 2,
                    y: -1,
                    duration: 0.3,
                    ease: "power2.out",
                    overwrite: "auto",
                  });
                const sheen = button.querySelector<HTMLElement>(
                  "[data-motion-button-sheen]",
                );
                if (sheen)
                  gsap.fromTo(
                    sheen,
                    { xPercent: 0 },
                    {
                      xPercent: 500,
                      duration: 0.8,
                      ease: "power2.out",
                      overwrite: true,
                    },
                  );
              });
            const leave = (event: Event) =>
              interaction.add(() => {
                const button = buttonFor(event.target);
                if (
                  !button ||
                  (event instanceof PointerEvent &&
                    button.contains(event.relatedTarget as Node | null))
                )
                  return;
                if (
                  event.type === "pointerout" &&
                  button.matches(":focus-visible")
                )
                  return;
                if (event.type === "focusout" && button.matches(":hover"))
                  return;
                gsap.to(button, {
                  "--motion-y": "0px",
                  "--motion-scale": 1,
                  duration: 0.4,
                  ease: "power3.out",
                  overwrite: "auto",
                });
                const icon = button.querySelector<SVGElement>(
                  "[data-motion-button-icon], svg",
                );
                if (icon)
                  gsap.to(icon, {
                    x: 0,
                    y: 0,
                    duration: 0.4,
                    ease: "power3.out",
                    overwrite: "auto",
                  });
              });
            // Delegation includes controls mounted later inside the native dialog.
            root.addEventListener("pointerover", enter);
            root.addEventListener("pointerout", leave);
            root.addEventListener("focusin", enter);
            root.addEventListener("focusout", leave);
            return () => {
              root.removeEventListener("pointerover", enter);
              root.removeEventListener("pointerout", leave);
              root.removeEventListener("focusin", enter);
              root.removeEventListener("focusout", leave);
              interaction.revert();
              root
                .querySelectorAll(
                  "[data-motion-button], [data-motion-button] svg, [data-motion-button-sheen]",
                )
                .forEach((element) => {
                  gsap.killTweensOf(element);
                  if (element instanceof HTMLElement) {
                    element.style.removeProperty("--motion-y");
                    element.style.removeProperty("--motion-scale");
                  }
                });
              timelineRef.current = null;
            };
          });
          const sync = () =>
            timelineRef.current?.paused(pausedRef.current || document.hidden);
          document.addEventListener("visibilitychange", sync);
          return () => {
            document.removeEventListener("visibilitychange", sync);
            media.revert();
          };
        };
        cleanup = setup();
      },
    );
    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, [rootRef]);

  useEffect(() => {
    pausedRef.current = paused;
    timelineRef.current?.paused(paused || document.hidden);
  }, [paused]);
}
