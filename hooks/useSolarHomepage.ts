import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent,
} from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import { planets } from "@/data/planets";

gsap.registerPlugin(useGSAP, ScrollTrigger);

export function useSolarHomepage() {
  const [selectedIndex, setSelectedIndex] = useState(2);

  const [menuOpen, setMenuOpen] = useState(false);

  const [motionPaused, setMotionPaused] = useState(false);

  const rootRef = useRef<HTMLElement>(null);

  const planetRef = useRef<HTMLDivElement>(null);

  const planetContentRef = useRef<HTMLDivElement>(null);

  const informationRef = useRef<HTMLDivElement>(null);

  const firstSelectionRef = useRef(true);

  const planet = planets[selectedIndex];

  const selectPlanet = useCallback((index: number, returnToHero = false) => {
    setSelectedIndex((index + planets.length) % planets.length);
    if (returnToHero) {
      const reduced = window.matchMedia(
        "(prefers-reduced-motion: reduce)",
      ).matches;
      document
        .getElementById("home")
        ?.scrollIntoView({ behavior: reduced ? "instant" : "smooth" });
    }
  }, []);

  useGSAP(
    () => {
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      const timeline = gsap.timeline({ defaults: { ease: "power3.out" } });
      timeline
        .from("[data-nav]", { autoAlpha: 0, y: -18, duration: 0.8 })
        .from(
          "[data-hero-eyebrow]",
          { autoAlpha: 0, y: 20, duration: 0.7 },
          "-=0.3",
        )
        .from(
          "[data-hero-line]",
          { autoAlpha: 0, y: 67, skewY: 3, stagger: 0.14, duration: 1.05 },
          "-=0.35",
        )
        .from(
          "[data-hero-summary]",
          { autoAlpha: 0, y: 25, duration: 0.8 },
          "-=0.55",
        )
        .from(
          "[data-hero-actions]",
          { autoAlpha: 0, y: 25, duration: 0.8 },
          "-=0.65",
        )
        .from(
          "[data-planet-stage]",
          {
            autoAlpha: 0,
            scale: 0.84,
            rotate: -7,
            duration: 1.5,
            ease: "power2.out",
          },
          0.35,
        )
        .from(
          "[data-hero-nav]",
          { autoAlpha: 0, y: 45, duration: 0.9 },
          "-=0.75",
        )
        .from(
          "[data-side-info]",
          { autoAlpha: 0, x: 20, duration: 0.8 },
          "-=0.55",
        );

      gsap.utils.toArray<HTMLElement>("[data-reveal]").forEach((element) => {
        gsap.from(element, {
          autoAlpha: 0,
          y: 48,
          duration: 0.95,
          ease: "power3.out",
          scrollTrigger: { trigger: element, start: "top 88%", once: true },
        });
      });

      gsap.from(".stat-item", {
        autoAlpha: 0,
        y: 24,
        stagger: 0.12,
        duration: 0.85,
        ease: "power3.out",
        scrollTrigger: {
          trigger: ".experience-stats",
          start: "top 90%",
          once: true,
        },
      });
    },
    { scope: rootRef },
  );

  useEffect(() => {
    if (firstSelectionRef.current) {
      firstSelectionRef.current = false;
      return;
    }
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const anims = [
      gsap.fromTo(
        planetContentRef.current,
        { autoAlpha: 0, scale: 0.86, rotate: -9 },
        {
          autoAlpha: 1,
          scale: 1,
          rotate: 0,
          ease: "power3.out",
          duration: 0.95,
          clearProps: "transform,opacity,visibility",
        },
      ),
      gsap.fromTo(
        informationRef.current,
        { autoAlpha: 0, y: 13 },
        {
          autoAlpha: 1,
          y: 0,
          ease: "power2.out",
          duration: 0.65,
          clearProps: "transform,opacity,visibility",
        },
      ),
    ];
    return () => anims.forEach((animation) => animation.kill());
  }, [selectedIndex]);

  useEffect(() => {
    document.body.style.overflow = menuOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [menuOpen]);

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (
      motionPaused ||
      event.pointerType === "touch" ||
      !planetRef.current ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    )
      return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width - 0.5) * 25;
    const y = ((event.clientY - rect.top) / rect.height - 0.5) * 20;
    gsap.to(planetRef.current, {
      x,
      y,
      duration: 1.2,
      ease: "power2.out",
      overwrite: "auto",
    });
  };

  const handlePointerLeave = () => {
    if (planetRef.current)
      gsap.to(planetRef.current, {
        x: 0,
        y: 0,
        duration: 1.2,
        ease: "power2.out",
      });
  };
  return {
    selectedIndex,
    setSelectedIndex,
    menuOpen,
    setMenuOpen,
    motionPaused,
    setMotionPaused,
    rootRef,
    planetRef,
    planetContentRef,
    informationRef,
    planet,
    selectPlanet,
    handlePointerMove,
    handlePointerLeave,
  };
}

export type SolarHomepageState = ReturnType<typeof useSolarHomepage>;
