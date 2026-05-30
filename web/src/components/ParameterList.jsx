import { splitParamName } from "../lib/paramName.js";
import { LockIcon } from "./icons.jsx";

/**
 * Grouped parameter list — parent path shown as a group header, leaf bold.
 * Filters client-side by `query` (matches the full name).
 * @param {{ items: Array<{ name: string, type: string }>, selected: string|null, query?: string, onSelect: (name: string) => void }} props
 */
export default function ParameterList({ items, selected, query = "", onSelect }) {
  const q = query.trim().toLowerCase();
  const filtered = q ? items.filter((it) => it.name.toLowerCase().includes(q)) : items;
  if (!filtered.length) return <p className="muted" style={{ padding: 10 }}>No parameters.</p>;

  const groups = new Map();
  for (const it of filtered) {
    const { group, leaf } = splitParamName(it.name);
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group).push({ ...it, leaf });
  }

  return (
    <div>
      {[...groups.entries()].map(([group, rows]) => (
        <div key={group || "(root)"}>
          <div className="grp">{group || "/"}</div>
          {rows.map((it) => {
            const secure = it.type === "SecureString";
            return (
              <div
                key={it.name}
                className={it.name === selected ? "item active" : "item"}
                onClick={() => onSelect(it.name)}
              >
                <span className="leaf">{it.leaf}</span>
                <span className={secure ? "ptype is-secure" : "ptype"}>
                  {secure && <LockIcon />}
                  {it.type}
                </span>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
