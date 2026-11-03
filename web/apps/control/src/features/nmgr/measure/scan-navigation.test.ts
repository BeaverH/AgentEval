import { describe, expect, it } from "vitest";
import {
  readScanLocation,
  scanHash,
  scanParent,
  scanHome,
  validScanLocation,
} from "./scan-navigation";

describe("Measure navigation", () => {
  it("round-trips Guardrail selection, decision filters and list position without becoming an entity ID", () => {
    const location = {
      ...scanHome,
      view: "guardrail" as const,
      guardrail: "Guardrail XXXX",
      origin: "guardrails" as const,
      decision: "Blocked" as const,
      query: "XXXX",
      listPage: 2,
    };
    const hash = scanHash(location);
    expect(hash.split("?")[0]).toBe("#Profile/measure/");
    expect(readScanLocation(hash)).toEqual(location);
    expect(scanParent(location)).toMatchObject({
      view: "guardrails",
      decision: "Blocked",
      query: "XXXX",
      listPage: 2,
    });
    expect(scanParent({ ...location, origin: "overview" })).toMatchObject({
      view: "overview",
    });
  });
  it("keeps Agent Policy scans scoped to the Agent and reconstructs the complete return chain", () => {
    const scan = readScanLocation(
      "#Profile/measure/?view=scan&event=customer-verifier%2F12356%2F1&source=agent&origin=agents&listPage=2&eventPage=2&decision=Modified",
    );
    expect(scan).toMatchObject({
      policy: "12356",
      agent: "customer-verifier",
      guardrail: "Guardrail XXXX",
    });
    const policy = scanParent(scan);
    expect(policy).toMatchObject({
      view: "policy",
      agent: "customer-verifier",
      eventPage: 2,
    });
    const agent = scanParent(policy);
    expect(agent).toMatchObject({ view: "agent", agent: "customer-verifier" });
    expect(scanParent(agent)).toMatchObject({ view: "agents", listPage: 2 });
  });
  it("rejects unknown records and prevents conflicting event metadata", () => {
    const missing = readScanLocation(
      "#Profile/measure/?view=guardrail&guardrail=missing",
    );
    expect(validScanLocation(missing)).toBe(false);
    const scan = readScanLocation(
      "#Profile/measure/?view=scan&event=customer-verifier%2F12356%2F1&policy=12198&agent=missing&source=agent",
    );
    expect(scan.policy).toBe("12356");
    expect(scan.agent).toBe("customer-verifier");
    expect(
      readScanLocation("#Profile/measure/?view=bad&listPage=-4&decision=bad"),
    ).toEqual(scanHome);
  });
});
