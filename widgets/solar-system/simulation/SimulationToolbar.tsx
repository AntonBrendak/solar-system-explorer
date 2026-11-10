"use client";

import { useId, useState, useSyncExternalStore } from "react";
import { useFormatter, useTranslations } from "next-intl";
import {
  SIMULATION_LIMITS,
  TIME_RATES,
  type SimulationStore,
} from "./simulation-store";
import styles from "./simulation-toolbar.module.css";
import { TimeSelect } from "./TimeSelect";

const rateUnits: Record<
  number,
  "secondRate" | "hourRate" | "dayRate" | "monthRate" | "yearRate"
> = {
  1: "secondRate",
  3600: "hourRate",
  86400: "dayRate",
  2592000: "monthRate",
  31557600: "yearRate",
};

const utcInput = (timestamp: number) =>
  new Date(timestamp).toISOString().slice(0, 19);

export function SimulationToolbar({ store }: { store: SimulationStore }) {
  const t = useTranslations("map.time");
  const format = useFormatter();
  const state = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getServerSnapshot,
  );
  const [draft, setDraft] = useState<string | null>(null);
  const [step, setStep] = useState(86_400_000);
  const id = useId();
  const rateName = (rate: number) =>
    t(rate < 0 ? "reverseRate" : "forwardRate", {
      value: t(rateUnits[Math.abs(rate)]),
    });
  const speed = state.paused
    ? t("rateValue", { value: format.number(0) })
    : rateName(state.rate);
  const date = state.ready
    ? format.dateTime(state.timestamp, {
        year: "numeric",
        month: "short",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hourCycle: "h23",
        timeZone: "UTC",
      })
    : "—";
  return (
    <details className={styles.root}>
      <summary>
        <span className={styles.title}>{t("title")}</span>
        <time
          dateTime={
            state.ready ? new Date(state.timestamp).toISOString() : undefined
          }
        >
          {date} UTC
        </time>
        <span className={styles.status}>
          {state.paused
            ? t("paused")
            : state.realtime
              ? t("live")
              : t("simulation")}{" "}
          · {speed}
        </span>
        <span aria-hidden="true" className={styles.chevron}>
          ⌄
        </span>
      </summary>
      <div className={styles.controls}>
        <div
          className={styles.transport}
          role="group"
          aria-label={t("playback")}
        >
          <button
            type="button"
            aria-pressed={state.realtime}
            onClick={() => {
              store.goLive();
              setDraft(null);
            }}
          >
            {t("live")}
          </button>
          <button
            type="button"
            onClick={() => {
              store.togglePaused();
              setDraft(null);
            }}
          >
            {state.paused ? t("play") : t("pause")}
          </button>
          <label htmlFor={`${id}-rate`}>{t("rate")}</label>
          <TimeSelect
            id={`${id}-rate`}
            label={t("rate")}
            value={state.rate}
            onChange={(value) => {
              store.setRate(value);
              setDraft(null);
            }}
            choices={TIME_RATES.map((rate) => ({
              value: rate,
              label: rateName(rate),
              detail: t("rateValue", {
                value: format.number(rate, {
                  maximumFractionDigits: 0,
                  signDisplay: "exceptZero",
                }),
              }),
            }))}
          />
        </div>
        <form
          className={styles.dateRow}
          onSubmit={(event) => {
            event.preventDefault();
            if (draft === null || !draft) return;
            const timestamp = Date.parse(`${draft}Z`);
            if (!Number.isFinite(timestamp)) return;
            store.seek(timestamp);
            setDraft(null);
          }}
        >
          <label htmlFor={`${id}-date`}>{t("date")}</label>
          <input
            id={`${id}-date`}
            type="datetime-local"
            step={1}
            required
            min={utcInput(SIMULATION_LIMITS.min)}
            max={utcInput(SIMULATION_LIMITS.max)}
            value={draft ?? (state.ready ? utcInput(state.timestamp) : "")}
            onChange={(event) => setDraft(event.target.value)}
            onFocus={() => setDraft(utcInput(store.getFrame().date.getTime()))}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                setDraft(null);
                event.currentTarget.blur();
              }
            }}
          />
          <button type="submit">{t("apply")}</button>
          <button
            type="button"
            onClick={() => {
              store.step(-step);
              setDraft(null);
            }}
            aria-label={t("backward")}
          >
            −
          </button>
          <TimeSelect
            id={`${id}-step`}
            label={t("step")}
            value={step}
            onChange={setStep}
            choices={[
              { value: 3_600_000, label: t("hour") },
              { value: 86_400_000, label: t("day") },
              { value: 2_592_000_000, label: t("month") },
              { value: 31_557_600_000, label: t("year") },
            ]}
          />
          <button
            type="button"
            onClick={() => {
              store.step(step);
              setDraft(null);
            }}
            aria-label={t("forward")}
          >
            +
          </button>
        </form>
        <p className={styles.hint}>{t("hint")}</p>
      </div>
    </details>
  );
}
