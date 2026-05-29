import { useEffect, useState } from "react";

export default function DeleteModal({ open, name, onConfirm, onClose }) {
  const [confirmName, setConfirmName] = useState("");
  const [passphrase, setPassphrase] = useState("");
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setConfirmName("");
      setPassphrase("");
      setError(null);
      setBusy(false);
    }
  }, [open]);

  if (!open) return null;

  const canDelete = confirmName === name && passphrase.length > 0 && !busy;

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await onConfirm(passphrase);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop">
      <div className="modal">
        <h3>Delete parameter</h3>
        <p>Type the full name to confirm: <code>{name}</code></p>
        <label>
          Name
          <input value={confirmName} onChange={(e) => setConfirmName(e.target.value)} />
        </label>
        <label>
          Passphrase
          <input type="password" value={passphrase} onChange={(e) => setPassphrase(e.target.value)} />
        </label>
        {error && <p className="error">{error}</p>}
        <div className="actions">
          <button className="danger" onClick={submit} disabled={!canDelete}>
            {busy ? "Deleting…" : "Delete"}
          </button>
          <button onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
