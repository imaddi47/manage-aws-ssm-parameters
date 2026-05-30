import { useEffect, useRef, useState } from "react";

/**
 * AWS region picker: a pill trigger that opens a type-to-filter dropdown.
 * The region list is supplied by the parent (fetched from the server).
 * @param {{ regions: string[], value: string, onChange: (region: string) => void }} props
 */
export default function RegionSwitcher({ regions, value, onChange }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef(null);

  // Close on outside click while open.
  useEffect(() => {
    if (!open) return undefined;
    const onDocMouseDown = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [open]);

  const q = query.trim().toLowerCase();
  const filtered = q ? regions.filter((r) => r.toLowerCase().includes(q)) : regions;

  function select(region) {
    onChange(region);
    setOpen(false);
    setQuery("");
  }

  return (
    <div className="region" ref={rootRef} data-open={open ? "" : undefined}>
      <span className="dot" />
      <button
        type="button"
        className="region-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="AWS region"
        onClick={() => setOpen((o) => !o)}
      >
        {value}
      </button>
      {open && (
        <div className="region-pop">
          <input
            className="region-filter"
            type="text"
            autoFocus
            placeholder="Filter regions…"
            value={query}
            aria-label="Filter regions"
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setOpen(false);
              if (e.key === "Enter" && filtered.length) select(filtered[0]);
            }}
          />
          <ul className="region-list" role="listbox" aria-label="Regions">
            {filtered.length === 0 && <li className="region-empty">No matches</li>}
            {filtered.map((r) => (
              <li key={r}>
                <button
                  type="button"
                  role="option"
                  aria-selected={r === value}
                  className={r === value ? "region-opt active" : "region-opt"}
                  onClick={() => select(r)}
                >
                  {r}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
