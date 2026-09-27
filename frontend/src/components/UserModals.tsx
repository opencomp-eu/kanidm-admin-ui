import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Modal from "./Modal";
import PickerList, { groupOptions, personOptions } from "./PickerList";
import Icon from "./Icon";
import { LoadingState, ErrorBanner, Banner } from "./States";
import { useToast } from "./Toast";
import {
  addUserToGroup,
  createUser,
  generateResetToken,
  listGroups,
  listUsers,
  runForEach,
  updateUser,
} from "../api";
import type { KanidmEntry, ResetLink } from "../types";
import {
  attrVal,
  entryName,
  formatDateTime,
  isSystemEntry,
  isValidName,
  NAME_PATTERN,
  suggestName,
  systemGroupNameSet,
  teamGroupNames,
  userDisplayName,
} from "../types";
import { useLoader } from "../hooks";

interface PersonSummary {
  username: string;
  displayName: string;
  mail: string;
}

export function personSummary(user: KanidmEntry): PersonSummary {
  return {
    username: entryName(user),
    displayName: userDisplayName(user),
    mail: attrVal(user, "mail"),
  };
}

function expiryText(link: ResetLink): string {
  if (!link.expires_at) return "soon";
  const date = new Date(link.expires_at);
  return Number.isNaN(date.getTime()) ? "soon" : `on ${formatDateTime(date)}`;
}

function setupMessage(person: PersonSummary, link: ResetLink, isNewAccount: boolean): string {
  const firstName = person.displayName.split(" ")[0] || person.username;
  const intro = isNewAccount
    ? `Your new account is ready. Your username is: ${person.username}`
    : `Here is a link to reset how you sign in. Your username is: ${person.username}`;
  return [
    `Hi ${firstName},`,
    "",
    intro,
    "",
    "Open this link to choose your password (or set up a passkey):",
    link.reset_url,
    "",
    `The link can only be used once and expires ${expiryText(link)}.`,
  ].join("\n");
}

function CopyButton({ text, label, successMessage }: { text: string; label: string; successMessage: string }) {
  const { addToast } = useToast();
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      addToast(successMessage);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      addToast("Couldn't copy automatically. Please select the text and copy it.", "error");
    }
  };

  return (
    <button type="button" className="btn btn-secondary btn-sm" onClick={handleCopy}>
      <Icon name={copied ? "check" : "copy"} size={15} />
      {copied ? "Copied" : label}
    </button>
  );
}

/** Shows a one-time sign-in setup link plus a message the admin can paste into an email or chat. */
export function SetupLinkPanel({
  person,
  link,
  isNewAccount,
}: {
  person: PersonSummary;
  link: ResetLink;
  isNewAccount: boolean;
}) {
  const message = setupMessage(person, link, isNewAccount);
  const mailto = person.mail
    ? `mailto:${encodeURIComponent(person.mail)}?subject=${encodeURIComponent(
        isNewAccount ? "Your new account" : "Reset your sign-in",
      )}&body=${encodeURIComponent(message)}`
    : "";

  return (
    <div className="setup-link">
      <label className="field-label">Setup link</label>
      <div className="link-box">
        <code>{link.reset_url}</code>
        <CopyButton text={link.reset_url} label="Copy link" successMessage="Link copied" />
      </div>
      <p className="field-hint">
        <Icon name="clock" size={14} /> Works once and expires {expiryText(link)}. Anyone with the
        link can set up this account, so only send it to {person.displayName}.
      </p>

      <label className="field-label" htmlFor="setup-message">
        Ready-to-send message
      </label>
      <textarea id="setup-message" className="message-box" readOnly value={message} rows={9} />
      <div className="button-row">
        <CopyButton text={message} label="Copy message" successMessage="Message copied" />
        {mailto && (
          <a className="btn btn-secondary btn-sm" href={mailto}>
            <Icon name="mail" size={15} />
            Open in email app
          </a>
        )}
      </div>
    </div>
  );
}

/** Generates a fresh setup link for an existing person as soon as it opens. */
export function SetupLinkModal({ user, onClose }: { user: KanidmEntry; onClose: () => void }) {
  const person = personSummary(user);
  const { data: link, error } = useLoader(() => generateResetToken(person.username), [person.username]);

  return (
    <Modal
      title={`Sign-in link for ${person.displayName}`}
      description="Use this when someone forgot their password, lost their passkey, or never finished setting up their account."
      onClose={onClose}
      size="lg"
    >
      {error ? (
        <ErrorBanner error={error} />
      ) : !link ? (
        <LoadingState label="Creating a secure link…" />
      ) : (
        <SetupLinkPanel person={person} link={link} isNewAccount={false} />
      )}
      <div className="modal-actions">
        <button className="btn btn-primary" onClick={onClose}>
          Done
        </button>
      </div>
    </Modal>
  );
}

