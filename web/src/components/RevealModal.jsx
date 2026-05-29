import { useEffect, useState } from "react";

/**
 * Modal that reveals a decrypted value after an explicit confirm; clears the
 * value from state when closed.
 * @param {{ open: boolean, name: string|null, reveal: (name: string) => Promise<{ value: string }>, onClose: () => void }} props
 */
export default function RevealModal({ open, name, reveal, onClose }) {
  const [value, setValue] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) {
      setValue(null);
      setError(null);
      setLoading(false);
    }
  }, [open]);

  if (!open) return null;

  async function onConfirm() {
    setLoading(true);
    setError(null);
    try {
      const data = await reveal(name);
      setValue(data.value);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="modal-backdrop">
      <div className="modal">
        <h3>Reveal value</h3>
        <p>{name}</p>
        {value === null ? (
          <button onClick={onConfirm} disabled={loading}>
            {loading ? "Revealing…" : "Confirm reveal"}
          </button>
        ) : (
          <div>
            <pre className="value">{value}</pre>
            <button onClick={() => navigator.clipboard?.writeText(value)}>Copy</button>
          </div>
        )}
        {error && <p className="error">{error}</p>}
        <button onClick={onClose}>Close</button>
      </div>
    </div>
  );
}
