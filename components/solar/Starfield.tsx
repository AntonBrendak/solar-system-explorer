// Keep percentage serialization stable across SSR and browser CSS parsing.
function percent(value: number) {
  return `${Number(value.toFixed(4))}%`;
}

const stars = Array.from({ length: 96 }, (_, i) => ({
  id: i,
  left: percent(((((Math.sin(i * 127.1 + 42.3) * 43758.5453) % 1) + 1) % 1) * 100),
  top: percent(((((Math.sin(i * 91.7 + 12.8) * 24634.6345) % 1) + 1) % 1) * 100),
  size: i % 13 === 0 ? 2.5 : i % 4 === 0 ? 1.6 : 1,
  opacity: i % 7 === 0 ? 0.8 : i % 3 === 0 ? 0.52 : 0.25,
  delay: `${(i % 11) * -0.9}s`,
}));

export function Starfield() {
  return (
    <div
      aria-hidden="true"
      className="starfield pointer-events-none absolute inset-0 overflow-hidden"
    >
      <div className="nebula nebula-one" />
      <div className="nebula nebula-two" />
      {stars.map((star) => (
        <span
          key={star.id}
          className="star-point"
          style={{
            left: star.left,
            top: star.top,
            width: star.size,
            height: star.size,
            opacity: star.opacity,
            animationDelay: star.delay,
          }}
        />
      ))}
      <div className="star-grain" />
    </div>
  );
}
