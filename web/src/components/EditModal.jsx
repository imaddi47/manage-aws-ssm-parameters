import { useEffect, useState } from "react";

export default function EditModal({ open, mode, initialName = "", onSave, onClose }) {
  const [name, setName] = useState(initialName);
  const [value, setValue] = useState("");
  const [type, setType] = useState("SecureString");
  const [passphrase, setPassphrase] = useState("");
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setName(initialName);
      setValue("");
      setType("SecureString");
      setPassphrase("");
      setError(null);
      setSaving(false);
    }
  }, [open, initialName]);

  if (!open) return null;

  const canSave = name.trim() && value.length > 0 && passphrase.length > 0 && !saving;

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await onSave({ name: name.trim(), value, type }, passphrase);
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop">
      <form className="modal" onSubmit={submit}>
        <h3>{mode === "edit" ? "Update value" : "Create parameter"}</h3>
        <label>
          Name
          <input value={name} onChange={(e) => setName(e.target.value)} readOnly={mode === "edit"} />
        </label>
        <label>
          Value
          <input type="password" value={value} onChange={(e) => setValue(e.target.value)} />
        </label>
        <label>
          Type
          <select value={type} onChange={(e) => setType(e.target.value)}>
            <option>SecureString</option>
            <option>String</option>
            <option>StringList</option>
          </select>
        </label>
        <label>
          Passphrase
          <input type="password" value={passphrase} onChange={(e) => setPassphrase(e.target.value)} />
        </label>
        {error && <p className="error">{error}</p>}
        <div className="actions">
          <button type="submit" disabled={!canSave}>{saving ? "Saving…" : "Save"}</button>
          <button type="button" onClick={onClose}>Cancel</button>
        </div>
      </form>
    </div>
  );
}
