import { useEffect, useState } from "react";
import Modal from "./Modal";
import PickerList, { groupOptions } from "./PickerList";
import { ErrorBanner, LoadingState, Banner } from "./States";
import { useToast } from "./Toast";
import { createOAuth2App, grantAppAccess, listGroups, runForEach } from "../api";
import { isSystemEntry, isValidName, NAME_PATTERN, suggestName } from "../types";
import { useLoader } from "../hooks";

export function CreateAppModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (name: string) => void;
}) {
  const { addToast } = useToast();
  const [displayName, setDisplayName] = useState("");
  const [name, setName] = useState("");
  const [nameEdited, setNameEdited] = useState(false);
  const [origin, setOrigin] = useState("");
  const [accessGroups, setAccessGroups] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [partialFailure, setPartialFailure] = useState<{ name: string; groups: string[] } | null>(null);
  const groups = useLoader(listGroups, []);

  useEffect(() => {
    if (!nameEdited) setName(suggestName(displayName, "-"));
  }, [displayName, nameEdited]);

  const nameValid = isValidName(name);
  const originValid = /^https?:\/\/[^\s/]+/.test(origin.trim());

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setError(null);
    try {
      await createOAuth2App({ name, displayname: displayName.trim(), origin: origin.trim() });
    } catch (err) {
      setError(err);
      setCreating(false);
      return;
    }
    const { failed } = await runForEach(accessGroups, (g) => grantAppAccess(name, g));
    setCreating(false);
    if (failed.length > 0) {
      setPartialFailure({ name, groups: failed });
      return;
    }
    addToast(`${displayName.trim()} is connected`);
    onCreated(name);
  };

  if (partialFailure) {
    return (
      <Modal title="App connected" onClose={() => onCreated(partialFailure.name)}>
        <Banner tone="warning">
          The app was connected, but these groups couldn't be given access:{" "}
          {partialFailure.groups.join(", ")}. You can try again from the app's page.
        </Banner>
        <div className="modal-actions">
          <button className="btn btn-primary" onClick={() => onCreated(partialFailure.name)}>
            Go to app
          </button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      title="Connect an app"
      description="Let people sign in to another app (like a wiki, chat or file storage) with their company account. You'll usually get these details from whoever set up that app."
      onClose={onClose}
      size="lg"
    >
      {error !== null && <ErrorBanner error={error} />}
      <form onSubmit={handleSubmit}>
        <div className="form-row">
          <div className="form-group">
            <label htmlFor="app-display">App name</label>
            <input
              id="app-display"
              type="text"
              required
              placeholder="e.g. Company Wiki"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
            <p className="field-hint">Shown to people when they sign in.</p>
          </div>
          <div className="form-group">
            <label htmlFor="app-id">Client ID</label>
            <input
              id="app-id"
              type="text"
              required
              pattern={NAME_PATTERN}
              value={name}
              onChange={(e) => {
                setName(e.target.value.toLowerCase());
                setNameEdited(true);
              }}
            />
            <p className={`field-hint${name && !nameValid ? " field-error" : ""}`}>
              {name && !nameValid
                ? "Use lowercase letters, numbers, dots or dashes, starting with a letter."
                : "The app's settings will ask for this."}
            </p>
          </div>
        </div>
        <div className="form-group">
          <label htmlFor="app-origin">App address</label>
          <input
            id="app-origin"
            type="url"
            required
            placeholder="https://wiki.company.com"
            value={origin}
            onChange={(e) => setOrigin(e.target.value)}
          />
          <p className="field-hint">The web address people use to open the app.</p>
        </div>
        <div className="form-group">
          <label>
            Who can sign in? <span className="optional">recommended</span>
          </label>
          <p className="field-hint" style={{ marginTop: 0, marginBottom: 8 }}>
            Nobody can use the app until at least one group has access.
          </p>
          {groups.loading ? (
            <LoadingState />
          ) : (
            <PickerList
              options={groupOptions((groups.data ?? []).filter((g) => !isSystemEntry(g)))}
              selected={accessGroups}
              onChange={setAccessGroups}
              searchPlaceholder="Search groups…"
              emptyMessage="No groups yet. Create one first, then give it access."
              maxHeight={180}
            />
          )}
        </div>
        <div className="modal-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={creating || !nameValid || !originValid || !displayName.trim()}
          >
            {creating ? "Connecting…" : "Connect app"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
