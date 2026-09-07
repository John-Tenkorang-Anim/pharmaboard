import { type ReactNode, useState, type FormEvent } from "react";
import { NavLink, useNavigate, Link } from "react-router-dom";
import clsx from "clsx";
import { Search, LogOut } from "lucide-react";
import { useAuth } from "@/features/auth/AuthContext";
import { Avatar } from "@/components/ui/Avatar";

// A horizontal top nav, not a vertical icon rail — a prior pass tried a
// persistent left sidebar modelled too literally on a reference product;
// walked back after feedback to remove the vertical tabs.
const navItems = [
  { to: "/home", label: "Feed", end: true },
  { to: "/forum", label: "Rx Forum", end: false },
  { to: "/network", label: "Directory", end: false },
  { to: "/messaging", label: "Messages", end: false },
  { to: "/notices", label: "Notices", end: true },
  { to: "/admin", label: "Admin", end: false },
];

function TopBar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");

  function onSearch(e: FormEvent) {
    e.preventDefault();
    navigate(`/network?q=${encodeURIComponent(query)}`);
  }

  return (
    <header className="sticky top-0 z-40 border-b border-hairline bg-surface">
      <div className="mx-auto flex h-16 max-w-app items-center gap-5 px-4 lg:px-6">
        <Link to="/home" className="shrink-0 text-[0.9375rem] font-bold text-ink">
          Pharma<span className="text-accent-600">Board</span>
        </Link>

        <nav className="hidden items-center gap-1 md:flex">
          {navItems.map(({ to, label, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                clsx(
                  "rounded-full px-3 py-1.5 text-[0.8125rem] font-medium transition-colors",
                  isActive
                    ? "bg-accent-50 text-accent-700"
                    : "text-muted hover:bg-hairline/50 hover:text-ink",
                )
              }
            >
              {label}
            </NavLink>
          ))}
        </nav>

        <form onSubmit={onSearch} className="relative ml-auto hidden max-w-[13rem] flex-1 lg:block">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-faint" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search colleagues"
            className="w-full rounded-full border border-hairline bg-canvas py-1.5 pl-8 pr-3 text-[0.8125rem] text-ink transition-colors placeholder:text-faint focus-visible:border-accent-600 focus-visible:outline-none"
          />
        </form>

        {user && (
          <div className="flex shrink-0 items-center gap-3">
            <Link
              to="/notices/compose"
              className="hidden rounded-full bg-accent-600 px-3.5 py-1.5 text-[0.8125rem] font-semibold text-white transition-colors hover:bg-accent-700 sm:inline-block"
            >
              Draft notice
            </Link>
            <Link to={`/people/${user.id}`} title="Your profile">
              <Avatar name={user.display_name} size="sm" verification={user.verification_state} />
            </Link>
            <button
              onClick={logout}
              title="Sign out"
              className="text-faint transition-colors hover:text-ink"
            >
              <LogOut className="size-4" />
            </button>
          </div>
        )}
      </div>

      {/* Nav repeats below the bar on narrow viewports, where it doesn't
          fit inline. */}
      <nav className="flex items-center gap-1 overflow-x-auto border-t border-hairline px-4 py-2 md:hidden">
        {navItems.map(({ to, label, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              clsx(
                "shrink-0 rounded-full px-3 py-1.5 text-[0.8125rem] font-medium transition-colors",
                isActive ? "bg-accent-50 text-accent-700" : "text-muted",
              )
            }
          >
            {label}
          </NavLink>
        ))}
      </nav>
    </header>
  );
}

/**
 * AppShell renders the persistent chrome: a light top bar with a horizontal
 * nav. Passing `left` and/or `right` turns on a two-column layout (main
 * content plus a supporting rail); everything else gets a single column.
 */
export function AppShell({
  children,
  left,
  right,
  width = "wide",
}: {
  children: ReactNode;
  left?: ReactNode;
  right?: ReactNode;
  width?: "wide" | "narrow";
}) {
  const hasRails = Boolean(left || right);

  return (
    <div className="min-h-screen bg-canvas">
      <TopBar />
      <div
        className={clsx(
          "mx-auto px-4 py-6 lg:px-6",
          hasRails ? "max-w-app" : width === "narrow" ? "max-w-2xl" : "max-w-3xl",
        )}
      >
        {hasRails ? (
          <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[minmax(0,1fr)_18rem]">
            <div className="min-w-0">{children}</div>
            <aside className="hidden xl:block">
              <div className="sticky top-20 space-y-4">
                {left}
                {right}
              </div>
            </aside>
          </div>
        ) : (
          children
        )}
      </div>
    </div>
  );
}