type AccessMode = "groups" | "colleague";

/** Built-in Kanidm groups (including admin rights) are never copied between people. */
export function GroupPreview({ groups }: { groups: string[] }) {
  return (
    <div className="group-preview">
      {groups.length === 0 ? (
        <span className="muted small">This person isn't in any groups you manage.</span>
      ) : (
        <>
          <span className="muted small">Will be added to:</span>
          <div className="chip-list">
            {groups.map((g) => (
              <span key={g} className="chip">
                {g}
              </span>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

interface CreatedPerson {
  person: PersonSummary;
  link: ResetLink | null;
  groupsAdded: string[];
  groupsFailed: string[];
}

/** Three-step flow: who they are, what they can access, then how to hand over the account. */
export function CreatePersonModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [step, setStep] = useState<"details" | "access">("details");
  const [displayName, setDisplayName] = useState("");
  const [mail, setMail] = useState("");
  const [username, setUsername] = useState("");
  const [usernameEdited, setUsernameEdited] = useState(false);
  const [accessMode, setAccessMode] = useState<AccessMode>("groups");
  const [selectedGroups, setSelectedGroups] = useState<string[]>([]);
  const [colleague, setColleague] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [created, setCreated] = useState<CreatedPerson | null>(null);
  const directory = useLoader(() => Promise.all([listGroups(), listUsers()]), []);

  useEffect(() => {
    if (!usernameEdited) setUsername(suggestName(displayName));
  }, [displayName, usernameEdited]);

  const usernameValid = isValidName(username);
  const [groups, users] = directory.data ?? [[], []];
  const orgGroups = groups.filter((g) => !isSystemEntry(g));
  const colleagueEntry = users.find((u) => entryName(u) === colleague[0]);
  const groupsToAdd =
    accessMode === "groups"
      ? selectedGroups
      : colleagueEntry
        ? teamGroupNames(colleagueEntry, systemGroupNameSet(groups))
        : [];

  const handleDetails = (e: React.FormEvent) => {
    e.preventDefault();
    if (usernameValid && displayName.trim()) setStep("access");
  };

  const handleCreate = async () => {
    setCreating(true);
    setError(null);
    const person = { username, displayName: displayName.trim(), mail: mail.trim() };
    try {
      await createUser({ name: username, displayname: person.displayName, mail: person.mail || undefined });
    } catch (e) {
      setError(e);
      setStep("details");
      setCreating(false);
      return;
    }

    const { succeeded: groupsAdded, failed: groupsFailed } = await runForEach(groupsToAdd, (g) =>
      addUserToGroup(username, g),
    );

    let link: ResetLink | null = null;
    try {
      link = await generateResetToken(username);
    } catch {
      link = null;
    }
    setCreated({ person, link, groupsAdded, groupsFailed });
    setCreating(false);
    onCreated();
  };

  const startOver = () => {
    setCreated(null);
    setStep("details");
    setDisplayName("");
    setMail("");
    setUsername("");
    setUsernameEdited(false);
    setSelectedGroups([]);
    setColleague([]);
  };

  if (created) {
    return (
      <Modal title="Account created" onClose={onClose} size="lg">
        <div className="success-hero">
          <span className="success-icon">
            <Icon name="check" size={22} />
          </span>
          <div>
            <strong>{created.person.displayName}</strong>’s account is ready.
            {created.groupsAdded.length > 0 && (
              <div className="muted">
                Added to {created.groupsAdded.length}{" "}
                {created.groupsAdded.length === 1 ? "group" : "groups"}: {created.groupsAdded.join(", ")}
              </div>
            )}
          </div>
        </div>
        {created.groupsFailed.length > 0 && (
          <Banner tone="warning">
            Some groups couldn't be added: {created.groupsFailed.join(", ")}. You can add them from
            their profile.
          </Banner>
        )}
        <h3 className="section-title">Last step: send them their setup link</h3>
        {created.link ? (
          <SetupLinkPanel person={created.person} link={created.link} isNewAccount />
        ) : (
          <Banner tone="warning">
            We couldn't create a setup link right now. Open their profile and choose “Send sign-in
            link” to try again.
          </Banner>
        )}
        <div className="modal-actions">
          <button className="btn btn-ghost" onClick={startOver}>
            <Icon name="personAdd" size={16} />
            Add another person
          </button>
          <Link
            className="btn btn-secondary"
            to={`/users/${encodeURIComponent(created.person.username)}`}
            onClick={onClose}
          >
            View profile
          </Link>
          <button className="btn btn-primary" onClick={onClose}>
            Done
          </button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      title="Add a person"
      description={
        step === "details"
          ? "Step 1 of 2 · Who are they?"
          : "Step 2 of 2 · What should they have access to?"
      }
      onClose={onClose}
      size="lg"
    >
      {error !== null && <ErrorBanner error={error} />}
      {step === "details" ? (
        <form onSubmit={handleDetails}>
          <div className="form-group">
            <label htmlFor="person-name">Full name</label>
            <input
              id="person-name"
              type="text"
              required
              placeholder="e.g. Jane Doe"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
          </div>
          <div className="form-group">
            <label htmlFor="person-mail">
              Work email <span className="optional">recommended</span>
            </label>
            <input
              id="person-mail"
              type="email"
              placeholder="jane.doe@company.com"
              value={mail}
              onChange={(e) => setMail(e.target.value)}
            />
            <p className="field-hint">Apps use this to contact them and to recognise who they are.</p>
          </div>
          <div className="form-group">
            <label htmlFor="person-username">Username</label>
            <input
              id="person-username"
              type="text"
              required
              pattern={NAME_PATTERN}
              value={username}
              onChange={(e) => {
                setUsername(e.target.value.toLowerCase());
                setUsernameEdited(true);
              }}
            />
            <p className={`field-hint${username && !usernameValid ? " field-error" : ""}`}>
              {username && !usernameValid
                ? "Use lowercase letters, numbers, dots or dashes, starting with a letter."
                : "What they type to sign in. We suggested one based on their name."}
            </p>
          </div>
          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={!usernameValid || !displayName.trim()}
            >
              Next: choose access
              <Icon name="chevronRight" size={16} />
            </button>
          </div>
        </form>
      ) : (
        <>
          <div className="segmented" role="tablist">
            <button
              role="tab"
              aria-selected={accessMode === "groups"}
              className={accessMode === "groups" ? "active" : ""}
              onClick={() => setAccessMode("groups")}
            >
              Choose groups
            </button>
            <button
              role="tab"
              aria-selected={accessMode === "colleague"}
              className={accessMode === "colleague" ? "active" : ""}
              onClick={() => setAccessMode("colleague")}
            >
              Same access as a colleague
            </button>
          </div>
          {directory.loading ? (
            <LoadingState />
          ) : accessMode === "groups" ? (
            <>
              <p className="muted small">
                Groups decide which apps and resources someone can use. You can change this later.
              </p>
              <PickerList
                options={groupOptions(orgGroups)}
                selected={selectedGroups}
                onChange={setSelectedGroups}
                searchPlaceholder="Search groups…"
                emptyMessage="No groups yet. You can create groups from the Groups page."
                maxHeight={260}
              />
            </>
          ) : (
            <>
              <p className="muted small">
                Pick someone in a similar role. {displayName.split(" ")[0] || "They"} will be added to
                the same groups.
              </p>
              <PickerList
                options={personOptions(users)}
                selected={colleague}
                onChange={setColleague}
                multiple={false}
                searchPlaceholder="Search people…"
                emptyMessage="There's nobody to copy from yet."
                maxHeight={220}
              />
              {colleagueEntry && <GroupPreview groups={groupsToAdd} />}
            </>
          )}
          <div className="modal-actions">
            <button className="btn btn-ghost" onClick={() => setStep("details")} disabled={creating}>
              Back
            </button>
            <button className="btn btn-primary" onClick={handleCreate} disabled={creating}>
              {creating
                ? "Creating account…"
                : groupsToAdd.length === 0
                  ? "Create without access"
                  : "Create account"}
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}

export function EditPersonModal({
  user,
  onClose,
  onSaved,
}: {
  user: KanidmEntry;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { addToast } = useToast();
  const [displayName, setDisplayName] = useState(attrVal(user, "displayname"));
  const [mail, setMail] = useState(attrVal(user, "mail"));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await updateUser(entryName(user), {
        displayname: displayName.trim(),
        mail: mail.trim() || undefined,
      });
      addToast("Details saved");
      onSaved();
      onClose();
    } catch (err) {
      setError(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title="Edit details" onClose={onClose}>
      {error !== null && <ErrorBanner error={error} />}
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label htmlFor="edit-name">Full name</label>
          <input
            id="edit-name"
            type="text"
            required
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
          />
        </div>
        <div className="form-group">
          <label htmlFor="edit-mail">Work email</label>
          <input id="edit-mail" type="email" value={mail} onChange={(e) => setMail(e.target.value)} />
        </div>
        <div className="form-group">
          <label>Username</label>
          <input type="text" value={entryName(user)} disabled />
          <p className="field-hint">Usernames can't be changed here.</p>
        </div>
        <div className="modal-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={saving || !displayName.trim()}>
            {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

