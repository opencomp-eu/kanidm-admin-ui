import type { IconName } from "./components/Icon";
import type { KanidmEntry } from "./types";
import {
  accountStatus,
  appAccessGroups,
  appDisplayName,
  attrVal,
  entryName,
  formatDate,
  groupMemberNames,
  isSuspended,
  isSystemEntry,
  systemGroupNameSet,
  teamGroupNames,
  userDisplayName,
} from "./types";

export interface InsightItem {
  key: string;
  label: string;
  sublabel?: string;
  to: string;
}

export interface Insight {
  id: string;
  tone: "warning" | "info" | "danger";
  icon: IconName;
  title: string;
  description: string;
  items: InsightItem[];
}

const SOON_DAYS = 14;

const personItem = (u: KanidmEntry, sublabel?: string): InsightItem => ({
  key: entryName(u),
  label: userDisplayName(u),
  sublabel: sublabel ?? entryName(u),
  to: `/users/${encodeURIComponent(entryName(u))}`,
});

const groupItem = (g: KanidmEntry): InsightItem => ({
  key: entryName(g),
  label: entryName(g),
  sublabel: attrVal(g, "description") || undefined,
  to: `/groups/${encodeURIComponent(entryName(g))}`,
});

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Housekeeping suggestions for the home page, most important first. */
export function buildInsights(
  users: KanidmEntry[],
  groups: KanidmEntry[],
  apps: KanidmEntry[],
  now = new Date(),
): Insight[] {
  const systemNames = systemGroupNameSet(groups);
  const orgGroups = groups.filter((g) => !isSystemEntry(g));
  const activeUsers = users.filter((u) => !isSuspended(u));
  const soon = new Date(now.getTime() + SOON_DAYS * 86_400_000);

  const endingSoon = activeUsers.filter((u) => {
    const s = accountStatus(u, now);
    return s.kind === "active" && s.endsAt && s.endsAt <= soon;
  });
  const noGroups = activeUsers.filter((u) => teamGroupNames(u, systemNames).length === 0);
  const noEmail = activeUsers.filter((u) => !attrVal(u, "mail"));
  const suspended = users.filter(isSuspended);
  const emptyGroups = orgGroups.filter((g) => groupMemberNames(g).length === 0);
  const appsWithoutAccess = apps.filter((a) => appAccessGroups(a).length === 0);

  const insights: Insight[] = [
    {
      id: "ending-soon",
      tone: "warning",
      icon: "clock",
      title: `${plural(endingSoon.length, "account ends", "accounts end")} in the next ${SOON_DAYS} days`,
      description: "These people will lose access automatically. Extend it if they're staying on.",
      items: endingSoon.map((u) => {
        const s = accountStatus(u, now);
        return personItem(u, s.kind === "active" && s.endsAt ? `Ends ${formatDate(s.endsAt)}` : undefined);
      }),
    },
    {
      id: "apps-without-access",
      tone: "warning",
      icon: "apps",
      title: `${plural(appsWithoutAccess.length, "app has", "apps have")} nobody allowed to sign in`,
      description: "Give a group access so people can start using it.",
      items: appsWithoutAccess.map((a) => ({
        key: entryName(a),
        label: appDisplayName(a),
        sublabel: entryName(a),
        to: `/oauth2/${encodeURIComponent(entryName(a))}`,
      })),
    },
    {
      id: "no-groups",
      tone: "warning",
      icon: "groups",
      title: `${plural(noGroups.length, "person isn't", "people aren't")} in any group`,
      description: "Without a group they probably can't use any of your apps yet.",
      items: noGroups.map((u) => personItem(u)),
    },
    {
      id: "no-email",
      tone: "info",
      icon: "mail",
      title: `${plural(noEmail.length, "person has", "people have")} no email address`,
      description: "Many apps need an email to recognise someone. Add one from their profile.",
      items: noEmail.map((u) => personItem(u)),
    },
    {
      id: "suspended",
      tone: "info",
      icon: "lock",
      title: `${plural(suspended.length, "account is", "accounts are")} suspended`,
      description: "If someone has left for good, you can delete their account to keep things tidy.",
      items: suspended.map((u) => {
        const s = accountStatus(u, now);
        return personItem(u, s.kind === "suspended" && s.since ? `Since ${formatDate(s.since)}` : undefined);
      }),
    },
    {
      id: "empty-groups",
      tone: "info",
      icon: "groups",
      title: `${plural(emptyGroups.length, "group has", "groups have")} no members`,
      description: "Add people, or delete groups you no longer need.",
      items: emptyGroups.map(groupItem),
    },
  ];

  return insights.filter((i) => i.items.length > 0);
}
