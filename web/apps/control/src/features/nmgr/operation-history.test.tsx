/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { seed, reviseEntity, transition } from "./model";
import { OperationHistory, signoffHistory } from "./operation-history";
afterEach(cleanup);

it("retains my actual approval timestamps through subsequent revisions and excludes other approvers", () => {
  let state = seed();
  const profile = state.entities.find((item) => item.kind === "Profile")!;
  state = reviseEntity(state, profile, "User");
  state = transition(state, profile.id, "request", "User");
  state = transition(state, profile.id, "approve", "User Admin", {
    actorName: "Feng ZONG",
  });
  const approval = state.audit[0]!;
  state = reviseEntity(
    state,
    state.entities.find((item) => item.id === profile.id)!,
    "User",
  );
  state.audit.unshift({
    ...approval,
    id: "other-approval",
    actor: "Another Approver",
  });
  const history = signoffHistory(state, "Profile", "ISS", "Feng ZONG");
  expect(
    history.some(
      ({ entry }) => entry.id === approval.id && entry.time === approval.time,
    ),
  ).toBe(true);
  expect(history.some(({ entry }) => entry.id === "other-approval")).toBe(
    false,
  );
  expect(
    history.find(({ entry }) => entry.id === approval.id)?.item.status,
  ).toBe("DRAFT");
  expect(signoffHistory(state, "Guardrail", "RMG", "Feng ZONG")).toEqual([]);
});

it.each(["Guardrail", "Profile"] as const)(
  "renders collapsed %s history with sign-off time first and working detail links",
  (kind) => {
    const open = vi.fn();
    const { container } = render(
      <OperationHistory
        state={seed()}
        kind={kind}
        controlUnit="ISS"
        actor="Feng ZONG"
        onOpen={open}
      />,
    );
    const details = container.querySelector("details")!;
    expect(details.open).toBe(false);
    fireEvent.click(screen.getByText("Operation History"));
    expect(details.open).toBe(true);
    expect(
      screen.getAllByRole("columnheader").map((cell) => cell.textContent),
    ).toEqual([
      "Sign-Off Time",
      kind,
      "Status",
      "Ctrl Unit",
      "Last Modified",
      "Action",
    ]);
    fireEvent.click(screen.getAllByRole("button", { name: "View" })[0]!);
    expect(open).toHaveBeenCalled();
  },
);
