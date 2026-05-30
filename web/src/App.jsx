import { useCallback, useEffect, useRef, useState } from "react";
import * as api from "./api/client.js";
import { splitParamName } from "./lib/paramName.js";
import Toolbar from "./components/Toolbar.jsx";
import ParameterList from "./components/ParameterList.jsx";
import DetailPanel from "./components/DetailPanel.jsx";
import DynamicIsland from "./components/DynamicIsland.jsx";
import { useSidebar } from "./lib/useSidebar.js";

const leafOf = (name) => splitParamName(name || "").leaf;

/**
 * Root admin UI: regions + list loading, selection, and the reveal/edit/create/
 * delete operation state machine that drives the DetailPanel and DynamicIsland.
 */
export default function App() {
  const [regions, setRegions] = useState([]);
  const [region, setRegion] = useState("us-east-1");
  const [items, setItems] = useState([]);
  const [selected, setSelected] = useState(null);
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState("idle"); // idle | view | edit | create
  const [value, setValue] = useState("");
  const [editorName, setEditorName] = useState("");
  const [nameInput, setNameInput] = useState("");
  const [island, setIsland] = useState({ kind: "idle", region: "us-east-1", count: 0 });
  const [error, setError] = useState(null);
  const sidebar = useSidebar();

  const itemsRef = useRef(items);
  itemsRef.current = items;
  const regionRef = useRef(region);
  regionRef.current = region;

  // Monotonic operation id. Starting any user action bumps it, which invalidates
  // the in-flight continuations of earlier actions (a late reveal/edit response,
  // the post-save timer) so a stale async result can't clobber newer UI state or
  // re-surface a decrypted value the user has already navigated away from.
  const opRef = useRef(0);
  const beginOp = useCallback(() => {
    opRef.current += 1;
    return opRef.current;
  }, []);

  const goIdle = useCallback(() => {
    setIsland({ kind: "idle", region: regionRef.current, count: itemsRef.current.length });
  }, []);

  const loadList = useCallback(async (r) => {
    try {
      const data = await api.listSecrets("/", r);
      setItems(data);
      itemsRef.current = data;
      setError(null);
      setIsland({ kind: "idle", region: r, count: data.length });
    } catch (e) {
      setError(e.message);
      setIsland({ kind: "error", message: e.message });
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const { regions: list, default: def } = await api.getRegions();
        setRegions(list);
        setRegion(def);
        regionRef.current = def;
        await loadList(def);
      } catch (e) {
        setError(e.message);
      }
    })();
  }, [loadList]);

  const selectedSecret = items.find((i) => i.name === selected) || null;

  function onRegionChange(r) {
    beginOp();
    setRegion(r);
    regionRef.current = r;
    setSelected(null);
    setMode("idle");
    setValue("");
    loadList(r);
  }

  function onSelect(name) {
    beginOp();
    setSelected(name);
    setMode("idle");
    setValue("");
    goIdle();
  }

  function onReveal() {
    if (!selected) return;
    beginOp();
    setIsland({ kind: "revealConfirm", leaf: leafOf(selected) });
  }

  async function onConfirmReveal() {
    const gen = beginOp();
    try {
      setIsland({ kind: "busy", label: "Revealing" });
      const data = await api.revealSecret(selected, regionRef.current);
      if (opRef.current !== gen) return;
      setValue(data.value);
      setEditorName(selected);
      setMode("view");
      goIdle();
    } catch (e) {
      if (opRef.current !== gen) return;
      setIsland({ kind: "error", message: e.message });
    }
  }

  async function onEdit() {
    if (!selected) return;
    const gen = beginOp();
    try {
      setIsland({ kind: "busy", label: "Loading" });
      const data = await api.revealSecret(selected, regionRef.current); // auto-load (audited reveal)
      if (opRef.current !== gen) return;
      setValue(data.value);
      setEditorName(selected);
      setMode("edit");
      goIdle();
    } catch (e) {
      if (opRef.current !== gen) return;
      setIsland({ kind: "error", message: e.message });
    }
  }

  function onNew() {
    beginOp();
    setSelected(null);
    setNameInput("");
    setValue("");
    setMode("create");
    goIdle();
  }

  function onSaveRequest() {
    const name = mode === "create" ? nameInput.trim() : selected;
    if (!name) return;
    beginOp();
    setIsland({ kind: "passphrase", label: `Passphrase to save ${leafOf(name)}` });
  }

  async function onSubmitPassphrase(pw) {
    const name = mode === "create" ? nameInput.trim() : selected;
    const gen = beginOp();
    try {
      setIsland({ kind: "busy", label: "Saving" });
      const res = await api.saveSecret({ name, value, type: "SecureString" }, pw, regionRef.current);
      await loadList(regionRef.current);
      if (opRef.current !== gen) return;
      setSelected(name);
      setEditorName(name);
      setMode("view");
      setIsland({ kind: "saved", version: res.version });
      setTimeout(() => {
        if (opRef.current === gen) goIdle();
      }, 1600);
    } catch (e) {
      if (opRef.current !== gen) return;
      setIsland({ kind: "error", message: e.message });
    }
  }

  function onDelete() {
    if (!selected) return;
    beginOp();
    setIsland({ kind: "deleteConfirm", leaf: leafOf(selected) });
  }

  async function onConfirmDelete(_typed, pw) {
    const gen = beginOp();
    try {
      setIsland({ kind: "busy", label: "Deleting" });
      await api.deleteSecret(selected, pw, regionRef.current);
      await loadList(regionRef.current);
      if (opRef.current !== gen) return;
      setSelected(null);
      setMode("idle");
      setValue("");
    } catch (e) {
      if (opRef.current !== gen) return;
      setIsland({ kind: "error", message: e.message });
    }
  }

  function detailCancel() {
    beginOp();
    setMode("idle");
    setValue("");
    goIdle();
  }

  return (
    <div className="app">
      <Toolbar
        regions={regions}
        region={region}
        onRegionChange={onRegionChange}
        onNew={onNew}
        query={query}
        onQueryChange={setQuery}
        sidebarCollapsed={sidebar.collapsed}
        onToggleSidebar={sidebar.toggle}
      />
      {error && <p className="error" style={{ padding: "6px 16px" }}>{error}</p>}
      <div
        className="layout"
        style={{ gridTemplateColumns: sidebar.collapsed ? "1fr" : `${sidebar.width}px 1fr` }}
      >
        <aside className="sidebar" data-collapsed={sidebar.collapsed ? "" : undefined}>
          <ParameterList items={items} selected={selected} query={query} onSelect={onSelect} />
        </aside>
        {!sidebar.collapsed && (
          <div
            className="resizer"
            style={{ left: `${sidebar.width}px` }}
            onMouseDown={sidebar.startResize}
            onDoubleClick={sidebar.reset}
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize sidebar (double-click to reset)"
          />
        )}
        <section className="content">
          <DetailPanel
            secret={selectedSecret}
            mode={mode}
            editorName={editorName}
            value={value}
            nameInput={nameInput}
            onNameInput={setNameInput}
            onValueChange={setValue}
            onReveal={onReveal}
            onEdit={onEdit}
            onDelete={onDelete}
            onSave={onSaveRequest}
            onCancel={detailCancel}
          />
        </section>
      </div>
      <DynamicIsland
        state={island}
        onConfirmReveal={onConfirmReveal}
        onSubmitPassphrase={onSubmitPassphrase}
        onConfirmDelete={onConfirmDelete}
        onCancel={goIdle}
      />
    </div>
  );
}
