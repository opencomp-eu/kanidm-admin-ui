import { initials } from "../types";

function hueFor(seed: string): number {
  let hash = 0;
  for (const ch of seed) hash = (hash * 31 + ch.charCodeAt(0)) % 360;
  return hash;
}

export default function Avatar({
  name,
  seed = name,
  size = "md",
  muted = false,
}: {
  name: string;
  seed?: string;
  size?: "sm" | "md" | "lg" | "xl";
  muted?: boolean;
}) {
  return (
    <span
      className={`avatar avatar-${size}${muted ? " avatar-muted" : ""}`}
      style={{ "--avatar-hue": hueFor(seed) } as React.CSSProperties}
      aria-hidden="true"
    >
      {initials(name)}
    </span>
  );
}
