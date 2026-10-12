import { useState, type ReactNode } from "react";
import {
  BookOpen,
  CheckCheck,
  ChevronDown,
  FileText,
  FlaskConical,
  Folder,
  LayoutDashboard,
  Layers,
  ShieldCheck,
  Activity,
} from "lucide-react";
import { BrandMark } from "@/components/brand/brand-logo";
import { AccountMenu } from "@/features/business-demo/owner-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { accounts, type Kind } from "./model";
export type View =
  | "repository"
  | "tests"
  | "signoff"
  | "deploy"
  | "dashboard"
  | "operations"
  | "logs";
type Props = {
  kind: Kind;
  view: View;
  owner: string;
  busy: boolean;
  onOwner: (owner: string) => void;
  onNavigate: (kind: Kind, view: View) => void;
  children: ReactNode;
};
export function NmgrShell(props: Props) {
  return (
    <TooltipProvider delayDuration={250}>
      <SidebarProvider>
        <ShellContent {...props} />
      </SidebarProvider>
    </TooltipProvider>
  );
}
function ShellContent({
  kind,
  view,
  owner,
  busy,
  onOwner,
  onNavigate,
  children,
}: Props) {
  const { isMobile, state, setOpenMobile, setOpen } = useSidebar();
  const compact = !isMobile && state === "collapsed";
  const [expanded, setExpanded] = useState({ Guardrail: true, Profile: true });
  const navigate = (k: Kind, v: View) => {
    onNavigate(k, v);
    setOpenMobile(false);
  };
  const nav = (k: Kind, v: View, label: string, Icon: typeof ShieldCheck) => (
    <SidebarMenuItem key={`${k}-${v}`}>
      <SidebarMenuButton
        isActive={kind === k && view === v}
        tooltip={label}
        aria-label={label}
        aria-current={kind === k && view === v ? "page" : undefined}
        onClick={() => navigate(k, v)}
      >
        <Icon />
        <span>{label}</span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
  return (
    <>
      <a
        href="#nmgr-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-background focus:p-3"
      >
        Skip to content
      </a>
      <Sidebar collapsible="icon">
        <SidebarHeader className="gap-1.5 border-b border-sidebar-border p-2">
          <button
            aria-label="Home"
            onClick={() => navigate("Guardrail", "repository")}
            className="flex min-h-11 min-w-0 items-center gap-3 px-2 group-data-[collapsible=icon]:mx-auto group-data-[collapsible=icon]:size-11 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0"
          >
            <BrandMark className="size-8 shrink-0" />
          </button>
          <div
            className="flex h-11 items-center gap-3 rounded-md border border-sidebar-border px-3 text-[13px] group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0"
            title="Default Project"
          >
            <Folder className="size-4 shrink-0 text-muted-foreground" />
            {!compact && <span>Default Project</span>}
          </div>
        </SidebarHeader>
        <SidebarContent>
          <nav aria-label="NMGR sections" className="flex flex-col py-1">
            <SidebarGroup>
              <SidebarGroupLabel className="text-primary font-semibold">
                STUDIO
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {(["Guardrail", "Profile"] as Kind[]).map((k) => (
                    <SidebarMenuItem key={k}>
                      <SidebarMenuButton
                        tooltip={`${k}s`}
                        aria-label={`Studio ${k}s`}
                        aria-expanded={!compact && expanded[k]}
                        aria-controls={`studio-${k}`}
                        onClick={() => {
                          if (compact) {
                            setOpen(true);
                            setExpanded((x) => ({ ...x, [k]: true }));
                          } else setExpanded((x) => ({ ...x, [k]: !x[k] }));
                        }}
                      >
                        {k === "Guardrail" ? <FileText /> : <Layers />}
                        <span>{k}s</span>
                        <ChevronDown
                          className={`ml-auto transition-transform ${expanded[k] ? "" : "-rotate-90"}`}
                        />
                      </SidebarMenuButton>
                      {!compact && expanded[k] && (
                        <div
                          id={`studio-${k}`}
                          className="ml-4 border-l border-sidebar-border pl-2 py-1"
                        >
                          <SidebarMenu>
                            {nav(k, "repository", "Repository", BookOpen)}
                            {nav(k, "tests", "Test Base", FlaskConical)}
                            {nav(k, "signoff", "Sign-Off", CheckCheck)}
                          </SidebarMenu>
                        </div>
                      )}
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
            <SidebarGroup>
              <SidebarGroupLabel className="text-primary font-semibold">
                DEPLOY CONTROL
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {nav("Guardrail", "deploy", "Deploy Guardrails", FileText)}
                  {nav("Profile", "deploy", "Deploy Profiles", Layers)}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
            <SidebarGroup>
              <SidebarGroupLabel className="text-primary font-semibold">
                OPERATION CONTROL
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {nav("Profile", "dashboard", "Dashboard", LayoutDashboard)}
                  {nav("Profile", "operations", "Monitoring", ShieldCheck)}
                  {nav("Profile", "logs", "Activity Log", Activity)}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </nav>
        </SidebarContent>
        <SidebarFooter className="border-t border-sidebar-border p-2">
          <AccountMenu
            compact={compact}
            mode="mock"
            currentOwner={owner}
            owners={accounts}
            switchOwner={onOwner}
            busy={busy}
          />
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>
      <SidebarInset
        className={`nm-app ${["dashboard", "operations", "logs"].includes(view) ? "nm-operations" : ""}`}
      >
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b bg-background/94 px-4 backdrop-blur-md sm:px-6 lg:px-8">
          <SidebarTrigger />
          <div className="flex items-center gap-1 text-xs">
            <span className="hidden sm:inline">Default Project</span>
            <span className="hidden text-muted-foreground sm:inline">/</span>
            <span className="font-medium">
              {view === "deploy"
                ? "Deploy Control"
                : view === "dashboard"
                  ? "Dashboard"
                  : view === "operations"
                    ? "Monitoring"
                    : view === "logs"
                      ? "Activity Log"
                      : `${kind}s`}
            </span>
          </div>
        </header>
        <main
          id="nmgr-content"
          tabIndex={-1}
          className="mx-auto w-full max-w-[1600px] p-5 sm:p-6 lg:px-8"
        >
          {children}
        </main>
      </SidebarInset>
    </>
  );
}
