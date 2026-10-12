import type { QueryClient } from "@tanstack/react-query";
import {
  ClientOnly,
  HeadContent,
  Scripts,
  createRootRouteWithContext,
  redirect,
} from "@tanstack/react-router";
import { NmgrApp } from "@/features/nmgr/app";

declare const __TALI_UI_DEMO__: boolean;
const prototypeDemo =
  typeof __TALI_UI_DEMO__ !== "undefined" && __TALI_UI_DEMO__;

import { MarketplaceShell } from "@/features/marketplace/shell";
import appCss from "../styles.css?url";

export const Route = createRootRouteWithContext<{
  queryClient: QueryClient;
}>()({
  component: prototypeDemo ? DemoRoot : MarketplaceShell,
  beforeLoad: ({ location }) => {
    const guardrailDetail = location.pathname.match(
      /^\/[^/]+\/governance\/guardrails\/([^/]+)\/?$/,
    );
    if (guardrailDetail?.[1])
      throw redirect({
        to: "/guardrails",
        search: { item: decodeURIComponent(guardrailDetail[1]) },
        replace: true,
      });
    const destination =
      /^\/guardrails\/[^/]+\/?$/.test(location.pathname) ||
      ["/guardrails", "/policies", "/templates"].includes(location.pathname)
        ? null
        : /(?:template|policy-library)/.test(location.pathname)
          ? ("/policies" as const)
          : ("/guardrails" as const);
    if (destination) throw redirect({ to: destination, replace: true });
  },
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      {
        name: "viewport",
        content: "width=device-width, initial-scale=1",
      },
      { title: prototypeDemo ? "NMGR · Guardrail Governance" : "Profiles" },
      {
        name: "description",
        content: "Profiles and Guardrails",
      },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", href: "/api/branding/favicon" },
    ],
  }),
  shellComponent: RootDocument,
});

function DemoRoot() {
  return (
    <ClientOnly
      fallback={
        <div className="p-8" role="status">
          Loading workspace…
        </div>
      }
    >
      <NmgrApp />
    </ClientOnly>
  );
}

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}
