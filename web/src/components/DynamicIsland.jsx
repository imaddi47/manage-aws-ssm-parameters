import { useEffect, useState } from "react";

const STATE_CLASS = {
  idle: "s-idle",
  revealConfirm: "s-confirm",
  passphrase: "s-passphrase",
  deleteConfirm: "s-delete",
  busy: "s-idle",
  saved: "s-saved",
  error: "s-error",
};

/**
 * Morphing status/command pill. Renders the current operation `state` and emits
 * events. Never displays a decrypted value; passphrase input is masked.
 * @param {{ state: { kind: string, [k: string]: any },
 *   onConfirmReveal: () => void,
 *   onSubmitPassphrase: (pw: string) => void,
 *   onConfirmDelete: (typedName: string, pw: string) => void,
 *   onCancel: () => void }} props
 */
export default function DynamicIsland({ state, onConfirmReveal, onSubmitPassphrase, onConfirmDelete, onCancel }) {
  const [pw, setPw] = useState("");
  const [typed, setTyped] = useState("");
  useEffect(() => {
    setPw("");
    setTyped("");
  }, [state.kind, state.leaf]);

  const { kind } = state;
  const expanded = kind === "revealConfirm" || kind === "passphrase" || kind === "deleteConfirm";
  const cls = `island ${expanded ? "expanded" : ""} ${STATE_CLASS[kind] || "s-idle"}`;

  return (
    <div className={cls} role="status">
      <span className="mini" />
      {kind === "idle" && <span>{state.region} · {state.count} parameters</span>}
      {kind === "busy" && <span>{state.label}…</span>}
      {kind === "saved" && <span>Saved v{state.version} ✓</span>}
      {kind === "error" && <span className="error">{state.message}</span>}

      {kind === "revealConfirm" && (
        <>
          <span>Reveal <strong>{state.leaf}</strong>?</span>
          <div className="row">
            <button className="primary" onClick={onConfirmReveal}>Reveal</button>
            <button onClick={onCancel}>Cancel</button>
          </div>
        </>
      )}

      {kind === "passphrase" && (
        <>
          <span>{state.label || "Passphrase to save"}</span>
          <div className="row">
            <input
              type="password"
              value={pw}
              autoFocus
              placeholder="passphrase"
              aria-label="Passphrase"
              onChange={(e) => setPw(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && pw) onSubmitPassphrase(pw); }}
            />
            <button className="primary" disabled={!pw} onClick={() => onSubmitPassphrase(pw)}>Confirm</button>
            <button onClick={onCancel}>Cancel</button>
          </div>
        </>
      )}

      {kind === "deleteConfirm" && (
        <>
          <span>Type <strong>{state.leaf}</strong> + passphrase to delete</span>
          <div className="row">
            <input value={typed} autoFocus placeholder="name" aria-label="Confirm name" onChange={(e) => setTyped(e.target.value)} />
            <input type="password" value={pw} placeholder="passphrase" aria-label="Passphrase" onChange={(e) => setPw(e.target.value)} />
            <button className="danger" disabled={typed !== state.leaf || !pw} onClick={() => onConfirmDelete(typed, pw)}>Delete</button>
            <button onClick={onCancel}>Cancel</button>
          </div>
        </>
      )}
    </div>
  );
}
