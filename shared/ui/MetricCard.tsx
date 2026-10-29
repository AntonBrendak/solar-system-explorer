import styles from "./ui.module.css";

export function MetricCard({
  label,
  value,
  unit,
  note,
}: {
  label: string;
  value: string;
  unit: string;
  note?: string;
}) {
  return (
    <div className={styles.metric}>
      <dt>{label}</dt>
      <dd>
        <span>{value}</span> <small>{unit}</small>
        {note && <p>{note}</p>}
      </dd>
    </div>
  );
}
