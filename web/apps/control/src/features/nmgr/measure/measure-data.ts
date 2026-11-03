/** Source: NMGR Wireframes, Figma 67c1etjhoxv02cH1nAh5SM. Values are illustrative. */
export type Decision = "Confirm false positive" | "Not a false positive";
export type ReportStatus = "Pending review" | "In review" | "Reviewed";
export type Agent = {
  id: string;
  name: string;
  description: string;
  bu: string;
  version: string;
  poc: string;
  hits: number;
  blocked: number;
  transformed: number;
};
export type PolicyHit = {
  id: string;
  policy: string;
  description: string;
  guardrail: string;
  guardDescription: string;
  action: "Transformed" | "Blocked";
  hits: number;
};
export type PolicyEvent = {
  id: string;
  agentId: string;
  policyId: string;
  time: string;
  prompt: string;
  response: string;
  action: "Transformed" | "Blocked";
  reported: boolean;
};
export type Evidence = {
  requestId: string;
  eventId: string;
  time: string;
  request: string;
  response: string;
  completedResponse: string;
  policyVersion: string;
  guardrailVersion: string;
  rule: string;
};
export type Review = {
  decision: Decision;
  reason: string;
  reviewer: string;
  time: string;
};
export type Report = {
  id: string;
  eventId: string;
  agentId: string;
  policy: string;
  policyDescription: string;
  guardrail: string;
  guardDescription: string;
  reportedAt: string;
  reporter: string;
  reportReason?: string;
  controlUnit?: string;
  status: ReportStatus;
  action: "Transformed" | "Blocked";
  evidence: Evidence;
  review?: Review;
};
export type MeasureFeedback = {
  eventId: string;
  category: "common" | "false-negative";
  description: string;
  reporter: string;
  time: string;
};
export type MeasureState = {
  version: 1;
  reports: Report[];
  feedback?: MeasureFeedback[];
  suspendedGuardrails?: string[];
};

const agent = (
  id: string,
  name: string,
  description: string,
  bu: string,
  version: string,
  poc: string,
  hits: number,
  blocked: number,
  transformed: number,
): Agent => ({
  id,
  name,
  description,
  bu,
  version,
  poc,
  hits,
  blocked,
  transformed,
});
export const agents: Agent[] = [
  agent(
    "customer-verifier",
    "Customer Information Verifier",
    "This is an agent to verify identity information of certain customer for transactions",
    "CBGT",
    "2.0",
    "Wiky HUANG",
    26,
    20,
    6,
  ),
  agent(
    "transfer-maker",
    "Transfer Maker",
    "This is an agent to make transfers for customers",
    "CBGT",
    "2.1",
    "Wiky HUANG",
    22,
    16,
    6,
  ),
  agent(
    "enterprise-loan",
    "Enterprise Loan Assessor",
    "Enterprise Loan Assessor",
    "IBGT",
    "1.0",
    "Guo Hao WANG",
    21,
    2,
    19,
  ),
  agent(
    "mortgage",
    "Mortgage Eligibility Evaluator",
    "Evaluates customer eligibility for mortgages based on financial data",
    "CBGT",
    "1.5",
    "Alice CHEN",
    21,
    17,
    4,
  ),
  agent(
    "fraud-monitor",
    "Fraud Detection Monitor",
    "Monitors transactions in real-time to detect and flag fraudulent activity",
    "RISK",
    "3.2",
    "John DOE",
    30,
    25,
    5,
  ),
  agent(
    "feedback-marketing",
    "Customer Feedback Analyzer",
    "Analyzes customer feedback from multiple channels to improve service quality",
    "MARKETING",
    "2.0",
    "Emma LI",
    30,
    28,
    2,
  ),
  agent(
    "investment",
    "Investment Portfolio Advisor",
    "Provides tailored investment advice based on customer risk profiles",
    "WEALTH",
    "1.8",
    "Michael TAN",
    24,
    18,
    6,
  ),
  agent(
    "loan-repayment",
    "Loan Repayment Assistant",
    "Assists customers in managing and scheduling loan repayments",
    "IBGT",
    "1.3",
    "Sarah KIM",
    26,
    23,
    3,
  ),
  agent(
    "credit-evaluator",
    "Credit Score Evaluator",
    "Calculates and monitors customer credit scores for lending decisions",
    "CBGT",
    "2.4",
    "David WANG",
    20,
    15,
    5,
  ),
  agent(
    "account-opening",
    "Account Opening Facilitator",
    "Guides customers through the process of opening new accounts seamlessly",
    "CBGT",
    "1.7",
    "Linda ZHANG",
    24,
    23,
    1,
  ),
  // Page two continues with the source TEC agent examples; these are mock samples.
  agent(
    "transaction-risk",
    "Transaction Risk Assessor",
    "Evaluates transaction risk based on customer history and behavior patterns",
    "CBGT",
    "3.1",
    "Anya Patel",
    21,
    2,
    19,
  ),
  agent(
    "aml-monitor",
    "AML Transaction Monitor",
    "Monitors transactions for anti-money laundering compliance",
    "Compliance",
    "4.0",
    "Markus Lee",
    22,
    16,
    6,
  ),
  agent(
    "kyc-validator",
    "KYC Data Validator",
    "Validates customer Know Your Customer data accuracy and completeness",
    "CBGT",
    "1.8",
    "Sarah Chen",
    24,
    18,
    6,
  ),
  agent(
    "credit-updater",
    "Credit Score Updater",
    "Updates customer credit scores based on latest payment and credit activity",
    "Credit",
    "2.5",
    "Leo Martinez",
    26,
    23,
    3,
  ),
  agent(
    "fraud-engine",
    "Fraud Detection Engine",
    "Detects potential fraudulent activities using machine learning models",
    "Security",
    "5.0",
    "Nina Kapoor",
    30,
    25,
    5,
  ),
  agent(
    "compliance-report",
    "Compliance Reporting Tool",
    "Generates reports to ensure regulatory compliance across transaction activities",
    "Compliance",
    "1.3",
    "Omar Silva",
    24,
    23,
    1,
  ),
  agent(
    "feedback-cx",
    "Customer Feedback Analyzer",
    "Analyzes customer feedback to identify service improvement areas",
    "CX",
    "2.2",
    "Julia Nguyen",
    30,
    28,
    2,
  ),
  agent(
    "loan-checker",
    "Loan Eligibility Checker",
    "Determines loan eligibility based on customer profile and credit data",
    "Lending",
    "3.4",
    "Rajesh Kumar",
    21,
    17,
    4,
  ),
];

