"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import styles from "./time-select.module.css";

type Choice = { value: number; label: string; detail?: string };
type Props = {
  id: string;
  label: string;
  value: number;
  choices: readonly Choice[];
  onChange: (value: number) => void;
};

/** Uses the same top-layer popover pattern as the app's language picker. */
export function TimeSelect({ id, label, value, choices, onChange }: Props) {
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const selected = choices.find((choice) => choice.value === value)!;
  const position = useCallback(() => {
    const rect = trigger.current?.getBoundingClientRect();
    const popup = menu.current;
    if (!rect || !popup) return;
    const below = window.innerHeight - rect.bottom - 12;
    const above = rect.top - 12;
    const upwards = below < 300 && above > below;
    const height = Math.min(360, Math.max(44, upwards ? above : below));
    popup.style.maxHeight = `${height}px`;
    popup.style.width = `${Math.min(320, window.innerWidth - 24)}px`;
    popup.style.left = `${Math.max(12, Math.min(rect.right - 320, window.innerWidth - 332))}px`;
    popup.style.top = upwards ? "auto" : `${rect.bottom + 6}px`;
    popup.style.bottom = upwards
      ? `${window.innerHeight - rect.top + 6}px`
      : "auto";
  }, []);
  const show = () => {
    position();
    menu.current?.showPopover();
    menu.current
      ?.querySelector<HTMLButtonElement>('[aria-selected="true"]')
      ?.focus({ preventScroll: true });
    menu.current
      ?.querySelector<HTMLButtonElement>('[aria-selected="true"]')
      ?.scrollIntoView({ block: "nearest" });
  };
  const close = () => {
    menu.current?.hidePopover();
    trigger.current?.focus({ preventScroll: true });
  };
  useEffect(() => {
    if (!open) return;
    const place = () => position();
    window.addEventListener("resize", place);
    const scroller = trigger.current
      ?.closest("details")
      ?.querySelector("form")?.parentElement;
    scroller?.addEventListener("scroll", place);
    return () => {
      window.removeEventListener("resize", place);
      scroller?.removeEventListener("scroll", place);
    };
  }, [open, position]);

  return (
    <span className={styles.root}>
      <button
        ref={trigger}
        id={id}
        type="button"
        className={styles.trigger}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={`${id}-choices`}
        aria-label={`${label}: ${selected.label}`}
        onClick={() => (open ? close() : show())}
        onKeyDown={(event) => {
          if (["ArrowDown", "ArrowUp"].includes(event.key)) {
            event.preventDefault();
            show();
          }
        }}
      >
        <span>{selected.label}</span>
        <ChevronDown size={14} aria-hidden="true" />
      </button>
      <div
        ref={menu}
        id={`${id}-choices`}
        role="listbox"
        aria-label={label}
        popover="auto"
        className={styles.menu}
        onToggle={(event) =>
          setOpen(event.currentTarget.matches(":popover-open"))
        }
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            close();
            return;
          }
          if (event.key === "Tab") {
            close();
            return;
          }
          if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key))
            return;
          event.preventDefault();
          const buttons = [
            ...(menu.current?.querySelectorAll<HTMLButtonElement>(
              '[role="option"]',
            ) ?? []),
          ];
          const current = buttons.findIndex(
            (button) => button === document.activeElement,
          );
          const index =
            event.key === "Home"
              ? 0
              : event.key === "End"
                ? buttons.length - 1
                : (current +
                    (event.key === "ArrowDown" ? 1 : -1) +
                    buttons.length) %
                  buttons.length;
          buttons[index]?.focus();
        }}
      >
        {choices.map((choice) => (
          <button
            type="button"
            key={choice.value}
            role="option"
            aria-selected={value === choice.value}
            className={styles.option}
            onClick={() => {
              onChange(choice.value);
              close();
            }}
          >
            <span>
              <span>{choice.label}</span>
              {choice.detail && <small>{choice.detail}</small>}
            </span>
            {value === choice.value && <Check size={16} aria-hidden="true" />}
          </button>
        ))}
      </div>
    </span>
  );
}
