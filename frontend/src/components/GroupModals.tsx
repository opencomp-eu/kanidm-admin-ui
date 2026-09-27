import { useEffect, useState } from "react";
import Modal from "./Modal";
import PickerList, { personOptions } from "./PickerList";
import { ErrorBanner, LoadingState, Banner } from "./States";
import { useToast } from "./Toast";
import { addGroupMember, createGroup, listUsers, runForEach, updateGroup } from "../api";
import type { KanidmEntry } from "../types";
import { attrVal, entryName, isValidName, NAME_PATTERN, suggestName } from "../types";
import { useLoader } from "../hooks";

export function CreateGroupModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (name: string) => void;
}) {
  const { addToast } = useToast();
  const [label, setLabel] = useState("");
  const [name, setName] = useState("");
  const [nameEdited, setNameEdited] = useState(false);
  const [description, setDescription] = useState("");
  const [members, setMembers] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [partialFailure, setPartialFailure] = useState<string[]>([]);
  const users = useLoader(listUsers, []);

  useEffect(() => {
    if (!nameEdited) setName(suggestName(label, "-"));
  }, [label, nameEdited]);

  const nameValid = isValidName(name);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setError(null);
    try {
      await createGroup({ name, description: description.trim() || undefined });
    } catch (err) {
      setError(err);
      setCreating(false);
      return;
    }
    const { failed } = await runForEach(members, (m) => addGroupMember(name, m));
    setCreating(false);
    if (failed.length > 0) {
      setPartialFailure(failed);
      return;
    }
    addToast(
      members.length
        ? `Group created with ${members.length} ${members.length === 1 ? "person" : "people"}`
        : "Group created",
    );
    finish();
  };

  const finish = () => {
    onCreated(name);
    onClose();
  };

  if (partialFailure.length > 0) {
    return (
      <Modal title="Group created" onClose={finish}>
        <Banner tone="warning">
          The group was created, but these people couldn't be added: {partialFailure.join(", ")}.
          You can add them from the group page.
        </Banner>
        <div className="modal-actions">
          <button className="btn btn-primary" onClick={finish}>
            Go to group
          </button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      title="Create a group"
      description="Groups bundle people together, for example a team, department or project, so you can give them access in one go."
      onClose={onClose}
      size="lg"
    >
      {error !== null && <ErrorBanner error={error} />}
      <form onSubmit={handleSubmit}>
        <div className="form-row">
          <div className="form-group">
            <label htmlFor="group-label">What is this group for?</label>
            <input
              id="group-label"
              type="text"
              placeholder="e.g. Marketing team"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
            />
          </div>
          <div className="form-group">
            <label htmlFor="group-name">Group name</label>
            <input
              id="group-name"
              type="text"
              required
              pattern={NAME_PATTERN}
              placeholder="marketing-team"
              value={name}
              onChange={(e) => {
                setName(e.target.value.toLowerCase());
                setNameEdited(true);
              }}
            />
            <p className={`field-hint${name && !nameValid ? " field-error" : ""}`}>
              {name && !nameValid
                ? "Use lowercase letters, numbers, dots or dashes, starting with a letter."
                : "A short, unique name used behind the scenes."}
            </p>
          </div>
        </div>
        <div className="form-group">
          <label htmlFor="group-description">
            Description <span className="optional">optional</span>
          </label>
          <input
            id="group-description"
            type="text"
            placeholder="Who belongs here and what it gives access to"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
        <div className="form-group">
          <label>
            Add people now <span className="optional">optional</span>
          </label>
          {users.loading ? (
            <LoadingState />
          ) : (
            <PickerList
              options={personOptions(users.data ?? [])}
              selected={members}
              onChange={setMembers}
              searchPlaceholder="Search people…"
              emptyMessage="There's nobody to add yet."
              maxHeight={200}
            />
          )}
        </div>
        <div className="modal-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={creating || !nameValid}>
            {creating ? "Creating…" : "Create group"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function EditGroupModal({
  group,
  onClose,
  onSaved,
}: {
  group: KanidmEntry;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { addToast } = useToast();
  const [description, setDescription] = useState(attrVal(group, "description"));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await updateGroup(entryName(group), { description: description.trim() || undefined });
      addToast("Group updated");
      onSaved();
      onClose();
    } catch (err) {
      setError(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title="Edit group" onClose={onClose}>
      {error !== null && <ErrorBanner error={error} />}
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label>Group name</label>
          <input type="text" value={entryName(group)} disabled />
        </div>
        <div className="form-group">
          <label htmlFor="edit-group-description">Description</label>
          <input
            id="edit-group-description"
            type="text"
            placeholder="Who belongs here and what it gives access to"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
        <div className="modal-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