export const policyHits: PolicyHit[] = [
  {
    id: "12356",
    policy: "Policy #12356",
    description: "Policy Description or a Excerpt",
    guardrail: "Guardrail XXXX",
    guardDescription: "Guardrail Description or a Excerpt",
    action: "Transformed",
    hits: 19,
  },
  {
    id: "12198",
    policy: "Policy #12198",
    description: "Policy Description or a Excerpt",
    guardrail: "Guardrail XXXX",
    guardDescription: "Guardrail Description or a Excerpt",
    action: "Blocked",
    hits: 24,
  },
  {
    id: "12489",
    policy: "Policy #12489",
    description: "Detailed overview of policy enforcement",
    guardrail: "Guardrail YYYY",
    guardDescription: "Ensures compliance with data handling rules",
    action: "Transformed",
    hits: 15,
  },
  {
    id: "13045",
    policy: "Policy #13045",
    description: "Summary of access control policy",
    guardrail: "Guardrail ZZZZ",
    guardDescription: "Prevents unauthorized system access",
    action: "Blocked",
    hits: 30,
  },
  {
    id: "13210",
    policy: "Policy #13210",
    description: "Policy for encryption standards",
    guardrail: "Guardrail YYYY",
    guardDescription: "Mandates encryption for sensitive data",
    action: "Transformed",
    hits: 22,
  },
  {
    id: "23478",
    policy: "Policy #23478",
    description: "Assesses risk levels dynamically to prevent fraud",
    guardrail: "Guardrail RISK01",
    guardDescription:
      "Ensures transactions above threshold require manual review",
    action: "Transformed",
    hits: 15,
  },
  {
    id: "34560",
    policy: "Policy #34560",
    description: "Flags suspicious activities according to AML regulations",
    guardrail: "Guardrail AML001",
    guardDescription: "Blocks transactions exceeding set risk scores",
    action: "Blocked",
    hits: 24,
  },
  {
    id: "16789",
    policy: "Policy #16789",
    description: "Ensures all required fields are filled and compliant",
    guardrail: "Guardrail KYC100",
    guardDescription: "Overrides allowed only with supervisor approval",
    action: "Transformed",
    hits: 19,
  },
];

export function policyEvents(agentId: string, policyId: string): PolicyEvent[] {
  const policy = policyHits.find((p) => p.id === policyId) ?? policyHits[0]!;
  return Array.from({ length: 19 }, (_, i) => ({
    id: `${agentId}/${policyId}/${i + 1}`,
    agentId,
    policyId,
    time: "2026-09-28T13:56:00Z",
    prompt: "Prompt (or context) sent.",
    response: "Response after the operation",
    action: policy.action,
    reported: [1, 5, 6].includes(i),
  }));
}

export const sourceRequest =
  "For customer [NAME REDACTED], account [•••• 4821], which approved checks should I use to verify identity? Do I need their passport number, or can I use the in-app verification confirmation? Please explain the process only; do not retrieve or display any identity details.";
export const sourceResponse =
  "“For customer [NAME REDACTED], account [••••••••], which approved checks should I use to verify identity? Do I need their [••••••••], or can I use the in-app verification confirmation? Please explain the process only; do not retrieve or display any identity details.”";
export const sourceCompletedResponse =
  "“Your request has been transformed to the CBGT Identity Verification Queue for manual review.”";
