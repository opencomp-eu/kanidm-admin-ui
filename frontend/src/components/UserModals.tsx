import { useState } from "react";
import Modal from "./Modal";
import { createUser, generateResetToken } from "../api";
import { useToast } from "./Layout";

export function CreateUserModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const { addToast } = useToast();
  const [form, setForm] = useState({ name: "", displayname: "", mail: "" });
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [created, setCreated] = useState<{ username: string; resetUrl: string } | null>(
    null,
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setError("");
    try {
      await createUser(form);
      const username = form.name;
      onCreated();
      try {
        const result = await generateResetToken(username);
        setCreated({ username, resetUrl: result.reset_url });
      } catch {
        onClose();
        addToast("User created");
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setCreating(false);
    }
  };

  if (created) {
    return (
      <ResetLinkModal
        title="User Created"
        intro={`${created.username} has been created. Share this password reset link:`}
        url={created.resetUrl}
        onClose={onClose}
      />
    );
  }

  return (
    <Modal title="Create User" onClose={onClose}>
      {error && <div className="error">{error}</div>}
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label>Username</label>
          <input
            type="text"
            required
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          />
        </div>
        <div className="form-group">
          <label>Display Name</label>
          <input
            type="text"
            required
            value={form.displayname}
            onChange={(e) => setForm((f) => ({ ...f, displayname: e.target.value }))}
          />
        </div>
        <div className="form-group">
          <label>Email</label>
          <input
            type="email"
            value={form.mail}
            onChange={(e) => setForm((f) => ({ ...f, mail: e.target.value }))}
          />
        </div>
        <div className="modal-actions">
          <button type="button" className="btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn-primary" disabled={creating}>
            {creating ? "Creating..." : "Create"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function ResetLinkModal({
  title,
  intro,
  url,
  onClose,
}: {
  title: string;
  intro: string;
  url: string;
  onClose: () => void;
}) {
  const { addToast } = useToast();

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      addToast("Reset URL copied to clipboard");
    } catch {
      addToast("Failed to copy", "error");
    }
  };

  return (
    <Modal title={title} onClose={onClose}>
      <p style={{ color: "var(--text-muted)", fontSize: 14, marginBottom: 12 }}>
        {intro}
      </p>
      <div
        style={{
          background: "var(--bg-secondary)",
          padding: "12px",
          borderRadius: "6px",
          fontFamily: "monospace",
          fontSize: 13,
          wordBreak: "break-all",
        }}
      >
        {url}
      </div>
      <div style={{ marginTop: 10 }}>
        <button className="btn-copy" onClick={handleCopy}>
          Copy URL
        </button>
      </div>
      <p style={{ color: "var(--text-muted)", fontSize: 12, marginTop: 8 }}>
        This token is single-use and expires after 1 hour.
      </p>
      <div className="modal-actions">
        <button className="btn-ghost" onClick={onClose}>
          Done
        </button>
      </div>
    </Modal>
  );
}
