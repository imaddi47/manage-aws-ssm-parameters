export default function DetailPanel({ secret, onReveal, onEdit, onDelete }) {
  if (!secret) return <p className="muted">Select a parameter.</p>;
  return (
    <div className="detail">
      <h2>{secret.name}</h2>
      <p>Type: {secret.type}</p>
      <div className="actions">
        <button onClick={onReveal}>Reveal value</button>
        <button onClick={onEdit}>Edit</button>
        <button className="danger" onClick={onDelete}>Delete</button>
      </div>
    </div>
  );
}