export const sourceReason =
  "The request asks which approved checks to use, not for customer identity data. No document number or private customer record is requested. The phrase “passport number” is a field label in a legitimate verification question.\n\nManual verification returned approved process guidance without collecting an identifier. The transfer was unnecessary for this event.";
export const reviewBoundary =
  "It does not disable a guardrail, change production policy, or replay the request. Historical definitions and enforcement records remain unchanged.";
export const policyDefinition =
  "Customer identity data protection. Prevent disclosure of government-issued identifiers during assisted verification.";
export const historicalRule =
  "IF input contains “passport number” OR “national ID” → TRANSFER to CBGT Identity Verification Queue. No intent or context exception is evaluated.";

export function eventEvidence(event: PolicyEvent): Evidence {
  return {
    requestId: `REQ-${event.id}`,
    eventId: `EVT-${event.id}`,
    time: event.time,
    request: event.prompt,
    response: event.response,
    completedResponse: event.response,
    policyVersion: "1.4",
    guardrailVersion: "3.2",
    rule: "Historical rule at event time",
  };
}

export function seedMeasure(): MeasureState {
  const sourceAgents = [0, 0, 10, 11, 12, 13, 14, 15, 16, 17, 1, 2, 3, 4, 6, 7];
  const policies = [
    "12356",
    "12356",
    "23478",
    "34560",
    "16789",
    "27890",
    "45671",
    "38912",
    "51234",
    "62345",
  ];
  const guards = [
    "XXXX",
    "XXXX",
    "RISK01",
    "AML001",
    "KYC100",
    "CRD200",
    "FRD500",
    "RPT300",
    "FBK100",
    "LON400",
  ];
  const policyDescriptions = [
    "Policy Description or a exemption",
    "Policy Description or a exemption",
    "Assesses risk levels dynamically to prevent fraud",
    "Flags suspicious activities according to AML regulations",
    "Ensures all required fields are filled and compliant",
    "Refreshes scores monthly with new data inputs",
    "Utilizes real-time data for immediate fraud alerts",
    "Automates report generation and sends to regulators",
    "Uses NLP to categorize feedback sentiment",
    "Applies multiple criteria including income, credit score, and debt",
  ];
  const guardDescriptions = [
    "Guardrail Description or a exemption",
    "Guardrail Description or a exemption",
    "Ensures transactions above threshold require manual review",
    "Blocks transactions exceeding set risk scores",
    "Overrides allowed only with supervisor approval",
    "Prevents updates with incomplete payment history",
    "Suspicious transactions auto-blocked pending review",
    "Reports must be verified before submission",
    "Feedback data anonymized for privacy",
    "Manual override requires compliance approval",
  ];
  return {
    version: 1,
    reports: sourceAgents.map((index, i): Report => {
      const a = agents[index]!;
      const action = [1, 6].includes(i) ? "Blocked" : "Transformed";
      const minutes = [18, 21, 28, 32, 36, 40, 45, 52, 58, 63];
      const reportedAt = new Date(
        Date.UTC(2026, 9, 22, 9, minutes[i] ?? 65 + (i - 10) * 5),
      ).toISOString();
      const evidence: Evidence =
        i === 0
          ? {
              requestId: "REQ-8C21A",
              eventId: "EVT-091642",
              time: "2026-10-22T09:16:42Z",
              request: sourceRequest,
              response: sourceResponse,
              completedResponse: sourceCompletedResponse,
              policyVersion: "1.4",
              guardrailVersion: "3.2",
              rule: historicalRule,
            }
          : {
              requestId: `REQ-MEASURE-${419 + i}`,
              eventId: `EVT-MEASURE-${419 + i}`,
              time: reportedAt,
              request: "Prompt (or context) sent.",
              response: "Response after the operation",
              completedResponse: "Response after the operation",
              policyVersion: "1.4",
              guardrailVersion: "3.2",
              rule: "Historical rule at event time",
            };
      return {
        id: `FPR-2026-${String(418 + i).padStart(5, "0")}`,
        eventId: evidence.eventId,
        agentId: a.id,
        policy: `Policy #${policies[i % 10]}`,
        policyDescription: policyDescriptions[i % 10]!,
        guardrail: `Guardrail ${guards[i % 10]}`,
        guardDescription: guardDescriptions[i % 10]!,
        reportedAt,
        reporter: i === 0 ? "Yann GUO" : `${a.poc} · ${a.bu}`,
        controlUnit: "ISS",
        status: [5, 7].includes(i)
          ? "Reviewed"
          : i === 3
            ? "In review"
            : "Pending review",
        action,
        evidence,
        ...([5, 7].includes(i)
          ? {
              review: {
                decision: "Confirm false positive" as const,
                reason: "Reviewed against the historical event and policy.",
                reviewer: "TEC",
                time: "2026-10-22T10:06:00Z",
              },
            }
          : {}),
      };
    }),
  };
}
