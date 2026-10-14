import { describe, expect, it } from "vitest";
import {
  seed,
  transition,
  addEntity,
  editEntity,
  reviseEntity,
  allowed,
  accounts,
  canAuthor,
  type Kind,
  type State,
} from "./model";
const test = { dataset: "Acceptance", cases: 24 };
function draft(kind: Kind) {
  const state = seed();
  const item = state.entities.find((e) => e.kind === kind)!;
  return { id: item.id, state: reviseEntity(state, item, "User") };
}
function configure(state: State, id: string) {
  const e = state.entities.find((e) => e.id === id)!;
  return transition(state, id, "implement", "IT Admin", {
    policies: e.policies,
    ...(e.config ? { config: e.config } : {}),
  });
}
describe.each(["Guardrail"] as Kind[])("%s role workflow", (kind) => {
  it("requires technical testing, business request, approval and technical deployment", () => {
    let { state, id } = draft(kind);
    expect(state.entities.find((e) => e.id === id)?.status).toBe("DRAFT");
    for (const role of accounts) {
      expect(canAuthor(role)).toBe(role === "User");
      expect(
        allowed(
          state.entities.find((e) => e.id === id)!,
          "implement",
          role,
        ),
      ).toBe(role === "IT Admin");
      expect(() => transition(state, id, "deploy", role)).toThrow();
    }
    state = configure(state, id);
    expect(() => transition(state, id, "test-pass", "User", test)).toThrow();
    state = transition(state, id, "test-fail", "IT Admin", test);
    expect(() => transition(state, id, "request", "User")).toThrow();
    expect(() => transition(state, id, "test-pass", "User", test)).toThrow();
    state = transition(state, id, "test-pass", "IT Admin", test);
    expect(() => transition(state, id, "test-pass", "User", test)).toThrow();
    expect(() => transition(state, id, "request", "IT Admin")).toThrow();
    state = transition(state, id, "request", "User");
    for (const role of accounts)
      expect(
        allowed(
          state.entities.find((e) => e.id === id)!,
          "test-pass",
          role,
        ),
      ).toBe(false);
    expect(() => transition(state, id, "approve", "User")).toThrow();
    state = transition(state, id, "approve", "User Admin");
    expect(() => transition(state, id, "deploy", "User Admin")).toThrow();
    state = transition(state, id, "deploy", "IT Admin");
    expect(state.entities.find((e) => e.id === id)).toMatchObject({
      status: "DEPLOYED",
      version: 2,
      deployed: 2,
      signedBy: "User Admin",
    });
  });
  it.each(["edit", "withdraw", "reject", "reconfigure"])(
    "invalidates technical evidence after %s while retaining history",
    (action) => {
      let { state, id } = draft(kind);
      state = configure(state, id);
      state = transition(state, id, "test-pass", "IT Admin", test);
      if (action === "edit")
        state = editEntity(
          state,
          {
            ...state.entities.find((e) => e.id === id)!,
            description: "Updated requirements",
          },
          "User",
        );
      if (action === "withdraw")
        state = transition(state, id, "withdraw", "User");
      if (action === "reject") {
        state = transition(state, id, "request", "User");
        state = transition(state, id, "reject", "User Admin", {
          reason: "Review coverage",
        });
      }
      if (action === "reconfigure") {
        state = transition(state, id, "test-fail", "IT Admin", test);
        state = configure(state, id);
      }
      if (["edit", "withdraw"].includes(action)) state = configure(state, id);
      expect(
        state.entities.find((e) => e.id === id)!.runs.length,
      ).toBeGreaterThan(1);
      expect(() => transition(state, id, "test-pass", "User", test)).toThrow();
      expect(() => transition(state, id, "request", "User")).toThrow();
      state = transition(state, id, "test-pass", "IT Admin", test);
      expect(
        allowed(
          state.entities.find((e) => e.id === id)!,
          "request",
          "User",
        ),
      ).toBe(true);
    },
  );
});
it("validates references, mandatory bindings, threshold and duplicate IDs", () => {
  const state = seed(),
    p = state.entities.find((e) => e.kind === "Profile")!,
    g = state.entities[0]!;
  expect(() => addEntity(state, p)).toThrow("taken");
  expect(() =>
    addEntity(state, { ...p, id: "new-profile", refs: ["missing"] }),
  ).toThrow("deployed");
  for (const threshold of [NaN, -1, 101])
    expect(() =>
      addEntity(state, { ...p, id: "new-profile", threshold }),
    ).toThrow("threshold");
  const mandatory = { ...g, mandatory: true };
  expect(() =>
    addEntity(
      { ...state, entities: [mandatory, ...state.entities.slice(1)] },
      { ...p, id: "new-profile", refs: [] },
    ),
  ).toThrow();
  expect(() =>
    addEntity(state, { ...p, id: "new-profile" }, "User Admin"),
  ).toThrow("Only User");
});
it("preserves deployed snapshots and prevents business edits from changing technical configuration", () => {
  const state = seed(),
    old = state.entities[0]!;
  const next = reviseEntity(
    state,
    {
      ...old,
      config: { ...old.config!, content: "changed" },
      policies: ["changed"],
    },
    "User",
  );
  const item = next.entities.find((e) => e.id === old.id)!;
  expect(item).toMatchObject({
    status: "DRAFT",
    version: 2,
    deployed: 1,
    config: old.config,
    policies: old.policies,
  });
  expect(item.revisions?.[1]?.name).toBe(old.name);
  expect(item.runs).toEqual(old.runs);
});

it("activates Profiles on approval without technical testing or deployment", () => {
  let { state, id } = draft("Profile");
  for (const role of accounts)
    for (const action of ["implement", "test-pass", "deploy"] as const)
      expect(() => transition(state, id, action, role, test)).toThrow();
  state = transition(state, id, "request", "User");
  state = transition(state, id, "reject", "User Admin", {
    reason: "Clarify scope",
  });
  expect(state.entities.find((e) => e.id === id)?.status).toBe("DRAFT");
  state = transition(state, id, "request", "User");
  state = transition(state, id, "approve", "User Admin");
  expect(state.entities.find((e) => e.id === id)).toMatchObject({
    status: "SIGNED OFF",
    deployed: 2,
    runs: [],
  });
});
