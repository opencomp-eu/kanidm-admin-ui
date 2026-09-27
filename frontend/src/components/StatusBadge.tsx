import type { KanidmEntry } from "../types";
import { accountStatus, formatDate } from "../types";

export default function StatusBadge({ user }: { user: KanidmEntry }) {
  const status = accountStatus(user);
  switch (status.kind) {
    case "suspended":
      return <span className="badge badge-danger">Suspended</span>;
    case "not_started":
      return (
        <span className="badge badge-warning" title="The account can't be used before this date">
          Starts {formatDate(status.startsAt)}
        </span>
      );
    case "active":
      return status.endsAt ? (
        <span className="badge badge-warning" title="Access ends automatically on this date">
          Active until {formatDate(status.endsAt)}
        </span>
      ) : (
        <span className="badge badge-success">Active</span>
      );
  }
}
