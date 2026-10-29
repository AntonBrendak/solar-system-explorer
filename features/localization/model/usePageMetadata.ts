"use client";

import { useEffect, useRef } from "react";
import type { Locale } from "@/i18n/config";
import { pageMetadata } from "@/i18n/page-metadata";

export function usePageMetadata(locale: Locale, origin: string) {
  const previous = useRef(locale);
  useEffect(() => {
    if (previous.current === locale) return;
    previous.current = locale;
    const metadata = pageMetadata(locale, origin);
    document.title = metadata.title;
    const setMeta = (
      attribute: "name" | "property",
      key: string,
      content: string,
    ) => {
      const existing = [
        ...document.querySelectorAll<HTMLMetaElement>(
          `meta[${attribute}="${key}"]`,
        ),
      ];
      let element =
        existing.find((node) => node.parentElement === document.head) ??
        existing[0];
      existing
        .filter((node) => node !== element)
        .forEach((node) => node.remove());
      if (!element) {
        element = document.createElement("meta");
        element.setAttribute(attribute, key);
        document.head.append(element);
      }
      element.content = content;
    };
    setMeta("name", "description", metadata.description);
    for (const [key, value] of Object.entries({
      title: metadata.title,
      description: metadata.description,
      url: metadata.canonical,
      image: metadata.image,
      "image:alt": metadata.imageAlt,
      locale: metadata.ogLocale,
    }))
      setMeta("property", `og:${key}`, value);
    for (const [key, value] of Object.entries({
      title: metadata.title,
      description: metadata.description,
      image: metadata.image,
      "image:alt": metadata.imageAlt,
      card: "summary_large_image",
    }))
      setMeta("name", `twitter:${key}`, value);
    let canonical = document.querySelector<HTMLLinkElement>(
      'link[rel="canonical"]',
    );
    if (!canonical) {
      canonical = document.createElement("link");
      canonical.rel = "canonical";
      document.head.append(canonical);
    }
    canonical.href = metadata.canonical;
  }, [locale, origin]);
}
