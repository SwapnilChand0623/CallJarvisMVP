"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  AudioLines,
  House,
  MessageCircle,
  LayoutDashboard,
  BellRing,
  Settings2,
  ArrowUpRight,
  FlaskConical,
} from "lucide-react";
import { useDemo } from "./demo-provider";
export function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const { storageWarning, state } = useDemo();
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link href="/" className="brand">
          <span className="brand-icon">
            <AudioLines size={23} />
          </span>
          calljarvis<span className="brand-dot">.</span>
        </Link>
        <div className="workspace-label">YOUR PERSONAL SPACE</div>
        <nav aria-label="Main navigation">
          {[
            { href: "/", label: "Overview", icon: LayoutDashboard },
            { href: "/reminders", label: "JarvisRemind", icon: BellRing },
            { href: "/home", label: "JarvisHome", icon: House },
            { href: "/talks", label: "JarvisTalks", icon: MessageCircle },
            { href: "/settings", label: "Settings", icon: Settings2 },
          ].map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              aria-current={path === href ? "page" : undefined}
              className={path === href ? "nav-link active" : "nav-link"}
            >
              <Icon size={19} />
              {label}
              {path === href && <span className="nav-dot" />}
            </Link>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="demo-note">
            <FlaskConical size={18} />
            <strong>A glimpse of what’s next</strong>
            <p>
              You’re exploring a local demo. Real integrations are on the way.
            </p>
          </div>
          <a
            href="https://github.com/SwapnilChand0623/CallJarvisMVP"
            target="_blank"
            rel="noreferrer"
            className="repo-link"
          >
            Built for the moments that matter <ArrowUpRight size={16} />
          </a>
        </div>
      </aside>
      <div className="main-area">
        <header className="topbar">
          <span>Your day, a little lighter.</span>
          <div className="topbar-right">
            <span className="demo-badge">
              <span /> DEMO WORKSPACE
            </span>
            <span className="avatar" aria-label="Your profile">
              {state.preferences.name.slice(0, 1).toUpperCase()}
            </span>
          </div>
        </header>
        <main>
          {storageWarning && (
            <div className="notice" role="status">
              Browser storage is unavailable. Changes will last for this
              session.
            </div>
          )}
          {children}
        </main>
        <footer>
          Thoughtfully proactive. Always in your corner.
          <span>CallJarvis MVP · Frontend demo</span>
        </footer>
      </div>
    </div>
  );
}
