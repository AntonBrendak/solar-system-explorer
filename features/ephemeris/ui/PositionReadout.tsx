import { useFormatter, useTranslations } from "next-intl";
import type { PlanetId } from "@/entities/planet/types";
import { useLivePosition } from "../model/useLivePosition";
import styles from "./position.module.css";

export function PositionReadout({
  planetId,
  active,
}: {
  planetId: PlanetId;
  active: boolean;
}) {
  const t = useTranslations("ui");
  const format = useFormatter();
  const position = useLivePosition(planetId, active);
  const number = (value: number | undefined) =>
    value === undefined
      ? "—"
      : format.number(value, {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        });
  return (
    <div className={styles.readout} data-live-position={planetId}>
      <div className={styles.heading}>
        <span className={styles.dot} />
        <span>{t("livePosition")}</span>
        <time dateTime={position?.timestamp}>
          {position
            ? format.dateTime(new Date(position.timestamp), {
                hour: "2-digit",
                minute: "2-digit",
                hourCycle: "h23",
                timeZone: "UTC",
              })
            : "—"}{" "}
          UTC
        </time>
      </div>
      <dl>
        <div>
          <dt>{t("distanceNow")}</dt>
          <dd>
            {number(position?.distanceAu)} <small>{t("au")}</small>
          </dd>
        </div>
        <div>
          <dt>{t("eclipticLongitude")}</dt>
          <dd>
            {number(position?.longitude)}
            <small>°</small>
          </dd>
        </div>
        <div>
          <dt>{t("eclipticLatitude")}</dt>
          <dd>
            {number(position?.latitude)}
            <small>°</small>
          </dd>
        </div>
      </dl>
    </div>
  );
}
