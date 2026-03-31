import type { SessionPrincipal } from "@/lib/auth";

type HeaderUtilityClusterProps = {
  session: SessionPrincipal;
};

export function HeaderUtilityCluster({ session }: HeaderUtilityClusterProps) {
  const initials = session.sub
    .split(/[\s@._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");

  return (
    <div className="utility-cluster">
      <button type="button" className="utility-button">
        <span className="material-symbols-outlined">calendar_today</span>
      </button>
      <button type="button" className="utility-button utility-button--alert">
        <span className="material-symbols-outlined">notifications</span>
      </button>
      <button type="button" className="utility-button">
        <span className="material-symbols-outlined">ios_share</span>
      </button>
      <div className="utility-cluster__identity">
        <div>
          <p className="utility-cluster__eyebrow">{session.role}</p>
          <p className="utility-cluster__value">{session.clearanceLevel}</p>
        </div>
        <div className="utility-cluster__avatar">{initials || "NR"}</div>
      </div>
    </div>
  );
}
