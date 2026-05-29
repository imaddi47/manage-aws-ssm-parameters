const JSON_HEADERS = { "Content-Type": "application/json" };

async function handle(res) {
  let body = {};
  try {
    body = await res.json();
  } catch {
    body = {};
  }
  if (!res.ok || body.ok === false) {
    throw new Error(body.error || `Request failed (${res.status})`);
  }
  return body.data;
}

/**
 * List parameters under a path (names + types only; not decrypted).
 * @param {string} [path]
 * @returns {Promise<Array<{ name: string, type: string }>>}
 */
export function listSecrets(path = "/") {
  const qs = new URLSearchParams({ path }).toString();
  return fetch(`/api/secrets?${qs}`).then(handle);
}

/**
 * Fetch a single decrypted parameter value.
 * @param {string} name
 * @returns {Promise<{ name: string, value: string, type: string, version: number }>}
 */
export function revealSecret(name) {
  const qs = new URLSearchParams({ name }).toString();
  return fetch(`/api/secrets/value?${qs}`).then(handle);
}

/**
 * Create or update a parameter (requires the passphrase).
 * @param {{ name: string, value: string, type?: string }} params
 * @param {string} passphrase
 * @returns {Promise<{ name: string, version: number }>}
 */
export function saveSecret({ name, value, type = "SecureString" }, passphrase) {
  return fetch("/api/secrets", {
    method: "POST",
    headers: { ...JSON_HEADERS, "X-SSM-Passphrase": passphrase },
    body: JSON.stringify({ name, value, type }),
  }).then(handle);
}

/**
 * Delete a parameter (requires the passphrase).
 * @param {string} name
 * @param {string} passphrase
 * @returns {Promise<{ name: string }>}
 */
export function deleteSecret(name, passphrase) {
  const qs = new URLSearchParams({ name }).toString();
  return fetch(`/api/secrets?${qs}`, {
    method: "DELETE",
    headers: { "X-SSM-Passphrase": passphrase },
  }).then(handle);
}
