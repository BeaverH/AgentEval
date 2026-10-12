# NMGR prototype Demo

Based on NMGR.drawio. Enabled through `vite.preview.config.ts` with `TALI_UI_DEMO=true` at `/guardrails`. Navigation uses URL fragments so every workspace view and detail can be bookmarked without replacing the existing production route map.

- Guardrail and Profile terminology follows the prototype; the legacy catalog uses different internal names.
- `model.ts` owns role checks, lifecycle transitions, version activation and audit records. `app.tsx` shares lists, details, forms, test reports and confirmation sheets across both entity kinds. `shell.tsx` reuses the v0.2.17 Sidebar primitives, BrandMark, project selector appearance, top bar and shared AccountMenu presentation. Forms, details and workflow actions use the existing right-side Sheet (600px maximum). Button, Input, Textarea and global theme tokens are reused.
- Browser storage key: `nmgr-prototype-v1`. No backend calls, database, inference or real deployments are used.
- Switch user offers Admin, ISS, LCS and RMG. Admin can exercise all valid workflow steps; control units author, test and operate profiles. Retired account labels in saved ownership, sign-off and audit actors migrate to Admin; configurations, action IDs, times and evidence are retained. A cached removed account falls back to Admin. This mapping is a Demo assumption, not production authentication. The selected account is stored under `nmgr-owner` and recorded in action audit entries.
- Guardrails start in DRAFT. Profiles start TEST READY. Tests must pass on the current revision before signoff; rejection returns TEST READY; editing clears test evidence. Revisions preserve the deployed version. Guardrail deployments apply to active referencing profiles.
- Open prototype decisions represented in this Demo: a single jurisdiction or ALL per entity; BU/SU, agent type and data type are collected but no traffic matching engine is simulated; rejection requires a reason; Profile bindings select deployed Guardrails and include applicable mandatory Guardrails.
- LangSmith is a local sample dataset option, not an external integration. Custom JSON requires an array of {input, expected} objects. Test outcomes are explicitly simulated and can demonstrate failure.
- Dashboard and detection logs are an illustrative snapshot recomputed from deployed profiles and their current mode. They are not historical monitoring data. Audit logs record user actions. Alert threshold is interpreted as the detection error percentage.

Verification: lifecycle tests in model.test.ts, Vite preview production build, browser create -> implement -> test -> request -> approve -> failed deployment -> successful deployment, runtime Block all -> dashboard, desktop and narrow layout inspection.

Hierarchy: a Profile references Guardrail IDs; each Guardrail contains Policies. The Profile picker displays Guardrail versions and expandable Policies, enforces required Guardrails, and never binds a Profile directly to an individual Policy.

Studio revisions and monitoring:

- Test records are retained across edits, withdrawal and revisions, with version filtering and pagination. Historical passes never grant sign-off to an untested revision; existing records already deleted by older prototype code cannot be reconstructed.
- Modify opens a prefilled configuration form. Saving validates and creates the next revision atomically; cancellation does not create a revision. Admin can edit Guardrail Policies and the reused v0.2.17 scanner configuration form. Control units edit business requirements; Tech configures in the implementation step.
- Revision snapshots preserve the deployed Guardrail configuration and scope while its next revision is edited. Profiles monitor deployed bindings, not draft refs.
- Deployed Profile details include Monitoring: snapshot metrics, sortable Guardrail table, expandable activity, outcome filters and trace details. All traffic is deterministic synthetic data; dashboard and detection logs use the same source. Existing Normal / Pass all / Block all semantics are retained.
- Detail and form sheets support dragging the left edge, keyboard arrows and persisted widths. Internal scrollbars reserve space across tabs.

Final mock walkthrough (2026-10-13):

- Profile alert thresholds are entered at creation/edit (0–100%, decimals allowed), validated before testing and sign-off, and displayed read-only during deployment. Deployed snapshots preserve the active threshold and scope while the next revision is edited.
- `mock-data.ts` adds four configured Guardrails and three multi-binding Profiles in Normal, Pass all and Block all modes. Fixtures include failed/passed test records and creation, implementation, request, approval, deployment and mode-change audit evidence. Only missing fixture IDs are added to saved workspaces; existing configurations and history are retained.
- Synthetic activity timestamps never exceed the current snapshot time. Changing a runtime mode clears old selected trace details and outcome filters. Trace details identify the Profile, Guardrail, result and latency.
- Browser walkthrough used `gr-walkthrough-20261013` and `pf-walkthrough-20261013`, including failed/retried tests, rejection with a required reason, approval, failed/retried deployment and Profile creation with a 7.5% threshold. These records remain in browser storage as reviewable evidence.
- Remaining product decisions: a production alert time window; department-specific approver authorization (current accounts simulate roles); historical traffic retention (current traffic is a synthetic snapshot, recomputed on mode/version changes). Deployment-failure demonstration shows an error but does not persist a failed deployment audit entry.
- Revision branch was also checked in the browser: cancelling retained v1 and its 7.5% threshold; saving v2 with a 15% threshold and deliberately failing its test retained active v1 at 7.5%. Profile test records can be filtered by version.
- Workflow gap against the requested business process: Profiles currently start TEST READY with author-selected deployed Guardrails; there is no separate Profile Tech configuration/acceptance step. Department-specific approvers are also not modeled.
- Metric caveat: Detected aggregates include Blocked, including forced Block all results. Treating forced blocks as risk detections needs a separate product decision.

UI review (2026-10-13):

- Dashboard Alerts show INFO for an individual Detected event, WARNING for an individual Blocked or Error event, and CRITICAL when a Profile's snapshot error percentage is strictly greater than its deployed threshold. These are explicit demo rules, available beside the Level column. Forced Block all and Pass all modes do not create policy-risk alerts.
- Alert Details include the rule, reason and evidence. Only single-event alerts have a View activity button; it opens the exact Monitoring Profile, Guardrail and Check details, including after refreshing the bookmarked URL. Aggregate alerts have no navigation button. Alerts never navigate to Activity Log.
- Activity Log supports keyword search and simple entity/profile, action/decision, actor (audit only) and time-range filters, with result counts and a clear-filters action.
- Opening and closing a repository detail preserves the current page and filters. Guardrail Studio filter grids share aligned columns across Repository, Test Base and Sign-Off. Technical configuration Policies and Used by Profiles scroll within their module when there are more than three entries.
- INFO alerts are collapsed initially. Level, Profile ID and Guardrail ID column buttons combine filters; selecting INFO opens that group. A circular Back to Alerts board button appears in Check details after an alert jump, preserving the board's filters and expanding/highlighting the original alert row on return. Refreshed activity links also support returning to their alert.
- Monitoring Profile names show CRITICAL and WARNING alert counts in rounded squares, using the same colors and unfiltered alert source as the board. INFO is excluded from these two counts.
