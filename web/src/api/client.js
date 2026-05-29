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

export function listSecrets(path = "/") {
  const qs = new URLSearchParams({ path }).toString();
  return fetch(`/api/secrets?${qs}`).then(handle);
}

export function revealSecret(name) {
  const qs = new URLSearchParams({ name }).toString();
  return fetch(`/api/secrets/value?${qs}`).then(handle);
}

export function saveSecret({ name, value, type = "SecureString" }, passphrase) {
  return fetch("/api/secrets", {
    method: "POST",
    headers: { ...JSON_HEADERS, "X-SSM-Passphrase": passphrase },
    body: JSON.stringify({ name, value, type }),
  }).then(handle);
}

export function deleteSecret(name, passphrase) {
  const qs = new URLSearchParams({ name }).toString();
  return fetch(`/api/secrets?${qs}`, {
    method: "DELETE",
    headers: { "X-SSM-Passphrase": passphrase },
  }).then(handle);
}
