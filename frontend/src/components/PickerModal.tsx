import { useState } from "react";
import type { ReactNode } from "react";
import Modal from "./Modal";
import PickerList from "./PickerList";
import type { PickerOption } from "./PickerList";

/** A modal that asks the admin to choose from a searchable list, then confirms. */
export default function PickerModal({
  title,
  description,
  options,
  multiple = true,
  searchPlaceholder,
  emptyMessage,
  confirmLabel,
  onConfirm,
  onClose,
}: {
  title: string;
  description?: ReactNode;
  options: PickerOption[];
  multiple?: boolean;
  searchPlaceholder: string;
  emptyMessage: string;
  confirmLabel: (count: number) => string;
  /** Return false to keep the modal open (for example after a failure). */
  onConfirm: (selected: string[]) => Promise<boolean | void> | boolean | void;
  onClose: () => void;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const handleConfirm = async () => {
    setBusy(true);
    try {
      const keepOpen = (await onConfirm(selected)) === false;
      if (!keepOpen) onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={title} description={description} onClose={onClose}>
      <PickerList
        options={options}
        selected={selected}
        onChange={setSelected}
        multiple={multiple}
        searchPlaceholder={searchPlaceholder}
        emptyMessage={emptyMessage}
      />
      <div className="modal-actions">
        <button className="btn btn-secondary" onClick={onClose} disabled={busy}>
          Cancel
        </button>
        <button
          className="btn btn-primary"
          onClick={handleConfirm}
          disabled={busy || selected.length === 0}
        >
          {busy ? "Working…" : confirmLabel(selected.length)}
        </button>
      </div>
    </Modal>
  );
}
