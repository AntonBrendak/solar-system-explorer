"use client";

import { useId, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Check, ChevronDown, Languages } from "lucide-react";
import type { Locale } from "@/i18n/config";
import styles from "./language-picker.module.css";

const choices = [
  { id: "ru", name: "Русский", code: "RU" },
  { id: "en", name: "English", code: "EN" },
] as const;
export function LanguagePicker({
  onChange,
}: {
  onChange: (locale: Locale) => void;
}) {
  const locale = useLocale();
  const t = useTranslations("ui");
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const show = () => {
    const rect = trigger.current?.getBoundingClientRect();
    if (!rect || !menu.current) return;
    menu.current.style.left = `${Math.max(12, Math.min(rect.right - 208, window.innerWidth - 220))}px`;
    menu.current.style.top = `${rect.bottom + 12}px`;
    menu.current.showPopover();
    menu.current
      .querySelector<HTMLButtonElement>(`[data-locale="${locale}"]`)
      ?.focus();
  };
  const select = (next: Locale) => {
    onChange(next);
    menu.current?.hidePopover();
    trigger.current?.focus();
  };
  return (
    <div className={styles.picker}>
      <button
        ref={trigger}
        type="button"
        className={styles.trigger}
        aria-label={t("language")}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => {
          if (open) menu.current?.hidePopover();
          else show();
        }}
        onKeyDown={(event) => {
          if (["ArrowDown", "ArrowUp"].includes(event.key)) {
            event.preventDefault();
            show();
          }
        }}
      >
        <Languages size={15} />
        <span>{locale.toUpperCase()}</span>
        <ChevronDown size={12} className={open ? styles.rotated : ""} />
      </button>
      <div
        ref={menu}
        id={id}
        popover="auto"
        role="listbox"
        aria-label={t("language")}
        className={styles.menu}
        onToggle={(event) =>
          setOpen(event.currentTarget.matches(":popover-open"))
        }
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            menu.current?.hidePopover();
            trigger.current?.focus();
            return;
          }
          const options = [
            ...(menu.current?.querySelectorAll<HTMLButtonElement>(
              "[role=option]",
            ) ?? []),
          ];
          const current = options.findIndex(
            (option) => option === document.activeElement,
          );
          if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
            event.preventDefault();
            const index =
              event.key === "Home"
                ? 0
                : event.key === "End"
                  ? options.length - 1
                  : (current +
                      (event.key === "ArrowDown" ? 1 : -1) +
                      options.length) %
                    options.length;
            options[index]?.focus();
          }
          if (event.key === "Tab") menu.current?.hidePopover();
        }}
      >
        <span className={styles.caption}>{t("language")}</span>
        {choices.map((choice) => (
          <button
            key={choice.id}
            type="button"
            role="option"
            aria-selected={locale === choice.id}
            data-locale={choice.id}
            lang={choice.id}
            onClick={() => select(choice.id)}
          >
            <span>{choice.name}</span>
            <small>{choice.code}</small>
            {locale === choice.id && <Check size={14} />}
          </button>
        ))}
      </div>
    </div>
  );
}
