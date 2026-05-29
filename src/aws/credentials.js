import { fromEnv, fromIni } from "@aws-sdk/credential-providers";

export function resolveCredentials({ profile } = {}) {
  const hasEnvCreds = Boolean(
    process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
  );
  if (hasEnvCreds) return fromEnv();
  return fromIni({ profile: profile || process.env.AWS_PROFILE || "default" });
}

export function resolveRegion({ region } = {}) {
  return (
    region ||
    process.env.AWS_REGION ||
    process.env.AWS_DEFAULT_REGION ||
    "us-east-1"
  );
}
