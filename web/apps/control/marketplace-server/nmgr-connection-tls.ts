import { Agent } from "undici";
import { rootCertificates } from "node:tls";

// Per-operation TLS policy. The demo bypass is scoped to the configured NeMo API;
// never change process-wide TLS, F5, database, or Mock behavior.
export function connectionTransport(
  env: NodeJS.ProcessEnv,
  fetcher: typeof fetch,
) {
  const skip = env.MARKETPLACE_V3_DEMO === "true" && env.MARKETPLACE_NEMO_TLS === "skip";
  if (!env.MARKETPLACE_CONNECTION_CA_MODE && !skip)
    return { fetcher, close: async () => {} };
  const agent = new Agent({
    connect: {
      rejectUnauthorized: true,
      ca: [
        ...rootCertificates,
        ...(env.MARKETPLACE_CONNECTION_CA_PEM
          ? [env.MARKETPLACE_CONNECTION_CA_PEM]
          : []),
      ],
    },
  });
  const insecure = skip ? new Agent({ connect: { rejectUnauthorized: false } }) : undefined;
  const trustedFetch: typeof fetch = (input, init) => {
    const target = new URL(input instanceof Request ? input.url : String(input));
    let isNemo = false;
    try {
      const base = new URL(env.GUARD_API_URL!);
      isNemo = target.origin === base.origin && target.pathname.startsWith(base.pathname.replace(/\/+$/, "") + "/");
    } catch { /* Configuration validation reports malformed URLs. */ }
    try {
      const f5 = new URL(env.F5_API_URL!);
      if (target.origin === f5.origin && target.pathname.startsWith(f5.pathname.replace(/\/+$/, "") + "/")) isNemo = false;
    } catch { /* F5 is optional; never apply its configuration to a NeMo request. */ }
    if (!isNemo && !env.MARKETPLACE_CONNECTION_CA_MODE) return fetcher(input, init);
    return fetcher(input, { ...init, ...(isNemo && insecure ? { redirect: "manual" } : {}), dispatcher: isNemo && insecure ? insecure : agent } as RequestInit);
  };
  // The operation has finished; abort unread error bodies instead of waiting for them.
  return { fetcher: trustedFetch, close: async () => { await Promise.all([agent.destroy(), insecure?.destroy()]); } };
}
