# NMGR prototype Demo

Based on NMGR.drawio. Enabled through `vite.preview.config.ts` with `TALI_UI_DEMO=true` at `/guardrails`. Navigation uses URL fragments so every workspace view and detail can be bookmarked without replacing the existing production route map.

- Guardrail and Profile terminology follows the prototype; the legacy catalog uses different internal names.
- `model.ts` owns role checks, lifecycle transitions, version activation and audit records. `app.tsx` shares lists, details, forms, test reports and confirmation sheets across both entity kinds. `shell.tsx` reuses the v0.2.17 Sidebar primitives, BrandMark, Control Unit header, top bar and workbench selector. User and Approver details use full pages; technical actions and Profile forms reuse the existing right-side Sheet. Button, Input, Textarea and global theme tokens are reused.
- Browser storage key: `nmgr-three-role-v2`. No backend calls, database, inference or real deployments are used.
- Open prototype decisions represented in this Demo: a single jurisdiction or ALL per entity; BU/SU, agent type and data type are collected but no traffic matching engine is simulated; rejection requires a reason; Profile bindings select deployed Guardrails and include applicable mandatory Guardrails.
- LangSmith is a local sample dataset option, not an external integration. Custom JSON requires an array of {input, expected} objects. Test outcomes are explicitly simulated and can demonstrate failure.
- Dashboard and detection logs are an illustrative snapshot recomputed from deployed profiles and their current mode. They are not historical monitoring data. Audit logs record user actions. New Profiles configure a Block Rate or Pass Rate threshold and a positive whole-minute window (default: Block Rate > 10% in 5 minutes). The selected rate must strictly exceed the percentage; future and out-of-window events are excluded. Legacy Profiles without rate settings retain the scanner-error snapshot rule. Threshold settings are saved with each revision.
- Dashboard's top summary follows the prototype's scan table, deployed protection table, and request action layout. Scan totals filter the snapshot to the last ten minutes; Pass, Block, and Transfer count their corresponding results without treating detections or errors as transfers. Empty windows display zero. Deployed counts remain scoped to the current workbench.

Verification: lifecycle tests in model.test.ts, Vite preview production build, browser create -> implement -> test -> request -> approve -> failed deployment -> successful deployment, runtime Block all -> dashboard, desktop and narrow layout inspection.

Hierarchy: a Profile references Guardrail IDs; each Guardrail contains Policies. The Profile picker displays Guardrail versions and expandable Policies, enforces required Guardrails, and never binds a Profile directly to an individual Policy.

Studio revisions and monitoring:

- Test records are retained across edits, withdrawal and revisions, with version filtering and pagination. Historical passes never grant sign-off to an untested revision; existing records already deleted by older prototype code cannot be reconstructed.
- Modify opens a prefilled configuration form. Saving validates and creates the next revision atomically; cancellation does not create a revision. User edits business requirements; IT Admin edits Policies and the reused v0.2.17 scanner configuration form in Configure.
- Revision snapshots preserve the deployed Guardrail configuration and scope while its next revision is edited. Profiles monitor deployed bindings, not draft refs.
- Deployed Profile details include Monitoring: snapshot metrics, sortable Guardrail table, expandable activity, outcome filters and trace details. All traffic is deterministic synthetic data; dashboard and detection logs use the same source. Existing Normal / Pass all / Block all semantics are retained.
- Detail and form sheets support dragging the left edge, keyboard arrows and persisted widths. Internal scrollbars reserve space across tabs.

Final mock walkthrough (2026-10-13):

- Profile alert thresholds are entered at creation/edit (0–100%, decimals allowed), validated before testing and sign-off, and displayed read-only during deployment. Deployed snapshots preserve the active threshold and scope while the next revision is edited.
- `mock-data.ts` adapts only the five v0.2.17 default examples; the three-role demo starts both Profiles in Normal mode.
- Synthetic activity timestamps never exceed the current snapshot time. Changing a runtime mode clears old selected trace details and outcome filters. Trace details identify the Profile, Guardrail, result and latency.
- Browser walkthrough used `gr-walkthrough-20261013` and `pf-walkthrough-20261013`, including failed/retried tests, rejection with a required reason, approval, failed/retried deployment and Profile creation with a 7.5% threshold. These records remain in browser storage as reviewable evidence.
- Remaining product decisions: a production alert time window; department-specific approver authorization (current accounts simulate roles); historical traffic retention (current traffic is a synthetic snapshot, recomputed on mode/version changes).
- Revision branch was also checked in the browser: cancelling retained v1 and its 7.5% threshold; saving v2 with a 15% threshold and deliberately failing its test retained active v1 at 7.5%. Profile test records can be filtered by version.
- Metric caveat: Detected aggregates include Blocked, including forced Block all results. Treating forced blocks as risk detections needs a separate product decision.

UI review (2026-10-13):

