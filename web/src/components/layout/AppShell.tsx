import { type ReactNode, useState } from "react";
import { NavLink } from "react-router-dom";
import clsx from "clsx";
import { useAuth } from "@/features/auth/AuthContext";
import { Avatar } from "@/components/ui/Avatar";
import { VerificationMark } from "@/components/ui/Badge";

// Navigation is typographic, not iconographic. An institution's index reads
// as a list of sections, not a toolbar.
const sections = [
  {
    label: "Notices",
    items: [
      { to: "/notices", label: "Register of notices", end: true },
      { to: "/notices/compose", label: "Compose", end: false },
    ],
  },
  {
    label: "Direct",
    items: [{ to: "/messaging", label: "Messages", end: false }],
  },
  {
    label: "Administration",
    items: [{ to: "/admin", label: "Roles & audit", end: false }],
  },
];

function CopyableId({ id }: { id: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(id);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <button
      onClick={copy}
      title="Copy your user ID — share it with a colleague so they can start a conversation with you"
      className="mt-2 block w-full text-left font-mono text-[0.625rem] leading-relaxed text-ink-faint transition-colors hover:text-ink-muted"
    >
      {copied ? "Copied to clipboard" : id}
    </button>
  );
}

export function AppShell({
  title,
  kicker,
  actions,
  children,
}: {
  title: string;
  kicker?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const { user, logout } = useAuth();

  return (
    <div className="min-h-screen bg-paper">
      <aside className="fixed inset-y-0 left-0 flex w-64 flex-col border-r border-rule bg-paper px-7 py-8">
        {/* Masthead */}
        <div className="border-b-2 border-ink pb-4">
          <p className="font-display text-[1.5rem] font-semibold leading-none tracking-tight text-ink">
            PharmaBoard
          </p>
          <p className="label-caps mt-2 text-ink-faint">Pharmacy Notices · Ghana</p>
        </div>

        <nav className="mt-8 flex-1 space-y-7">
          {sections.map((section) => (
            <div key={section.label}>
              <p className="label-caps mb-2.5 text-ink-faint">{section.label}</p>
              <ul className="space-y-1.5">
                {section.items.map((item) => (
                  <li key={item.to}>
                    <NavLink
                      to={item.to}
                      end={item.end}
                      className={({ isActive }) =>
                        clsx(
                          "-ml-3 block border-l-2 py-0.5 pl-3 font-sans text-[0.8125rem] transition-colors",
                          isActive
                            ? "border-ink font-medium text-ink"
                            : "border-transparent text-ink-muted hover:text-ink",
                        )
                      }
                    >
                      {item.label}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>

        {user && (
          <div className="border-t border-rule pt-4">
            <div className="flex items-start gap-3">
              <Avatar name={user.display_name} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-sans text-[0.8125rem] font-medium text-ink">
                  {user.display_name}
                </p>
                <VerificationMark state={user.verification_state} />
              </div>
            </div>
            <CopyableId id={user.id} />
            <button
              onClick={logout}
              className="label-caps mt-3 text-ink-faint transition-colors hover:text-ink"
            >
              Sign out
            </button>
          </div>
        )}
      </aside>

      <div className="ml-64 min-h-screen">
        <header className="border-b border-rule px-12 pb-6 pt-10">
          <div className="flex items-end justify-between gap-6">
            <div>
              {kicker && <p className="kicker mb-2 text-ink-faint">{kicker}</p>}
              <h1 className="font-display text-display-lg font-normal text-ink">{title}</h1>
            </div>
            {actions}
          </div>
        </header>
        <main className="px-12 py-8">{children}</main>
      </div>
    </div>
  );
}
