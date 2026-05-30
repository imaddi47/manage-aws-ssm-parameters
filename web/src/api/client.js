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

function qs(params) {
  const clean = Object.fromEntries(Object.entries(params).filter(([, v]) => v != null && v !== ""));
  return new URLSearchParams(clean).toString();
}

/** @returns {Promise<{ regions: string[], default: string }>} */
export function getRegions() {
  return fetch("/api/regions").then(handle);
}

/**
 * @param {string} [path]
 * @param {string} [region]
 * @returns {Promise<Array<{ name: string, type: string }>>}
 */
export function listSecrets(path = "/", region) {
  return fetch(`/api/secrets?${qs({ path, region })}`).then(handle);
}

/**
 * @param {string} name
 * @param {string} [region]
 * @returns {Promise<{ name: string, value: string, type: string, version: number }>}
 */
export function revealSecret(name, region) {
  return fetch(`/api/secrets/value?${qs({ name, region })}`).then(handle);
}

/**
 * @param {{ name: string, value: string, type?: string }} params
 * @param {string} passphrase
 * @param {string} [region]
 * @returns {Promise<{ name: string, version: number }>}
 */
export function saveSecret({ name, value, type = "SecureString" }, passphrase, region) {
  return fetch("/api/secrets", {
    method: "POST",
    headers: { ...JSON_HEADERS, "X-SSM-Passphrase": passphrase },
    body: JSON.stringify({ name, value, type, region }),
  }).then(handle);
}

/**
 * @param {string} name
 * @param {string} passphrase
 * @param {string} [region]
 * @returns {Promise<{ name: string }>}
 */
export function deleteSecret(name, passphrase, region) {
  return fetch(`/api/secrets?${qs({ name, region })}`, {
    method: "DELETE",
    headers: { "X-SSM-Passphrase": passphrase },
  }).then(handle);
}
