import type { ButtonHTMLAttributes, ReactNode } from "react";
import styles from "./ui.module.css";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  children: ReactNode;
};
export function IconButton({
  label,
  children,
  className = "",
  ...props
}: Props) {
  return (
    <button
      type="button"
      data-motion-button="icon"
      aria-label={label}
      title={label}
      className={`${styles.iconButton} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
