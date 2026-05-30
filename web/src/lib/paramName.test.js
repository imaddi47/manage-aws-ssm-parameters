import { describe, it, expect } from "vitest";
import { splitParamName } from "./paramName.js";

describe("splitParamName", () => {
  it("splits the parent path from the leaf", () => {
    expect(splitParamName("/toddle/x/init-script.sh")).toEqual({
      group: "/toddle/x",
      leaf: "init-script.sh",
    });
  });
  it("handles a single leading slash", () => {
    expect(splitParamName("/top")).toEqual({ group: "", leaf: "top" });
  });
  it("handles a name with no slash", () => {
    expect(splitParamName("solo")).toEqual({ group: "", leaf: "solo" });
  });
});
