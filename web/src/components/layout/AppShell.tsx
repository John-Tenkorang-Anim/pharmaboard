import { useUnreadMessages } from "@/features/messaging/api";
import { PlatformBrand } from "@/components/ui/PlatformBrand";
import { platform } from "@/lib/platform";
import { type ReactNode, useState, type FormEvent } from "react";
import { NavLink, useNavigate, Link, useLocation } from "react-router-dom";
import clsx from "clsx";
import {
  Search,
  Settings,
  LogOut,
  House,
  Users,
  MessagesSquare,
  Globe2,
  Bell,
  GraduationCap,
  Video,
  BriefcaseBusiness,
  MessageCircle,
  Menu,
  X,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { useAuth } from "@/features/auth/AuthContext";
import { Avatar } from "@/components/ui/Avatar";
const navItems = [
  { to: "/home", label: "Overview", icon: House },
  { to: "/community", label: "Community", icon: Globe2 },
  { to: "/notices", label: "Notice board", icon: Bell },
  { to: "/learning", label: "Learning", icon: GraduationCap },
  { to: "/sessions", label: "Collaboration", icon: Video },
  { to: "/messaging", label: "Messages", icon: MessagesSquare },
  { to: "/network", label: "My network", icon: Users },
  { to: "/forum", label: platform.forumName, icon: MessageCircle },
  { to: "/jobs", label: "Careers", icon: BriefcaseBusiness },
  { to: "/settings", label: "Settings", icon: Settings },
];
export function AppShell({
  children,
  left,
  right,
  width = "wide",
  focusMode = false,
}: {
  children: ReactNode;
  left?: ReactNode;
  right?: ReactNode;
  width?: "wide" | "narrow";
  focusMode?: boolean;
}) {
  const { user, logout } = useAuth();
  const { data: unread } = useUnreadMessages();
  const unreadCount = unread?.count ?? 0;
  const navigate = useNavigate();
  const location = useLocation();
  const [query, setQuery] = useState("");
  const [mobile, setMobile] = useState(false);
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem("pharmaboard.sidebar.collapsed") === "true";
    } catch {
      return false;
    }
  });
  function toggleSidebar() {
    setCollapsed((value) => {
      try {
        localStorage.setItem("pharmaboard.sidebar.collapsed", String(!value));
      } catch {
        /* Storage is optional. */
      }
      return !value;
    });
  }
  const current = navItems.find((n) => location.pathname.startsWith(n.to));
  function onSearch(e: FormEvent) {
    e.preventDefault();
    navigate(`/network?q=${encodeURIComponent(query)}`);
  }
  return (
    <div className="min-h-screen bg-canvas text-ink">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[70] focus:rounded-lg focus:bg-white focus:p-3"
      >
        Skip to content
      </a>
      {mobile && !focusMode && (
        <button
          aria-label="Close navigation"
          className="fixed inset-0 z-40 bg-ink/30 lg:hidden"
          onClick={() => setMobile(false)}
        />
      )}
      <aside
        id="workspace-navigation"
        style={focusMode ? { display: "none" } : undefined}
        className={clsx(
          "social-sidebar fixed inset-y-0 left-0 z-50 flex w-60 flex-col border-r border-hairline bg-white transition-transform",
          mobile ? "translate-x-0" : "-translate-x-full",
          collapsed ? "lg:hidden" : "lg:translate-x-0",
        )}
      >
        <div className="flex h-24 items-center gap-2 px-4">
          <Link
            to="/home"
            aria-label={`${platform.name} home`}
            className="flex min-w-0 flex-col items-start gap-1"
          >
            <PlatformBrand />
          </Link>
          <button
            aria-label="Close navigation"
            onClick={() => setMobile(false)}
            className="ml-auto lg:hidden"
          >
            <X size={18} />
          </button>
        </div>
        <div className="px-6 pb-6 pt-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-muted">
            A world of possibilities
          </p>
        </div>
        <nav aria-label="Main navigation" className="flex-1 space-y-1 overflow-y-auto px-3">
          {navItems.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              onClick={() => setMobile(false)}
              className={({ isActive }) =>
                clsx(
                  "social-nav-item flex items-center gap-3 rounded-lg px-3 py-3 text-[13px] font-medium transition-colors",
                  isActive
                    ? "bg-accent-50 text-accent-700"
                    : "text-muted hover:bg-canvas hover:text-ink",
                )
              }
            >
              <Icon size={18} />
              {label}
              {to === "/messaging" && unreadCount > 0 && (
                <span
                  aria-label={`${unreadCount} unread messages`}
                  className="ml-auto min-w-5 rounded-full bg-blue-600 px-1.5 py-0.5 text-center text-[11px] font-semibold tabular-nums text-white"
                >
                  {unreadCount > 99 ? "99+" : unreadCount}
                </span>
              )}
              {to === "learning" && (
                <span className="ml-auto rounded bg-white px-1.5 py-0.5 text-[9px] font-semibold text-accent-700">
                  ACADEMY
                </span>
              )}
            </NavLink>
          ))}
        </nav>
        <div className="p-4">
          {user && (
            <div className="flex items-center gap-3">
              <Link to={`/people/${user.id}`} aria-label="Your profile">
                <Avatar
                  userId={user.id}
                  name={user.display_name}
                  size="sm"
                  verification={user.verification_state}
                />
              </Link>
              <Link to={`/people/${user.id}`} className="min-w-0 flex-1">
                <p className="truncate text-xs font-semibold">{user.display_name}</p>
                <p className="mt-1 text-[11px] capitalize text-muted">
                  {user.account_kind.replace("_", " ")}
                </p>
              </Link>
              <button
                onClick={logout}
                aria-label="Sign out"
                className="p-1 text-muted hover:text-ink"
              >
                <LogOut size={16} />
              </button>
            </div>
          )}
          <Link to="/admin" className="mt-4 block text-[11px] text-muted hover:underline">
            Administration
          </Link>
        </div>
      </aside>
      <div className={focusMode ? "fixed inset-0 z-40 bg-canvas" : collapsed ? "" : "lg:pl-60"}>
        <header
          style={focusMode ? { display: "none" } : undefined}
          className="social-topbar sticky top-0 z-30 bg-white/95 backdrop-blur"
        >
          <div className="flex h-20 items-center gap-4 px-5 md:px-8">
            <button
              aria-label="Open navigation"
              aria-expanded={mobile}
              onClick={() => setMobile(true)}
              className="lg:hidden"
            >
              <Menu size={21} />
            </button>
            <button
              onClick={toggleSidebar}
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              title={collapsed ? "Expand sidebar" : "Collapse sidebar for focus"}
              aria-expanded={!collapsed}
              aria-controls="workspace-navigation"
              className="hidden rounded-lg p-2 text-muted hover:bg-slate-100 lg:block"
            >
              {collapsed ? <PanelLeftOpen size={20} /> : <PanelLeftClose size={20} />}
            </button>
            <span className="hidden text-sm font-medium sm:block">
              Workspace <span className="mx-3 text-divider">/</span>{" "}
              <span className="text-muted">{current?.label ?? "Account"}</span>
            </span>
            <form onSubmit={onSearch} className="relative ml-auto w-full max-w-xs">
              <Search size={16} className="absolute left-3 top-2.5 text-muted" />
              <input
                aria-label="Search colleagues"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Find a colleague…"
                className="w-full rounded-lg border border-hairline bg-canvas py-2 pl-9 pr-3 text-xs"
              />
            </form>
            <Link
              to="/notices"
              aria-label="Official notices"
              className="rounded-lg border border-hairline p-2 text-muted hover:bg-canvas"
            >
              <Bell size={18} />
            </Link>
          </div>
        </header>
        {!focusMode && user?.display_name.includes("· Preview") && (
          <div className="bg-white px-5 py-2 text-xs text-muted md:px-8">
            Design preview · Sample people, opportunities, and learning content are illustrative.
          </div>
        )}
        <main
          id="main-content"
          data-section={current?.to.slice(1)}
          className={clsx(
            focusMode ? "flex h-dvh min-h-0 flex-col p-3 sm:p-5" : "mx-auto px-5 py-8 md:px-8",
            !focusMode && (width === "narrow" ? "max-w-4xl" : "max-w-[1440px]"),
          )}
        >
          {left || right ? (
            <div className="grid items-start gap-7 xl:grid-cols-[minmax(0,1fr)_280px]">
              <div className="min-w-0">{children}</div>
              <aside className="space-y-5">
                {left}
                {right}
              </aside>
            </div>
          ) : (
            children
          )}
        </main>
        <footer
          style={focusMode ? { display: "none" } : undefined}
          className="mx-5 flex flex-wrap justify-between gap-2 py-5 text-[11px] text-muted md:mx-8"
        >
          <span>{platform.name} · Connected by profession. United by purpose.</span>
          <Link to="/forum" className="hover:underline">
            Learn from your community ↗
          </Link>
        </footer>
      </div>
    </div>
  );
}
