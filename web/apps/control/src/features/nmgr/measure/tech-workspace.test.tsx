/** @vitest-environment jsdom */
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { TechWorkspace } from "./tech-workspace";
beforeEach(() => {
  window.history.replaceState(
    null,
    "",
    "/v2/guardrails?role=tech#Profile/measure/",
  );
  localStorage.clear();
  vi.stubGlobal("fetch", vi.fn());
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it("restores trend comparison on reload and browser back", async () => {
  const view = render(<TechWorkspace />);
  fireEvent.click(screen.getByRole("button", { name: "View Throughput" }));
  fireEvent.change(screen.getByLabelText("Comparison"), {
    target: { value: "mom" },
  });
  view.unmount();
  render(<TechWorkspace />);
  expect((screen.getByLabelText("Comparison") as HTMLSelectElement).value).toBe(
    "mom",
  );
  expect(
    screen.getByRole("heading", { name: "Throughput Trend", level: 2 }),
  ).toBeTruthy();
  await act(async () => window.history.back());
  expect(
    await screen.findByRole("heading", { name: "Tech Overview" }),
  ).toBeTruthy();
  expect(fetch).not.toHaveBeenCalled();
});
it("previews all three feedback categories and closure without inventing or persisting a record", () => {
  render(<TechWorkspace />);
  fireEvent.change(screen.getByLabelText("Feedback category"), {
    target: { value: "False-negative" },
  });
  fireEvent.click(screen.getByRole("button", { name: "All feedback" }));
  fireEvent.click(
    screen.getByRole("button", { name: "Preview feedback review" }),
  );
  fireEvent.click(screen.getByRole("button", { name: /^Close feedback$/ }));
  expect(
    (
      screen.getByRole("button", {
        name: "Preview closure",
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
  fireEvent.change(screen.getByLabelText("Closure comment"), {
    target: { value: "Review comment entered by user" },
  });
  fireEvent.change(screen.getByLabelText("JIRA ticket"), {
    target: { value: "TEAM-42" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Preview closure" }));
  expect(
    screen.getByText("Preview only · No request has been closed."),
  ).toBeTruthy();
  expect(screen.getByText("TEAM-42")).toBeTruthy();
  expect(localStorage.length).toBe(0);
  expect(fetch).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Back to All Feedback" }));
  expect(
    (screen.getByLabelText("Feedback category") as HTMLSelectElement).value,
  ).toBe("False-negative");
});
it("shows only placeholders for model and runner data and resets scroll on navigation", () => {
  render(<TechWorkspace />);
  document.documentElement.scrollTop = 500;
  fireEvent.click(screen.getByRole("button", { name: "View Runners" }));
  expect(document.documentElement.scrollTop).toBe(0);
  fireEvent.click(
    screen.getByRole("button", { name: "Preview runner status" }),
  );
  expect(screen.getByRole("heading", { name: "Runner Status" })).toBeTruthy();
  expect(screen.getAllByText("Data not available").length).toBeGreaterThan(0);
  expect(screen.queryByText("326 / 500")).toBeNull();
  expect(fetch).not.toHaveBeenCalled();
});
