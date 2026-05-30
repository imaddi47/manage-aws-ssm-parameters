import CodeEditor from "./CodeEditor.jsx";
import { splitParamName } from "../lib/paramName.js";

/**
 * Right-hand panel. Renders the selected parameter's header + actions and hosts
 * the CodeEditor. `mode` drives view/edit/create. All logic is delegated to App.
 * @param {{
 *   secret: { name: string, type: string } | null,
 *   mode: "idle" | "view" | "edit" | "create",
 *   editorName: string,
 *   value: string,
 *   nameInput: string,
 *   onNameInput: (v: string) => void,
 *   onValueChange: (v: string) => void,
 *   onReveal: () => void, onEdit: () => void, onDelete: () => void,
 *   onSave: () => void, onCancel: () => void
 * }} props
 */
export default function DetailPanel(props) {
  const {
    secret, mode, editorName, value, nameInput, onNameInput, onValueChange,
    onReveal, onEdit, onDelete, onSave, onCancel,
  } = props;

  if (mode === "create") {
    return (
      <div>
        <div className="title">New parameter</div>
        <div className="actions">
          <input className="search" style={{ width: 360 }} placeholder="/path/to/name" value={nameInput} aria-label="New name" onChange={(e) => onNameInput(e.target.value)} />
          <button className="primary" disabled={!nameInput.trim()} onClick={onSave}>Save</button>
          <button onClick={onCancel}>Cancel</button>
        </div>
        <CodeEditor name={nameInput || ""} value={value} readOnly={false} onChange={onValueChange} />
      </div>
    );
  }

  if (!secret) return <p className="muted">Select a parameter, or create a new one.</p>;

  const { group, leaf } = splitParamName(secret.name);
  const editing = mode === "edit";

  return (
    <div>
      <div className="crumb">{group || "/"}</div>
      <div className="title">{leaf} <span className="badge">{secret.type}</span></div>
      <div className="actions">
        {!editing && <button onClick={onReveal}>Reveal</button>}
        {!editing && <button className="primary" onClick={onEdit}>Edit</button>}
        {!editing && <button className="danger" onClick={onDelete}>Delete</button>}
        {editing && <button className="primary" onClick={onSave}>Save</button>}
        {editing && <button onClick={onCancel}>Cancel</button>}
      </div>
      {(mode === "view" || mode === "edit") && (
        <CodeEditor name={editorName} value={value} readOnly={mode === "view"} onChange={onValueChange} />
      )}
      {mode === "idle" && <p className="muted">Reveal to view the value, or Edit to load and change it.</p>}
    </div>
  );
}
