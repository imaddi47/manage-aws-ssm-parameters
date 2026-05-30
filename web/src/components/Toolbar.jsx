import RegionSwitcher from "./RegionSwitcher.jsx";

/**
 * Top bar: brand, region switcher, and client-side search box.
 * @param {{ regions: string[], region: string, onRegionChange: (r: string) => void,
 *   query: string, onQueryChange: (q: string) => void }} props
 */
export default function Toolbar({ regions, region, onRegionChange, query, onQueryChange }) {
  return (
    <div className="toolbar">
      <span className="brand">SSM&nbsp;Secrets</span>
      <RegionSwitcher regions={regions} value={region} onChange={onRegionChange} />
      <input
        className="search"
        placeholder="Search parameters…"
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        aria-label="Search parameters"
      />
    </div>
  );
}