- Dashboard and Enforce & Prevent share the same active Profile list, search, Location filter, pagination and fields: Profile, Mode, Ctrl Unit, Last Modified and Action. Normal / Pass all / Block all changes update the same stored Profile and audit history, immediately recomputing shared mock scan statistics and alert badges. Actions preserve existing workbench permissions.
- Default SLO samples use Block Rate 90% > 80% and Pass Rate 100% > 85%, both within five minutes. Saved implicit 5% error-rate defaults (including revision snapshots) migrate to these scenarios; explicitly configured rules are preserved. Aggregate breaches and individual events feed the shared Profile alert badges.
- Activity Log supports keyword search and simple entity/profile, action/decision, actor (audit only) and time-range filters, with result counts and a clear-filters action.
- Opening and closing a repository detail preserves the current page and filters. Guardrail Studio filter grids share aligned columns across Repository, Test Base and Sign-Off. Technical configuration Policies and Used by Profiles scroll within their module when there are more than three entries.
- The dashboard has no individual-event rows, Info disclosure or legacy alert column filters. Existing bookmarked Monitoring activity links still support returning to the dashboard.
- Monitoring Profile names show CRITICAL and WARNING alert counts in rounded squares, using the same colors and unfiltered alert source as the board. INFO is excluded from these two counts.

## Role workbenches (说明.docx and NMGR.drawio, October 2026)

The Word instructions take precedence over obsolete Profile testing/deployment canvases in draw.io.

- Control Unit User: Dashboard (landing), Business Intents, Configure Profiles, Trace. The Enforce & Prevent sidebar entry is hidden; its controls are available on Dashboard and existing direct links remain supported.
- Control Unit Approver: Dashboard (landing), GR Signoff, Profile Signoff, Trace.
- Tech Implementor: GR Requests (landing), GR Evaluation, GR Deployment, Trace, Dashboard.
- Workbench switches between Control Unit User, Control Unit Approver, and Tech. Internal role IDs remain User / User Admin / IT Admin for stored history compatibility. Display names and demo actor names are separate.
- The current demo account belongs to ISS. User/Approver lists, direct detail links, alerts, monitoring and trace are scoped to that unit. Technical users see all units and can filter their dashboard. Profiles may reference shared deployed Guardrails from other units; their read-only active configuration remains visible through the Profile.
- Guardrail: full-page request -> DRAFT -> technical configuration -> TEST READY -> technical test -> TEST PASSED -> User reviews results in a drawer and requests sign-off -> Approver reviews Info/Tests on a full page -> SIGNED OFF -> Tech Implementor deploys -> DEPLOYED. Rejection returns to TEST READY and invalidates old passing evidence.
- Profile: create/configure in a drawer -> DRAFT -> request sign-off from full-page details -> SIGNOFF REQUESTED -> approval activates the signed revision (SIGNED OFF). Rejection returns to DRAFT. No Profile tests or deployment actions exist.
- Profile `deployed`, `deployedRefs` and revision snapshots are retained internally as active-version storage for the existing monitoring components. Approval advances them atomically; edits preserve the prior active snapshot until approval.
- In-page success/rejection cards stay until dismissed, replaced or refreshed. Request errors describe the cause and preserve form input. Successful requests link to details; approval/rejection links return to the sign-off queue.
- Browser storage remains `nmgr-three-role-v2`; loading normalizes legacy Profile statuses without deleting authored records. It also moves the original three LCS Guardrail examples into ISS and restores missing built-in Guardrails only when a saved Profile references them. Existing legacy Profile test history is preserved but no longer shown as a workflow requirement.
- Five original v0.2.17 examples retain their prompts and Guardrail bindings. These are local simulated data, tests and deployments; this work does not add backend authorization or production deployment integration.

Validation covers model lifecycle/permissions, Profile activation and snapshot retention, departmental scope, full-page requests, distinct test review experiences, role navigation, persistent notices and monitoring/alert regressions.

## Multi-tab demo and approval history

- Open `/guardrails?role=user`, `/guardrails?role=approver`, and `/guardrails?role=tech` in the same browser profile on port 18085. Role selection uses sessionStorage and a per-tab URL parameter; changing a role does not switch other tabs.
- Business data uses shared localStorage. Storage events update other same-origin tabs without refresh; received events never write back. Actions read the latest stored state before applying their changes. This is a local sequential demo, not a multi-user transactional backend; simultaneous competing edits are not conflict-resolved. Different ports, browser profiles and computers do not share this store.
- Guardrail and Profile Sign-Off each have collapsed Operation History below the pending queue. Entries come from the current approver's approval audit events (including the legacy User Admin alias), ordered newest first. Sign-Off Time remains the actual approval timestamp when the object's current status or last-modified time changes. View opens the current object details.
- The three original Guardrails and two Profiles preserve v0.2.17 names, requirements, scanner configurations and bindings. Their demo ownership is ISS so that both business intents and their dependent Profiles are visible in the same workbench.

UI presentation refinements:

- Lifecycle and alert labels use sentence case while persisted status values stay unchanged.
- The shell shows the page title and account in one header, with its lower divider aligned to the sidebar identity section. Breadcrumbs and sidebar group captions are removed. Technical deployment navigation and the page title are GR Deployment.
- Dashboard and Business Intents use the same right-aligned New Guardrail button with a plus icon and intrinsic width.

Creation forms generate UUID-based gr-/pf- IDs automatically and keep custodian metadata implicit. Field labels use title case, including Use Case and Alert Threshold.

Internal entity, policy and scan IDs are hidden from visible UI summaries, details and operation dialogs; relationships and routes still use their stored IDs. Dataset uploads use an English Choose File / No file chosen control regardless of browser locale.

Demo scans use a minute-stable rolling snapshot shared by dashboard, alerts, and monitoring. Block/Pass Rate scenarios generate ten checks per deployed binding within the configured window (nine blocked or ten passed); legacy error-rate scenarios retain twelve checks over 5.5 minutes. Trace retains its navigation and title only; its content is intentionally blank while audit records continue to be stored.
