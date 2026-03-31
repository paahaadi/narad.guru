type MetricItem = {
  label: string;
  value: string;
  accent?: string;
  meta?: string;
};

export function WorkspaceMetricStrip({ items }: { items: MetricItem[] }) {
  return (
    <div className="metric-strip">
      {items.map((item) => (
        <article key={item.label} className="metric-card">
          <span className="metric-card__label">{item.label}</span>
          <strong className={`metric-card__value${item.accent ? ` ${item.accent}` : ""}`}>{item.value}</strong>
          {item.meta ? <p className="cluster-row--tight">{item.meta}</p> : null}
        </article>
      ))}
    </div>
  );
}

export function WorkspaceTabs({
  items,
  active,
}: {
  items: string[];
  active: string;
}) {
  return (
    <div className="cluster-row">
      {items.map((item) => (
        <span key={item} className={`pill${item === active ? " pill--primary" : ""}`}>
          {item}
        </span>
      ))}
    </div>
  );
}
