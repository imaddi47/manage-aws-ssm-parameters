import RegionSwitcher from "./RegionSwitcher.jsx";
import ThemeToggle from "./ThemeToggle.jsx";

const PanelIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <line x1="9" y1="4" x2="9" y2="20" />
  </svg>
);

/**
 * Top bar: sidebar toggle, brand, region switcher, a Create action, client-side
 * search, and the light/dark theme toggle.
 * @param {{ regions: string[], region: string, onRegionChange: (r: string) => void,
 *   onNew: () => void, query: string, onQueryChange: (q: string) => void,
 *   sidebarCollapsed: boolean, onToggleSidebar: () => void }} props
 */
export default function Toolbar({
  regions,
  region,
  onRegionChange,
  onNew,
  query,
  onQueryChange,
  sidebarCollapsed,
  onToggleSidebar,
}) {
  return (
    <div className="toolbar">
      <button
        type="button"
        className="icon-btn"
        onClick={onToggleSidebar}
        aria-label={sidebarCollapsed ? "Show sidebar" : "Hide sidebar"}
        aria-pressed={!sidebarCollapsed}
        title={sidebarCollapsed ? "Show sidebar" : "Hide sidebar"}
      >
        <PanelIcon />
      </button>
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
