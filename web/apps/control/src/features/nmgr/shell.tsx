import { useLayoutEffect, useRef, type ReactNode } from "react";
import {
  FileText,
  LayoutDashboard,
  Layers,
  ShieldCheck,
  Activity,
} from "lucide-react";
import { BrandMark } from "@/components/brand/brand-logo";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
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
import { roleForOwner, type Kind } from "./model";
import {
  workbenchLabels,
  workbenchNavigation,
  actorNames,
  homeFor,
  type View,
} from "./workbench";
export type { View } from "./workbench";
type Props = {
  kind: Kind;
  view: View;
  owner: string;
  busy: boolean;
  controlUnit?: string;
  title?: string;
  description?: string;
  actions?: ReactNode;
  onOwner: (owner: string) => void;
  onNavigate: (kind: Kind, view: View) => void;
  children: ReactNode;
};
export function NmgrShell(props: Props) {
  return (
    <TooltipProvider delayDuration={250}>
      <SidebarProvider className="nm-workspace">
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
  controlUnit = "ISS",
  title,
  description,
  actions,
  onOwner,
  onNavigate,
  children,
}: Props) {
  const role = roleForOwner(owner);
  const { isMobile, state, setOpenMobile } = useSidebar();
  const compact = !isMobile && state === "collapsed";
  const headerRef = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const header = headerRef.current;
    const workspace = header?.closest<HTMLElement>(
      '[data-slot="sidebar-wrapper"]',
    );
    if (!header || !workspace) return;
    const align = () =>
      workspace.style.setProperty(
        "--nm-header-height",
        `${header.getBoundingClientRect().height}px`,
      );
    align();
    const observer = new ResizeObserver(align);
    observer.observe(header);
    return () => observer.disconnect();
  }, []);
  const navigate = (k: Kind, v: View) => {
    onNavigate(k, v);
    setOpenMobile(false);
  };
  const nav = (k: Kind, v: View, label: string, Icon: typeof ShieldCheck) => (
    <SidebarMenuItem key={`${k}-${v}`}>
      <SidebarMenuButton
        isActive={
          kind === k &&
          (view === v ||
            (v === "dashboard" && view === "operations") ||
            (v === "repository" && view === "request"))
        }
        tooltip={label}
        aria-label={label}
        aria-current={
          kind === k &&
          (view === v ||
            (v === "dashboard" && view === "operations") ||
            (v === "repository" && view === "request"))
            ? "page"
            : undefined
        }
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
        <SidebarHeader className="nm-workspace-identity gap-1.5 border-b border-sidebar-border p-2">
          <button
            aria-label="Home"
            onClick={() => navigate(...homeFor(role))}
            className="flex min-h-11 min-w-0 items-center gap-3 px-2 group-data-[collapsible=icon]:mx-auto group-data-[collapsible=icon]:size-11 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0"
          >
            <BrandMark className="size-8 shrink-0" />
          </button>
          <div
            className="flex h-11 items-center rounded-md border border-sidebar-border px-3 text-[13px] group-data-[collapsible=icon]:hidden"
            title={
              role === "IT Admin"
                ? "Technical Operations"
                : `Control Unit: ${controlUnit}`
            }
          >
            {!compact && (
              <span>
                {role === "IT Admin"
                  ? "Technical Operations"
                  : `Control Unit: ${controlUnit}`}
              </span>
            )}
          </div>
        </SidebarHeader>
        <SidebarContent>
          <nav aria-label="NMGR sections" className="flex flex-col py-1">
            <SidebarGroup>
              <SidebarGroupContent>
                <SidebarMenu>
                  {workbenchNavigation[role].filter((item) => item.view !== "enforce").map((item) =>
                    nav(
                      item.kind,
                      item.view,
                      item.label,
                      item.view === "dashboard"
                        ? LayoutDashboard
                        : item.view === "audit"
                          ? Activity
                          : item.kind === "Profile"
                            ? Layers
                            : FileText,
                    ),
                  )}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </nav>
        </SidebarContent>
        <SidebarFooter className="border-t border-sidebar-border p-2">
          <div className="nm-workbench-switch">
            {!compact && <label htmlFor="nm-workbench">Workbench</label>}
            <select
              id="nm-workbench"
              aria-label="Workbench"
              disabled={busy}
              value={role}
              onChange={(event) => onOwner(event.target.value)}
            >
              {(["User", "User Admin", "IT Admin"] as const).map((value) => (
                <option key={value} value={value}>
                  {workbenchLabels[value]}
                </option>
              ))}
            </select>
          </div>
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>
      <SidebarInset
        className={`nm-app ${["dashboard", "operations", "logs"].includes(view) ? "nm-operations" : ""}`}
      >
        <header
          ref={headerRef}
          className="nm-workspace-header sticky top-0 z-30 border-b bg-background/94 backdrop-blur-md"
        >
          <div className="nm-workspace-title">
            <SidebarTrigger className="nm-workspace-toggle" />
            <div className="nm-heading">
              <h1>{title}</h1>
              {description && <p className="nm-muted">{description}</p>}
            </div>
          </div>
          <div className="nm-workspace-account">
            <span className="text-sm font-medium">{actorNames[role]}</span>
            {actions}
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
