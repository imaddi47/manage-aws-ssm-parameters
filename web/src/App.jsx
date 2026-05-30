import { useCallback, useEffect, useRef, useState } from "react";
import * as api from "./api/client.js";
import { splitParamName } from "./lib/paramName.js";
import Toolbar from "./components/Toolbar.jsx";
import ParameterList from "./components/ParameterList.jsx";
import DetailPanel from "./components/DetailPanel.jsx";
import DynamicIsland from "./components/DynamicIsland.jsx";

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

  const itemsRef = useRef(items);
  itemsRef.current = items;
  const regionRef = useRef(region);
  regionRef.current = region;

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
    setRegion(r);
    regionRef.current = r;
    setSelected(null);
    setMode("idle");
    setValue("");
    loadList(r);
  }

  function onSelect(name) {
    setSelected(name);
    setMode("idle");
    setValue("");
    goIdle();
  }

  function onReveal() {
    if (selected) setIsland({ kind: "revealConfirm", leaf: leafOf(selected) });
  }

  async function onConfirmReveal() {
    try {
      setIsland({ kind: "busy", label: "Revealing" });
      const data = await api.revealSecret(selected, regionRef.current);
      setValue(data.value);
      setEditorName(selected);
      setMode("view");
      goIdle();
    } catch (e) {
      setIsland({ kind: "error", message: e.message });
    }
  }

  async function onEdit() {
    if (!selected) return;
    try {
      setIsland({ kind: "busy", label: "Loading" });
      const data = await api.revealSecret(selected, regionRef.current); // auto-load (audited reveal)
      setValue(data.value);
      setEditorName(selected);
      setMode("edit");
      goIdle();
    } catch (e) {
      setIsland({ kind: "error", message: e.message });
    }
  }

  function onNew() {
    setSelected(null);
    setNameInput("");
    setValue("");
    setMode("create");
    goIdle();
  }

  function onSaveRequest() {
    const name = mode === "create" ? nameInput.trim() : selected;
    if (!name) return;
    setIsland({ kind: "passphrase", label: `Passphrase to save ${leafOf(name)}` });
  }

  async function onSubmitPassphrase(pw) {
    const name = mode === "create" ? nameInput.trim() : selected;
    try {
      setIsland({ kind: "busy", label: "Saving" });
      const res = await api.saveSecret({ name, value, type: "SecureString" }, pw, regionRef.current);
      await loadList(regionRef.current);
      setSelected(name);
      setEditorName(name);
      setMode("view");
      setIsland({ kind: "saved", version: res.version });
      setTimeout(goIdle, 1600);
    } catch (e) {
      setIsland({ kind: "error", message: e.message });
    }
  }

  function onDelete() {
    if (selected) setIsland({ kind: "deleteConfirm", leaf: leafOf(selected) });
  }

  async function onConfirmDelete(_typed, pw) {
    try {
      setIsland({ kind: "busy", label: "Deleting" });
      await api.deleteSecret(selected, pw, regionRef.current);
      setSelected(null);
      setMode("idle");
      setValue("");
      await loadList(regionRef.current);
    } catch (e) {
      setIsland({ kind: "error", message: e.message });
    }
  }

  function detailCancel() {
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
        query={query}
        onQueryChange={setQuery}
      />
      {error && <p className="error" style={{ padding: "6px 16px" }}>{error}</p>}
      <div className="layout">
        <aside className="sidebar">
          <ParameterList items={items} selected={selected} query={query} onSelect={onSelect} />
        </aside>
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
            onNew={onNew}
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
