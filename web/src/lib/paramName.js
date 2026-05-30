/**
 * Split an SSM parameter name into its parent path ("group") and leaf segment.
 * @param {string} name e.g. "/toddle/x/init-script.sh"
 * @returns {{ group: string, leaf: string }} e.g. { group: "/toddle/x", leaf: "init-script.sh" }
 */
export function splitParamName(name) {
  const clean = String(name || "");
  const i = clean.lastIndexOf("/");
  if (i < 0) return { group: "", leaf: clean };
  return { group: clean.slice(0, i), leaf: clean.slice(i + 1) };
}
