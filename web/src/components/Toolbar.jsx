import RegionSwitcher from "./RegionSwitcher.jsx";
import ThemeToggle from "./ThemeToggle.jsx";

/**
 * Top bar: brand, region switcher, a Create action, client-side search, and the
 * light/dark theme toggle.
 * @param {{ regions: string[], region: string, onRegionChange: (r: string) => void,
 *   onNew: () => void, query: string, onQueryChange: (q: string) => void }} props
 */
export default function Toolbar({ regions, region, onRegionChange, onNew, query, onQueryChange }) {
  return (
    <div className="toolbar">
      <span className="brand">SSM&nbsp;Secrets</span>
      <RegionSwitcher regions={regions} value={region} onChange={onRegionChange} />
      <button type="button" className="primary" onClick={onNew}>New</button>
      <input
        className="search"
        placeholder="Search parameters…"
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        aria-label="Search parameters"
      />
      <ThemeToggle />
    </div>
  );
}
