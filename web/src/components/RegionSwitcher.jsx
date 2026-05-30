/**
 * Curated AWS region dropdown.
 * @param {{ regions: string[], value: string, onChange: (region: string) => void }} props
 */
export default function RegionSwitcher({ regions, value, onChange }) {
  return (
    <label className="region">
      <span className="dot" />
      <select value={value} onChange={(e) => onChange(e.target.value)} aria-label="AWS region">
        {regions.map((r) => (
          <option key={r} value={r}>{r}</option>
        ))}
      </select>
    </label>
  );
}
