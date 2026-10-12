import { describe, expect, it } from "vitest";
import { seed } from "./model";
import { matchesFilters } from "./studio";

describe("Studio funnel filters", () => {
  const profile = {
    ...seed().entities.find((e) => e.kind === "Profile")!,
    unit: "ISS",
    status: "TEST READY" as const,
    location: "SG",
    attributes: { bu: "CBG", agent: "Customer", data: "Personal" },
  };
  it("unions values within each row and intersects different rows", () => {
    expect(
      matchesFilters(profile, {
        status: ["TEST READY", "TEST FAILED"],
        unit: ["RMG", "ISS"],
        bu: ["CBG"],
        location: ["SG"],
        agent: ["Customer"],
        data: ["Personal data"],
      }),
    ).toBe(true);
    expect(
      matchesFilters(profile, {
        status: ["TEST READY", "TEST FAILED"],
        unit: ["RMG"],
      }),
    ).toBe(false);
    expect(matchesFilters(profile, { bu: ["IBG"] })).toBe(false);
    expect(matchesFilters(profile, { agent: ["Employee"] })).toBe(false);
    expect(matchesFilters(profile, { data: ["Financial data"] })).toBe(false);
  });
  it("includes global scopes in specific region and attribute selections", () => {
    expect(
      matchesFilters(
        {
          ...profile,
          location: "ALL",
          attributes: { ...profile.attributes, bu: "ALL", agent: "ALL" },
        },
        { location: ["CN"], bu: ["IBG"], agent: ["Employee"] },
      ),
    ).toBe(true);
    expect(matchesFilters(profile, { location: ["CN"] })).toBe(false);
  });
  it("treats an empty row selection as unrestricted", () => {
    expect(matchesFilters(profile, { status: [], unit: [], data: [] })).toBe(
      true,
    );
  });
});
