import type gsap from "gsap";

/** DOM-only decoration: never transform the WebGL model or its View element. */
export function createAmbientTimeline(
  root: HTMLElement,
  animation: typeof gsap,
) {
  const select = animation.utils.selector(root);
  const timeline = animation.timeline({ paused: true });
  const animate = (selector: string, values: gsap.TweenVars, start = 0) => {
    const targets = select(selector);
    if (targets.length) timeline.to(targets, values, start);
  };

  animate('[data-motion-logo-orbit="one"]', {
    rotation: "+=360",
    duration: 12,
    repeat: -1,
    ease: "none",
  });
  animate('[data-motion-logo-orbit="two"]', {
    rotation: "-=360",
    duration: 18,
    repeat: -1,
    ease: "none",
  });
  animate("[data-motion-logo-satellite]", {
    offsetDistance: "100%",
    duration: 4.8,
    repeat: -1,
    ease: "none",
  });
  animate("[data-motion-logo-core]", {
    scale: 1.2,
    opacity: 0.7,
    duration: 2,
    repeat: -1,
    yoyo: true,
    ease: "sine.inOut",
  });
  animate('[data-motion-orbit-traveler="one"]', {
    offsetDistance: "100%",
    duration: 14,
    repeat: -1,
    ease: "none",
  });
  animate('[data-motion-orbit-traveler="two"]', {
    offsetDistance: "100%",
    duration: 23,
    repeat: -1,
    ease: "none",
  });
  animate("[data-motion-halo]", {
    scale: 1.12,
    opacity: 0.45,
    duration: 5,
    repeat: -1,
    yoyo: true,
    ease: "sine.inOut",
  });
  animate('[data-motion-nebula="one"]', {
    xPercent: 7,
    yPercent: 5,
    duration: 18,
    repeat: -1,
    yoyo: true,
    ease: "sine.inOut",
  });
  animate('[data-motion-nebula="two"]', {
    xPercent: -6,
    yPercent: -4,
    duration: 23,
    repeat: -1,
    yoyo: true,
    ease: "sine.inOut",
  });
  animate("[data-motion-star]", {
    opacity: 0.18,
    duration: 2.8,
    repeat: -1,
    yoyo: true,
    stagger: { amount: 5 },
    ease: "sine.inOut",
  });
  animate('[data-motion-button="primary"]', {
    "--button-light": 0.2,
    duration: 3.5,
    repeat: -1,
    yoyo: true,
    ease: "sine.inOut",
  });
  return timeline;
}
