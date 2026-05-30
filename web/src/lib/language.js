/**
 * Map a parameter name's file extension to a language id. Pure (no CodeMirror
 * imports) so it is trivially unit-testable; CodeEditor maps the id to an extension.
 * @param {string} name
 * @returns {"shell"|"json"|"yaml"|"ini"|"plain"}
 */
export function languageIdForName(name) {
  const leaf = String(name || "").split("/").pop() || "";
  const dot = leaf.lastIndexOf(".");
  const ext = dot >= 0 ? leaf.slice(dot + 1).toLowerCase() : "";
  switch (ext) {
    case "sh":
    case "bash":
      return "shell";
    case "json":
      return "json";
    case "yaml":
    case "yml":
      return "yaml";
    case "ini":
    case "conf":
    case "cfg":
    case "properties":
      return "ini";
    default:
      return "plain";
  }
}
