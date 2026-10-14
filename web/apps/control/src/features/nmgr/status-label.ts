// Keep lifecycle values stable in storage and actions; format them at the UI boundary.
const labels: Record<string, string> = {
  DRAFT: "Draft",
  "TEST READY": "Test ready",
  "TEST FAILED": "Test failed",
  "TEST PASSED": "Test passed",
  "SIGNOFF REQUESTED": "Sign-off requested",
  "SIGNED OFF": "Signed off",
  DEPLOYED: "Deployed",
  PASSED: "Passed",
  FAILED: "Failed",
  CRITICAL: "Critical",
  WARNING: "Warning",
  INFO: "Info",
};
export const statusLabel = (value: string) => labels[value] ?? value;
