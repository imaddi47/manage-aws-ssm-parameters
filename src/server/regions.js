/** Curated list of AWS regions offered by the UI region switcher. */
export const AWS_REGIONS = [
  "us-east-1",
  "us-east-2",
  "us-west-1",
  "us-west-2",
  "eu-west-1",
  "eu-west-2",
  "eu-central-1",
  "ap-south-1",
  "ap-southeast-1",
  "ap-southeast-2",
  "ap-northeast-1",
  "sa-east-1",
  "ca-central-1",
];

/** Default region when a request omits one. */
export const DEFAULT_REGION = "us-east-1";

/**
 * @param {unknown} region
 * @param {string[]} [allowed] - the set to validate against. Defaults to the
 *   curated static list; callers pass the dynamically-resolved set so the live
 *   account regions are the allowlist.
 * @returns {boolean} true if `region` is in `allowed`.
 */
export function isAllowedRegion(region, allowed = AWS_REGIONS) {
  return typeof region === "string" && allowed.includes(region);
}
