import {
  SSMClient,
  GetParametersByPathCommand,
  GetParameterCommand,
  PutParameterCommand,
  DeleteParameterCommand,
} from "@aws-sdk/client-ssm";
import { resolveCredentials, resolveRegion } from "./credentials.js";

export function makeClient({ region, profile } = {}) {
  return new SSMClient({
    region: resolveRegion({ region }),
    credentials: resolveCredentials({ profile }),
  });
}

export async function listSecrets(client, { path = "/", recursive = true } = {}) {
  const out = [];
  let NextToken;
  do {
    const res = await client.send(
      new GetParametersByPathCommand({
        Path: path,
        Recursive: recursive,
        WithDecryption: false,
        NextToken,
      })
    );
    for (const p of res.Parameters ?? []) out.push({ name: p.Name, type: p.Type });
    NextToken = res.NextToken;
  } while (NextToken);
  return out;
}

export async function getSecret(client, name) {
  const res = await client.send(
    new GetParameterCommand({ Name: name, WithDecryption: true })
  );
  const p = res.Parameter;
  return { name: p.Name, value: p.Value, type: p.Type, version: p.Version };
}

export async function saveSecret(client, { name, value, type = "SecureString" }) {
  const res = await client.send(
    new PutParameterCommand({ Name: name, Value: value, Type: type, Overwrite: true })
  );
  return { name, version: res.Version };
}

export async function deleteSecret(client, name) {
  await client.send(new DeleteParameterCommand({ Name: name }));
  return { name };
}
