import { useEffect, useState, useCallback } from "react";
import * as api from "./api/client.js";
import TreeList from "./components/TreeList.jsx";
import DetailPanel from "./components/DetailPanel.jsx";
import RevealModal from "./components/RevealModal.jsx";
import EditModal from "./components/EditModal.jsx";
import DeleteModal from "./components/DeleteModal.jsx";

/**
 * Root admin UI: loads the parameter list and orchestrates the reveal / edit /
 * create / delete modals.
 */
export default function App() {
  const [items, setItems] = useState([]);
  const [selected, setSelected] = useState(null);
  const [error, setError] = useState(null);
  const [modal, setModal] = useState(null); // 'reveal' | 'edit' | 'create' | 'delete' | null

  const load = useCallback(async () => {
    try {
      setItems(await api.listSecrets("/"));
      setError(null);
    } catch (e) {
      setError(e.message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const selectedSecret = items.find((i) => i.name === selected) || null;

  return (
    <div className="app">
      <header>
        <h1>SSM Secrets Admin</h1>
        <button onClick={() => setModal("create")}>New parameter</button>
      </header>
      {error && <p className="error">{error}</p>}
      <main className="layout">
        <aside className="sidebar">
          <TreeList items={items} selected={selected} onSelect={setSelected} />
        </aside>
        <section className="content">
          <DetailPanel
            secret={selectedSecret}
            onReveal={() => setModal("reveal")}
            onEdit={() => setModal("edit")}
            onDelete={() => setModal("delete")}
          />
        </section>
      </main>

      <RevealModal
        open={modal === "reveal"}
        name={selected}
        reveal={api.revealSecret}
        onClose={() => setModal(null)}
      />
      <EditModal
        open={modal === "edit" || modal === "create"}
        mode={modal === "edit" ? "edit" : "create"}
        initialName={modal === "edit" ? selected || "" : ""}
        onSave={async (payload, passphrase) => {
          await api.saveSecret(payload, passphrase);
          setModal(null);
          await load();
        }}
        onClose={() => setModal(null)}
      />
      <DeleteModal
        open={modal === "delete"}
        name={selected}
        onConfirm={async (passphrase) => {
          await api.deleteSecret(selected, passphrase);
          setModal(null);
          setSelected(null);
          await load();
        }}
        onClose={() => setModal(null)}
      />
    </div>
  );
}
