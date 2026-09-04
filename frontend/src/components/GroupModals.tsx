import { useState } from "react";
import Modal from "./Modal";
import { createGroup } from "../api";
import { useToast } from "./Layout";

export function CreateGroupModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const { addToast } = useToast();
  const [form, setForm] = useState({ name: "", description: "" });
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setError("");
    try {
      await createGroup(form);
      onCreated();
      addToast("Group created");
      onClose();
    } catch (e) {
      setError(String(e));
    } finally {
      setCreating(false);
    }
  };

  return (
    <Modal title="Create Group" onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label>Name</label>
          <input
            type="text"
            required
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          />
        </div>
        <div className="form-group">
          <label>Description</label>
          <input
            type="text"
            value={form.description}
            onChange={(e) =>
              setForm((f) => ({ ...f, description: e.target.value }))
            }
          />
        </div>
        {error && <div className="error">{error}</div>}
        <div className="modal-actions">
          <button
            type="button"
            className="btn-ghost"
            onClick={onClose}
          >
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
