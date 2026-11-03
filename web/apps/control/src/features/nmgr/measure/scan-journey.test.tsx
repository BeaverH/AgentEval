/** @vitest-environment jsdom */
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
  waitFor,
  act,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Measure } from "./measure";
import { agents, policyHits, policyEvents } from "./measure-data";
import { measureStorageKey } from "./measure-store";

beforeEach(() => {
  localStorage.clear();
  window.history.replaceState(
    null,
    "",
    "/v2/guardrails?role=user#Profile/measure/",
  );
  document.documentElement.scrollTop = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(() => {
      throw new Error("Measure must stay offline");
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
function open() {
  return render(<Measure role="User" initialBusinessView="scans" />);
}
it("uses the existing V2 mock placeholders for the Guardrail path without making requests", async () => {
  open();
  expect(screen.getByRole("heading", { name: "Scan Overview" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "All Guardrails" }));
  fireEvent.change(screen.getByLabelText("Decision"), {
    target: { value: "Modified" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Guardrail XXXX" }));
  fireEvent.click(screen.getByRole("button", { name: "Policy #12356" }));
  const firstEvent = policyEvents(agents[0]!.id, policyHits[0]!.id)[0]!;
  fireEvent.click(
    screen.getByRole("button", { name: `View scan ${firstEvent.id}` }),
  );
  expect(screen.getByText(firstEvent.prompt)).toBeTruthy();
  expect(screen.getByRole("heading", { name: "Modified output" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Report" }));
  fireEvent.change(screen.getByLabelText("Feedback description"), {
    target: { value: "This is approved verification guidance." },
  });
  fireEvent.click(screen.getByRole("button", { name: "Submit feedback" }));
  expect(screen.getByRole("status").textContent).toContain(
    "Feedback submitted",
  );
  const saved = JSON.parse(localStorage.getItem(measureStorageKey)!);
  expect(
    saved.reports.some((r: { eventId: string }) => r.eventId === firstEvent.id),
  ).toBe(true);
  await screen.findByRole("heading", { name: "View Scan" });
  fireEvent.click(screen.getByRole("button", { name: "Back to Policy Scans" }));
  await screen.findByRole("heading", { name: "Guardrail Policy Scans" });
  expect((screen.getByLabelText("Decision") as HTMLSelectElement).value).toBe(
    "Modified",
  );
  expect(fetch).not.toHaveBeenCalled();
});
it("supports the Agent path, common feedback and a local-only Guardrail hang-up", async () => {
  open();
  fireEvent.click(screen.getByRole("button", { name: "All Agents" }));
  fireEvent.click(screen.getByRole("button", { name: agents[0]!.name }));
  fireEvent.click(screen.getByRole("button", { name: policyHits[0]!.policy }));
  fireEvent.click(screen.getAllByRole("button", { name: /^View scan/ })[0]!);
  fireEvent.click(screen.getByRole("button", { name: "Report" }));
  expect(
    (screen.getByLabelText(/False-Negative/) as HTMLInputElement).disabled,
  ).toBe(true);
  fireEvent.click(screen.getByLabelText(/Common Feedback/));
  fireEvent.change(screen.getByLabelText("Feedback description"), {
    target: { value: "Review the message wording." },
  });
  fireEvent.click(screen.getByRole("button", { name: "Submit feedback" }));
  expect(
    JSON.parse(localStorage.getItem(measureStorageKey)!).feedback[0].category,
  ).toBe("common");
  await screen.findByRole("heading", { name: "View Scan" });
  fireEvent.click(screen.getByRole("button", { name: "Back to Policy Scans" }));
  await screen.findByRole("heading", { name: "Guardrail Policy Scans" });
  fireEvent.click(screen.getByRole("button", { name: "Back to Agent Scans" }));
  await screen.findByRole("heading", { name: "Agent Scans" });
  expect(screen.getByRole("heading", { name: "Agent Scans" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Back to All Agents" }));
  await screen.findByRole("heading", { name: "All Agents" });
  fireEvent.click(screen.getByRole("button", { name: "Back to Overview" }));
  await screen.findByRole("heading", { name: "Scan Overview" });
  fireEvent.click(screen.getByRole("button", { name: "Guardrail XXXX" }));
  fireEvent.click(screen.getByRole("button", { name: "Hang up Guardrail" }));
  fireEvent.click(
    within(screen.getByRole("dialog")).getByRole("button", {
      name: "Confirm hang-up",
    }),
  );
  expect(
    JSON.parse(localStorage.getItem(measureStorageKey)!).suspendedGuardrails,
  ).toContain("Guardrail XXXX");
  expect(fetch).not.toHaveBeenCalled();
});
it("does not replace saved mock data or show success when local storage rejects feedback", () => {
  open();
  fireEvent.click(screen.getByRole("button", { name: "Guardrail XXXX" }));
  fireEvent.click(screen.getByRole("button", { name: "Policy #12356" }));
  fireEvent.click(screen.getAllByRole("button", { name: /^View scan/ })[0]!);
  fireEvent.click(screen.getByRole("button", { name: "Report" }));
  fireEvent.change(screen.getByLabelText("Feedback description"), {
    target: { value: "Please review" },
  });
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new Error("Full");
  });
  fireEvent.click(screen.getByRole("button", { name: "Submit feedback" }));
  expect(screen.getByRole("alert").textContent).toContain("could not be saved");
  expect(
    screen.getByRole("heading", { name: "Enhancement Feedback" }),
  ).toBeTruthy();
});
it("does not pretend to submit another false-positive report for an already reported example", () => {
  open();
  fireEvent.click(screen.getByRole("button", { name: "Guardrail XXXX" }));
  fireEvent.click(screen.getByRole("button", { name: "Policy #12356" }));
  fireEvent.click(screen.getAllByRole("button", { name: /^View scan/ })[1]!);
  fireEvent.click(screen.getByRole("button", { name: "Report" }));
  expect(
    (screen.getByLabelText(/False-Positive Detection/) as HTMLInputElement)
      .disabled,
  ).toBe(true);
  expect(
    (screen.getByLabelText(/Common Feedback/) as HTMLInputElement).checked,
  ).toBe(true);
  expect(screen.getByText(/already has a false-positive report/)).toBeTruthy();
});
it("shows hang-up storage failures inside the confirmation dialog", () => {
  open();
  fireEvent.click(screen.getByRole("button", { name: "Guardrail XXXX" }));
  fireEvent.click(screen.getByRole("button", { name: "Hang up Guardrail" }));
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new Error("Full");
  });
  fireEvent.click(
    within(screen.getByRole("dialog")).getByRole("button", {
      name: "Confirm hang-up",
    }),
  );
  expect(
    within(screen.getByRole("dialog")).getByRole("alert").textContent,
  ).toContain("could not be saved");
});

it("returns to the top after drilling down, returning, opening a policy and completing feedback", async () => {
  open();
  const navigate = async (name: string) => {
    document.documentElement.scrollTop = 850;
    fireEvent.click(screen.getByRole("button", { name }));
    await waitFor(() => expect(document.documentElement.scrollTop).toBe(0));
  };
  await navigate("All Agents");
  await navigate(agents[0]!.name);
  await navigate(policyHits[0]!.policy);
  await navigate(
    `View scan ${policyEvents(agents[0]!.id, policyHits[0]!.id)[0]!.id}`,
  );
  await navigate("Report");
  await navigate("Cancel");
  await navigate("Report");
  fireEvent.change(screen.getByLabelText("Feedback description"), {
    target: { value: "Please review this example." },
  });
  await navigate("Submit feedback");
  await navigate("Back to Policy Scans");
  await navigate("Back to Agent Scans");
  await navigate("Back to All Agents");
  document.documentElement.scrollTop = 850;
  fireEvent.change(screen.getByLabelText("Search Measure"), {
    target: { value: "Customer" },
  });
  expect(document.documentElement.scrollTop).toBe(850);
});

it("returns to the top when moving between table pages", () => {
  open();
  fireEvent.click(screen.getByRole("button", { name: "All Agents" }));
  document.documentElement.scrollTop = 850;
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  expect(document.documentElement.scrollTop).toBe(0);
  document.documentElement.scrollTop = 850;
  fireEvent.click(screen.getByRole("button", { name: "Previous" }));
  expect(document.documentElement.scrollTop).toBe(0);
});

it("restores a selected Guardrail on refresh and follows browser back and forward", async () => {
  const page = open();
  fireEvent.click(screen.getByRole("button", { name: "Guardrail XXXX" }));
  expect(window.location.hash).toContain("view=guardrail");
  expect(window.location.hash).toContain("Guardrail+XXXX");
  page.unmount();
  open();
  expect(screen.getByRole("heading", { name: "Guardrail Scans" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Policy #12356" }));
  await act(async () => window.history.back());
  await screen.findByRole("heading", { name: "Guardrail Scans" });
  await act(async () => window.history.forward());
  await screen.findByRole("heading", { name: "Guardrail Policy Scans" });
});

it("keeps an Agent policy scoped to its own scans and restores the original list page", async () => {
  open();
  fireEvent.click(screen.getByRole("button", { name: "All Agents" }));
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  const agent = agents[10]!;
  fireEvent.click(screen.getByRole("button", { name: agent.name }));
  fireEvent.click(screen.getByRole("button", { name: policyHits[0]!.policy }));
  expect(window.location.hash).toContain("view=policy");
  expect(
    screen
      .getAllByRole("button", { name: /^View scan/ })
      .every((button) => button.textContent?.startsWith(agent.id + "/")),
  ).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Back to Agent Scans" }));
  await screen.findByRole("heading", { name: "Agent Scans" });
  fireEvent.click(screen.getByRole("button", { name: "Back to All Agents" }));
  await screen.findByRole("heading", { name: "All Agents" });
  expect(screen.getByRole("button", { name: agent.name })).toBeTruthy();
  expect(window.location.hash).toContain("listPage=2");
});

it("shows a recoverable state for a missing bookmarked example", () => {
  window.history.replaceState(
    null,
    "",
    "#Profile/measure/?view=guardrail&guardrail=missing",
  );
  open();
  expect(
    screen.getByRole("heading", { name: "Scan unavailable" }),
  ).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Back to Overview" }));
  expect(screen.getByRole("heading", { name: "Scan Overview" })).toBeTruthy();
});

it("resets the decision and search together in the page and URL", () => {
  open();
  fireEvent.change(screen.getByLabelText("Decision"), {
    target: { value: "Blocked" },
  });
  fireEvent.change(screen.getByLabelText("Search Measure"), {
    target: { value: "XXXX" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Reset filters" }));
  expect((screen.getByLabelText("Decision") as HTMLSelectElement).value).toBe(
    "all",
  );
  expect(
    (screen.getByLabelText("Search Measure") as HTMLInputElement).value,
  ).toBe("");
  expect(window.location.hash).toBe("#Profile/measure/");
});

it("closes Guardrail confirmation when browser navigation leaves the selected Guardrail", async () => {
  open();
  fireEvent.click(screen.getByRole("button", { name: "Guardrail XXXX" }));
  fireEvent.click(screen.getByRole("button", { name: "Hang up Guardrail" }));
  expect(screen.getByRole("dialog")).toBeTruthy();
  await act(async () => window.history.back());
  await screen.findByRole("heading", { name: "Scan Overview" });
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(localStorage.getItem(measureStorageKey)).toBeNull();
});
