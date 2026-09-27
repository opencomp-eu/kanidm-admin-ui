const PATHS = {
  home: ["M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"],
  people: [
    "M9 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z",
    "M2 20c0-3.3 3.1-6 7-6s7 2.7 7 6",
    "M16 4.1a4 4 0 0 1 0 7.8",
    "M22 20c0-2.6-1.9-4.8-4.5-5.6",
  ],
  person: ["M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z", "M4 21c0-4 3.6-7 8-7s8 3 8 7"],
  personAdd: [
    "M9 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z",
    "M2 21c0-4 3.1-7 7-7s7 3 7 7",
    "M19 8v6M16 11h6",
  ],
  personOff: [
    "M9 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z",
    "M2 21c0-4 3.1-7 7-7s7 3 7 7",
    "M16 11h6",
  ],
  groups: ["M12 3 2 8l10 5 10-5z", "M2 13l10 5 10-5", "M2 17.5l10 5 10-5"],
  apps: [
    "M4 4h6v6H4z",
    "M14 4h6v6h-6z",
    "M4 14h6v6H4z",
    "M14 14h6v6h-6z",
  ],
  search: ["M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14z", "M20 20l-3.5-3.5"],
  plus: ["M12 5v14M5 12h14"],
  key: [
    "M7.5 20a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9z",
    "M10.7 12.3 20 3M16 7l3 3M14 9l2 2",
  ],
  lock: ["M5 11h14a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1z", "M8 11V7a4 4 0 0 1 8 0v4"],
  unlock: ["M5 11h14a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1z", "M8 11V7a4 4 0 0 1 7.5-2"],
  trash: [
    "M4 7h16M10 11v6M14 11v6",
    "M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13M9 7V4h6v3",
  ],
  edit: ["M4 20h4L19 9l-4-4L4 16z", "M13.5 6.5l4 4"],
  copy: [
    "M11 9h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-8a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2z",
    "M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1",
  ],
  check: ["M5 12.5l4.5 4.5L19 7"],
  alert: [
    "M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z",
    "M12 9v4M12 17h.01",
  ],
  info: ["M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z", "M12 11v5M12 8h.01"],
  chevronRight: ["M9 6l6 6-6 6"],
  arrowLeft: ["M19 12H5M11 18l-6-6 6-6"],
  logout: ["M9 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h3", "M16 16l4-4-4-4", "M20 12H10"],
  mail: ["M5 5h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z", "M3 7l9 6 9-6"],
  close: ["M6 6l12 12M18 6 6 18"],
  sparkles: [
    "M12 3l1.8 4.7 4.7 1.8-4.7 1.8L12 16l-1.8-4.7-4.7-1.8 4.7-1.8z",
    "M19 15l.8 2.2 2.2.8-2.2.8L19 21l-.8-2.2-2.2-.8 2.2-.8z",
  ],
  shield: ["M12 3 4 6v6c0 5 3.5 8.5 8 9 4.5-.5 8-4 8-9V6z"],
  link: [
    "M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1",
    "M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1",
  ],
  external: [
    "M14 4h6v6M20 4l-9 9",
    "M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5",
  ],
  clock: ["M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z", "M12 7v5l3 2"],
  help: [
    "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z",
    "M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14M12 17h.01",
  ],
} satisfies Record<string, string[]>;

export type IconName = keyof typeof PATHS;

export default function Icon({
  name,
  size = 18,
  className,
}: {
  name: IconName;
  size?: number;
  className?: string;
}) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {PATHS[name].map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}
