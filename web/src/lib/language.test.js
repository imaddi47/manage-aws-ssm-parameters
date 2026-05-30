import { describe, it, expect } from "vitest";
import { languageIdForName } from "./language.js";

describe("languageIdForName", () => {
  it("maps shell scripts", () => {
    expect(languageIdForName("/x/init-script.sh")).toBe("shell");
  });
  it("maps json", () => {
    expect(languageIdForName("config.json")).toBe("json");
  });
  it("maps ini and conf", () => {
    expect(languageIdForName("pgbouncer.ini")).toBe("ini");
    expect(languageIdForName("pg_hba.conf")).toBe("ini");
  });
  it("maps yaml", () => {
    expect(languageIdForName("stack.yaml")).toBe("yaml");
  });
  it("falls back to plain", () => {
    expect(languageIdForName("userlist.txt")).toBe("plain");
    expect(languageIdForName("noext")).toBe("plain");
  });
});
