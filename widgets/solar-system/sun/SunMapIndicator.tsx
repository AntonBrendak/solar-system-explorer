"use client";

import type { ComponentProps } from "react";
import styles from "../planet-marker.module.css";

/** Ordinary DOM button: its lifetime belongs to the page, never to a Drei Html root. */
export function SunMapIndicator({
  children,
  ...props
}: ComponentProps<"button">) {
  return (
    <button type="button" className={styles.marker} {...props}>
      {children}
    </button>
  );
}
