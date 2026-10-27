import gsap from "gsap";

/** Separate spin layers keep continuous motion independent of hover and entrance transforms. */
export function createAmbientMotion(root: HTMLElement) {
  const select = gsap.utils.selector(root);
  const timeline = gsap.timeline({ paused: true });

  const spin = (selector: string, duration: number) => {
    select(selector).forEach((element, index) => {
      timeline.to(
        element,
        {
          rotation: "+=360",
          duration: duration + index * 5,
          ease: "none",
          repeat: -1,
          transformOrigin: "50% 50%",
        },
        0,
      );
    });
  };

  spin(".planet-spin", 36);
  spin(".feature-spin", 48);
  spin(".picker-planet-wrap img", 60);

  timeline
    .to(
      select(".logo-orbit-one"),
      { rotation: "+=360", duration: 12, repeat: -1, ease: "none" },
      0,
    )
    .to(
      select(".logo-orbit-two"),
      { rotation: "-=360", duration: 18, repeat: -1, ease: "none" },
      0,
    )
    .to(
      select(".logo-satellite"),
      { offsetDistance: "100%", duration: 4.8, repeat: -1, ease: "none" },
      0,
    )
    .to(
      select(".logo-symbol-core"),
      {
        scale: 1.2,
        opacity: 0.7,
        duration: 2,
        repeat: -1,
        yoyo: true,
        ease: "sine.inOut",
      },
      0,
    )
    .to(
      select(".orbit-traveler-one"),
      { offsetDistance: "100%", duration: 14, repeat: -1, ease: "none" },
      0,
    )
    .to(
      select(".orbit-traveler-two"),
      { offsetDistance: "100%", duration: 23, repeat: -1, ease: "none" },
      0,
    )
    .to(
      select(".orbit-traveler-three"),
      { offsetDistance: "100%", duration: 32, repeat: -1, ease: "none" },
      0,
    )
    .to(
      select(".planet-halo"),
      {
        scale: 1.12,
        opacity: 0.45,
        duration: 5,
        repeat: -1,
        yoyo: true,
        ease: "sine.inOut",
      },
      0,
    )
    .to(
      select(".nebula-one"),
      {
        xPercent: 7,
        yPercent: 5,
        duration: 18,
        repeat: -1,
        yoyo: true,
        ease: "sine.inOut",
      },
      0,
    )
    .to(
      select(".nebula-two"),
      {
        xPercent: -6,
        yPercent: -4,
        duration: 23,
        repeat: -1,
        yoyo: true,
        ease: "sine.inOut",
      },
      0,
    )
    .to(
      select(".orbit-node"),
      {
        scale: 1.8,
        opacity: 0.35,
        duration: 2.8,
        repeat: -1,
        yoyo: true,
        stagger: 0.7,
        ease: "sine.inOut",
      },
      0,
    )
    .to(
      select(".hero-period"),
      {
        opacity: 0.5,
        duration: 2.5,
        repeat: -1,
        yoyo: true,
        ease: "sine.inOut",
      },
      0,
    );

  return timeline;
}
