import { useEffect, useRef, type RefObject } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { createAmbientMotion } from "@/lib/solar-motion";

gsap.registerPlugin(useGSAP);

export function useAmbientMotion(
  rootRef: RefObject<HTMLElement | null>,
  paused: boolean,
) {
  const timelineRef = useRef<gsap.core.Timeline | null>(null);
  const pausedRef = useRef(paused);

  useGSAP(
    () => {
      const root = rootRef.current;
      if (!root) return;
      const media = gsap.matchMedia();
      media.add("(prefers-reduced-motion: no-preference)", () => {
        const timeline = createAmbientMotion(root);
        timelineRef.current = timeline;
        timeline.paused(pausedRef.current || document.hidden);
        return () => {
          timelineRef.current = null;
        };
      });
      const handleVisibility = () =>
        timelineRef.current?.paused(pausedRef.current || document.hidden);
      document.addEventListener("visibilitychange", handleVisibility);
      return () => {
        document.removeEventListener("visibilitychange", handleVisibility);
        media.revert();
      };
    },
    { scope: rootRef },
  );

  useEffect(() => {
    pausedRef.current = paused;
    timelineRef.current?.paused(paused || document.hidden);
  }, [paused]);
}
