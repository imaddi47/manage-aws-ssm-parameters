import { EC2Client, DescribeRegionsCommand } from "@aws-sdk/client-ec2";
import { resolveCredentials, resolveRegion } from "./credentials.js";

/**
 * Build an EC2 client (used only for region discovery). Credentials and the
 * default region resolve through the same path as the SSM client.
 * @param {{ region?: string, profile?: string }} [opts]
 * @returns {EC2Client}
 */
export function makeEc2Client({ region, profile } = {}) {
  return new EC2Client({
    region: resolveRegion({ region }),
    credentials: resolveCredentials({ profile }),
  });
}

/**
 * List the AWS regions enabled for the account (excludes opt-in regions that
 * have not been enabled), sorted by region code.
 * @param {EC2Client} client
 * @returns {Promise<string[]>}
 */
export async function listEnabledRegions(client) {
  const res = await client.send(
    new DescribeRegionsCommand({
      Filters: [{ Name: "opt-in-status", Values: ["opt-in-not-required", "opted-in"] }],
    })
  );
  return (res.Regions ?? [])
    .map((r) => r.RegionName)
    .filter(Boolean)
    .sort();
}
