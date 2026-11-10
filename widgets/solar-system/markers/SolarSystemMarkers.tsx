"use client";

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type KeyboardEvent,
} from "react";
import { useFormatter, useTranslations } from "next-intl";
import { catalog, planetsById } from "@/entities/planet/catalog";
import type { SolarMapFocus } from "../model/types";
import { SunMapIndicator } from "../sun/SunMapIndicator";
import type { MapObjectId, MarkerStore } from "./marker-store";
import markerStyles from "../planet-marker.module.css";
import styles from "./solar-system-markers.module.css";

const objectIds: MapObjectId[] = ["sun", ...catalog.map((planet) => planet.id)];
type OpenGroup = {
  anchor: MapObjectId;
  members: MapObjectId[];
  x: number;
  y: number;
};
type Props = {
  store: MarkerStore;
  selected: SolarMapFocus;
  hidden: boolean;
  onSelect: (id: SolarMapFocus) => void;
  onHover: (id: SolarMapFocus) => void;
};

export function SolarSystemMarkers({
  store,
  selected,
  hidden,
  onSelect,
  onHover,
}: Props) {
  const t = useTranslations("map");
  const planets = useTranslations("planets");
  const format = useFormatter();
  const snapshot = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getServerSnapshot,
  );
  const [open, setOpen] = useState<OpenGroup | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  const buttons = useRef(new Map<MapObjectId, HTMLButtonElement>());
  const popupId = useId();
  const name = (id: MapObjectId) =>
    id === "sun" ? t("sun") : planets(`${id}.name`);
  const accent = (id: MapObjectId) =>
    id === "sun" ? "#ffbd7e" : planetsById[id].accent;
  const focusNavigation = useCallback((id: MapObjectId) => {
    document
      .querySelector<HTMLButtonElement>(`[data-map-navigation="${id}"]`)
      ?.focus({ preventScroll: true });
  }, []);
  const close = useCallback(
    (restoreFocus: boolean) => {
      setOpen(null);
      onHover(null);
      if (restoreFocus && open) {
        const button = buttons.current.get(open.anchor);
        if (button && !button.closest("[hidden]")) {
          button.focus({ preventScroll: true });
          onHover(open.anchor);
        } else focusNavigation(open.anchor);
      }
    },
    [open, onHover, focusNavigation],
  );

  useEffect(() => {
    if (!open) return;
    const first =
      popup.current?.querySelector<HTMLButtonElement>(
        '[aria-pressed="true"]',
      ) ??
      popup.current?.querySelector<HTMLButtonElement>("[data-group-object]");
    first?.focus({ preventScroll: true });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) close(false);
    };
    const focusOutside = (event: FocusEvent) => {
      const target = event.target as Node;
      if (
        !popup.current?.contains(target) &&
        target !== buttons.current.get(open.anchor)
      )
        close(false);
    };
    document.addEventListener("pointerdown", outside, true);
    document.addEventListener("focusin", focusOutside);
    return () => {
      document.removeEventListener("pointerdown", outside, true);
      document.removeEventListener("focusin", focusOutside);
    };
  }, [open, close]);

  // A marker can leave the viewport or fade during a flight/manual zoom.
  // Move keyboard focus to the permanent navigation instead of losing it.
  useLayoutEffect(() => {
    const focused = store.getFocused();
    if (focused && !snapshot.groups.some((group) => group[0].id === focused)) {
      const button = buttons.current.get(focused);
      if (
        document.activeElement === button ||
        document.activeElement === document.body
      ) {
        store.setFocused(null);
        focusNavigation(focused);
      }
    }
  }, [snapshot, store, focusNavigation]);

  const choose = (id: MapObjectId) => {
    setOpen(null);
    onHover(null);
    focusNavigation(id);
    onSelect(id);
  };
  const listKeys = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      close(true);
      return;
    }
    const items = [
      ...(popup.current?.querySelectorAll<HTMLButtonElement>(
        "[data-group-object]",
      ) ?? []),
    ];
    const current = items.indexOf(document.activeElement as HTMLButtonElement);
    let next = current;
    if (event.key === "ArrowDown") next = (current + 1) % items.length;
    else if (event.key === "ArrowUp")
      next = (current - 1 + items.length) % items.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = items.length - 1;
    else return;
    event.preventDefault();
    items[next]?.focus();
  };
  const popupTop = open
    ? Math.max(
        12,
        Math.min(
          snapshot.height - Math.min(open.members.length * 48 + 64, 340) - 12,
          open.y + 42,
        ),
      )
    : 12;

  return (
    <div
      ref={root}
      className={styles.root}
      style={{ height: snapshot.height }}
      aria-label={t("mapMarkers")}
      role="group"
      hidden={hidden}
      inert={hidden}
    >
      {objectIds.map((id) => {
        const group = snapshot.groups.find((members) => members[0].id === id);
        const representative = group?.[0];
        const count = group?.length ?? 1;
        const active = group?.some((member) => member.id === selected) ?? false;
        const expanded = open?.anchor === id;
        const label =
          count > 1
            ? t("openMarkerGroup", {
                count,
                names: format.list(group!.map((member) => name(member.id))),
              })
            : t("focusObject", { name: name(id) });
        const content = (
          <>
            <span className={markerStyles.reticle} aria-hidden="true">
              {count > 1 ? (
                <span className={styles.count}>+{format.number(count)}</span>
              ) : (
                <span className={markerStyles.core} />
              )}
            </span>
            <span className={markerStyles.name} aria-hidden="true">
              {active && selected ? name(selected) : name(id)}
            </span>
          </>
        );
        const props = {
          ref: (element: HTMLButtonElement | null) => {
            if (element) buttons.current.set(id, element);
            else buttons.current.delete(id);
          },
          className: markerStyles.marker,
          style: {
            "--marker-color": accent(active && selected ? selected : id),
          } as CSSProperties,
          "data-map-marker": id,
          "data-marker-count": count,
          "data-selected": active ? "true" : undefined,
          "aria-label": label,
          "aria-pressed": active,
          "aria-haspopup": count > 1 ? ("dialog" as const) : undefined,
          "aria-expanded": count > 1 ? expanded : undefined,
          "aria-controls": expanded ? popupId : undefined,
          onClick: () => {
            if (count === 1) choose(id);
            else if (expanded) close(true);
            else
              setOpen({
                anchor: id,
                members: group!.map((member) => member.id),
                x: representative!.x,
                y: representative!.y,
              });
          },
          onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => {
            if (event.key === "Escape" && open) {
              event.preventDefault();
              close(true);
            }
            if (event.key === "ArrowDown" && count > 1) {
              event.preventDefault();
              setOpen({
                anchor: id,
                members: group!.map((member) => member.id),
                x: representative!.x,
                y: representative!.y,
              });
            }
          },
          onPointerEnter: () => {
            store.setHovered(id);
            if (!open) onHover(id);
          },
          onPointerLeave: () => {
            store.setHovered(null);
            if (!open) onHover(store.getFocused());
          },
          onFocus: () => {
            store.setFocused(id);
            if (!open) onHover(id);
          },
          onBlur: () => {
            store.setFocused(null);
            if (!open) onHover(store.getHovered());
          },
        };
        return (
          <div
            key={id}
            className={styles.anchor}
            hidden={!group}
            style={{
              left: representative?.x ?? 0,
              top: representative?.y ?? 0,
              opacity: count > 1 ? 1 : (representative?.opacity ?? 0),
            }}
          >
            {id === "sun" ? (
              <SunMapIndicator {...props}>{content}</SunMapIndicator>
            ) : (
              <button type="button" {...props}>
                {content}
              </button>
            )}
          </div>
        );
      })}
      {open && (
        <div
          ref={popup}
          id={popupId}
          role="dialog"
          aria-label={t("markerGroupTitle")}
          className={styles.popup}
          onKeyDown={listKeys}
          style={{
            left: Math.max(12, Math.min(snapshot.width - 292, open.x - 140)),
            top: popupTop,
            maxHeight: Math.max(
              44,
              Math.min(340, snapshot.height - popupTop - 12),
            ),
          }}
        >
          <div className={styles.heading}>
            <span>{t("markerGroupTitle")}</span>
            <button
              type="button"
              aria-label={t("closeMarkerGroup")}
              onClick={() => close(true)}
            >
              ×
            </button>
          </div>
          <ul className={styles.list}>
            {[...open.members]
              .sort(
                (a, b) =>
                  Number(b === selected) - Number(a === selected) ||
                  objectIds.indexOf(a) - objectIds.indexOf(b),
              )
              .map((id) => (
                <li key={id}>
                  <button
                    type="button"
                    data-group-object={id}
                    aria-pressed={selected === id}
                    style={{ "--marker-color": accent(id) } as CSSProperties}
                    onClick={() => choose(id)}
                    onFocus={() => onHover(id)}
                    onBlur={() => onHover(null)}
                    onPointerEnter={() => onHover(id)}
                    onPointerLeave={(event) =>
                      onHover(
                        document.activeElement === event.currentTarget
                          ? id
                          : null,
                      )
                    }
                  >
                    <span className={styles.dot} aria-hidden="true" />
                    <span>{name(id)}</span>
                    {selected === id && (
                      <span className={styles.selected}>
                        {t("selectedObject")}
                      </span>
                    )}
                  </button>
                </li>
              ))}
          </ul>
        </div>
      )}
    </div>
  );
}
