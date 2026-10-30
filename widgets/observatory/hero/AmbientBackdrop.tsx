import styles from "./ambient-backdrop.module.css";

// Deterministic positions keep server and client markup identical.
const stars = Array.from({ length: 96 }, (_, index) => ({
  left: `${(100 * ((((Math.sin(index * 127.1 + 42.3) * 43758.5453) % 1) + 1) % 1)).toFixed(4)}%`,
  top: `${(100 * ((((Math.sin(index * 91.7 + 12.8) * 24634.6345) % 1) + 1) % 1)).toFixed(4)}%`,
  size: index % 13 === 0 ? 2.5 : index % 4 === 0 ? 1.6 : 1,
  opacity: index % 7 === 0 ? 0.75 : index % 3 === 0 ? 0.5 : 0.3,
}));

export function AmbientBackdrop() {
  return (
    <div className={styles.backdrop} aria-hidden="true">
      <div className={styles.nebulaOne} data-motion-nebula="one" />
      <div className={styles.nebulaTwo} data-motion-nebula="two" />
      {stars.map((star, index) => (
        <span
          key={index}
          className={styles.star}
          data-motion-star
          style={{
            left: star.left,
            top: star.top,
            width: star.size,
            height: star.size,
            opacity: star.opacity,
          }}
        />
      ))}
    </div>
  );
}
