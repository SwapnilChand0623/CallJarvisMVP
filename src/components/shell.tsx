"use client";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { House, BellRing, UserRound, ArrowUpRight } from "lucide-react";
import { useAccount } from "./account-provider";
export function Brand() {
  return (
    <Link href="/" className="brand" aria-label="CallJarvis home">
      <Image
        src="/brand/calljarvis-logo.png"
        alt="CallJarvis"
        width={884}
        height={588}
        className="brand-logo"
        preload
      />
    </Link>
  );
}
export function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const { user, client, loading, phone, error } = useAccount();
  const publicPage = path === "/auth";
  const phonePage = path === "/onboarding/phone";
  const destination =
    !client || !user ? "/auth" : !phone ? "/onboarding/phone" : "/";
  useEffect(() => {
    if (loading || publicPage || error) return;
    if (!client || !user || (!phone && !phonePage)) router.replace(destination);
  }, [
    loading,
    publicPage,
    error,
    client,
    user,
    phone,
    phonePage,
    router,
    destination,
  ]);
  if (publicPage || (phonePage && user && !loading))
    return <main className="entry-screen">{children}</main>;
  if (loading || !user || !phone)
    return (
      <main className="entry-screen">
        <div className="entry-message" role="status">
          {error || "Getting your space ready…"}
          {error && (
            <p>
              <button
                className="button button-outline"
                onClick={() => window.location.reload()}
              >
                Try again
              </button>
            </p>
          )}
        </div>
      </main>
    );
  return (
    <div className="simple-shell">
      <header className="simple-header">
        <Brand />
        <nav aria-label="Main navigation">
          {[
            { href: "/", label: "Home", icon: House },
            { href: "/reminders", label: "Reminders", icon: BellRing },
            { href: "/account", label: "Account", icon: UserRound },
          ].map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={path === href ? "simple-nav active" : "simple-nav"}
              aria-current={path === href ? "page" : undefined}
            >
              <Icon size={17} />
              <span>{label}</span>
            </Link>
          ))}
        </nav>
      </header>
      <main className="simple-main">{children}</main>
      <footer className="simple-footer">
        <span>A little less to remember.</span>
        <Link href="/account">
          Your account <ArrowUpRight size={13} />
        </Link>
      </footer>
    </div>
  );
}
