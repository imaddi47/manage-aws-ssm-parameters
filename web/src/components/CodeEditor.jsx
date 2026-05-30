import { useEffect, useRef } from "react";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap, lineNumbers } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { json } from "@codemirror/lang-json";
import { yaml } from "@codemirror/lang-yaml";
import { StreamLanguage } from "@codemirror/language";
import { shell } from "@codemirror/legacy-modes/mode/shell";
import { properties } from "@codemirror/legacy-modes/mode/properties";
import { languageIdForName } from "../lib/language.js";

function languageExtension(id) {
  switch (id) {
    case "json": return json();
    case "yaml": return yaml();
    case "shell": return StreamLanguage.define(shell);
    case "ini": return StreamLanguage.define(properties);
    default: return [];
  }
}

const darkTheme = EditorView.theme(
  {
    "&": { backgroundColor: "transparent", color: "#e5e7eb", fontSize: "13px" },
    ".cm-content": { fontFamily: "var(--font-mono)" },
    ".cm-gutters": { backgroundColor: "transparent", color: "#374151", border: "none" },
    "&.cm-focused": { outline: "none" },
  },
  { dark: true }
);

/**
 * CodeMirror 6 editor. Language is chosen from the parameter name's extension.
 * @param {{ name: string, value: string, readOnly?: boolean, onChange?: (v: string) => void }} props
 */
export default function CodeEditor({ name, value, readOnly = false, onChange }) {
  const hostRef = useRef(null);
  const viewRef = useRef(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // Rebuild when the language (name) or readOnly changes.
  useEffect(() => {
    if (!hostRef.current) return undefined;
    const state = EditorState.create({
      doc: value ?? "",
      extensions: [
        lineNumbers(),
        history(),
        keymap.of([...defaultKeymap, ...historyKeymap]),
        languageExtension(languageIdForName(name)),
        darkTheme,
        EditorView.editable.of(!readOnly),
        EditorState.readOnly.of(readOnly),
        EditorView.updateListener.of((u) => {
          if (u.docChanged && onChangeRef.current) onChangeRef.current(u.state.doc.toString());
        }),
      ],
    });
    const view = new EditorView({ state, parent: hostRef.current });
    viewRef.current = view;
    return () => view.destroy();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, readOnly]);

  // Sync external value changes (loading a different param) without rebuilding.
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (value != null && value !== current) {
      view.dispatch({ changes: { from: 0, to: current.length, insert: value } });
    }
  }, [value]);

  return <div className="editor-host" ref={hostRef} />;
}
