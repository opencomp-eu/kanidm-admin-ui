import { useState } from "react";
import type { ReactNode } from "react";
import type { KanidmEntry } from "../types";
import {
  attrVal,
  entryName,
  groupMemberNames,
  isSuspended,
  matchesQuery,
  userDisplayName,
} from "../types";
import Avatar from "./Avatar";
import Icon from "./Icon";
import SearchInput from "./SearchInput";

export interface PickerOption {
  id: string;
  label: string;
  sublabel?: string;
  leading?: ReactNode;
}

export function personOptions(users: KanidmEntry[]): PickerOption[] {
  return users
    .map((u) => ({
      id: entryName(u),
      label: userDisplayName(u),
      sublabel: [attrVal(u, "mail") || entryName(u), isSuspended(u) ? "suspended" : ""]
        .filter(Boolean)
        .join(" · "),
      leading: <Avatar name={userDisplayName(u)} seed={entryName(u)} size="sm" />,
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

export function groupOptions(groups: KanidmEntry[]): PickerOption[] {
  return groups
    .map((g) => {
      const count = groupMemberNames(g).length;
      return {
        id: entryName(g),
        label: entryName(g),
        sublabel:
          attrVal(g, "description") || `${count} ${count === 1 ? "member" : "members"}`,
        leading: (
          <span className="option-icon">
            <Icon name="groups" size={16} />
          </span>
        ),
      };
    })
    .sort((a, b) => a.label.localeCompare(b.label));
}

/** Searchable list for choosing one or several people, groups or apps. */
export default function PickerList({
  options,
  selected,
  onChange,
  multiple = true,
  searchPlaceholder,
  emptyMessage,
  maxHeight = 300,
}: {
  options: PickerOption[];
  selected: string[];
  onChange: (selected: string[]) => void;
  multiple?: boolean;
  searchPlaceholder: string;
  emptyMessage: string;
  maxHeight?: number;
}) {
  const [query, setQuery] = useState("");
  const visible = options.filter((o) => matchesQuery(query, o.label, o.sublabel ?? "", o.id));

  const toggle = (id: string) => {
    if (!multiple) return onChange([id]);
    onChange(selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id]);
  };

  return (
    <div className="picker">
      <SearchInput value={query} onChange={setQuery} placeholder={searchPlaceholder} />
      <ul className="picker-list" style={{ maxHeight }} role="listbox" aria-multiselectable={multiple}>
        {options.length === 0 ? (
          <li className="picker-empty">{emptyMessage}</li>
        ) : visible.length === 0 ? (
          <li className="picker-empty">Nothing matches “{query}”.</li>
        ) : (
          visible.map((o) => {
            const isSelected = selected.includes(o.id);
            return (
              <li key={o.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  className={`picker-option${isSelected ? " selected" : ""}`}
                  onClick={() => toggle(o.id)}
                >
                  {o.leading}
                  <span className="picker-text">
                    <span className="picker-label">{o.label}</span>
                    {o.sublabel && <span className="picker-sublabel">{o.sublabel}</span>}
                  </span>
                  <span className={`picker-check${multiple ? "" : " radio"}`}>
                    {isSelected && <Icon name="check" size={14} />}
                  </span>
                </button>
              </li>
            );
          })
        )}
      </ul>
      {multiple && selected.length > 0 && (
        <div className="picker-footer">
          {selected.length} selected
          <button type="button" className="link-btn" onClick={() => onChange([])}>
            Clear
          </button>
        </div>
      )}
    </div>
  );
}
