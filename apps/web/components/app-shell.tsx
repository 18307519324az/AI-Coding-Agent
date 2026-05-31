"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { href: "/", label: "Dashboard" },
  { href: "/repositories", label: "Repositories" },
  { href: "/tasks", label: "Tasks" },
  { href: "/tasks/new", label: "Create Task" },
  { href: "/settings", label: "Settings" }
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="app-shell">
      <aside className="sidebar" aria-label="Primary navigation">
        <div className="brand">
          <span className="brand-title">AI Coding Agent</span>
          <span className="brand-subtitle">Issue to PR console</span>
        </div>
        <nav className="nav-list">
          {navItems.map((item) => {
            const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            return (
              <Link className={`nav-link${active ? " active" : ""}`} href={item.href} key={item.href}>
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="runner-status">
          <span>
            <span className="status-dot" />
            Runner online
          </span>
          <span>High-risk GitHub writes require approval.</span>
        </div>
      </aside>
      <main className="content">{children}</main>
    </div>
  );
}

