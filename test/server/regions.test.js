import { test } from "node:test";
import assert from "node:assert/strict";
import { AWS_REGIONS, DEFAULT_REGION, isAllowedRegion } from "../../src/server/regions.js";

test("DEFAULT_REGION is part of AWS_REGIONS", () => {
  assert.ok(AWS_REGIONS.includes(DEFAULT_REGION));
});

test("isAllowedRegion accepts a known region", () => {
  assert.equal(isAllowedRegion("eu-west-1"), true);
});

test("isAllowedRegion rejects unknown values", () => {
  assert.equal(isAllowedRegion("moon-1"), false);
  assert.equal(isAllowedRegion(undefined), false);
  assert.equal(isAllowedRegion(""), false);
});
