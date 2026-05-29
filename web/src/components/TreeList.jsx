/**
 * Selectable list of parameters (name + type).
 * @param {{ items: Array<{ name: string, type: string }>, selected: string|null, onSelect: (name: string) => void }} props
 */
export default function TreeList({ items, selected, onSelect }) {
  if (!items.length) return <p className="muted">No parameters found.</p>;
  return (
    <ul className="tree">
      {items.map((it) => (
        <li
          key={it.name}
          className={it.name === selected ? "tree-item selected" : "tree-item"}
          onClick={() => onSelect(it.name)}
        >
          <span className="tree-name">{it.name}</span>
          <span className="tree-type">{it.type}</span>
        </li>
      ))}
    </ul>
  );
}
