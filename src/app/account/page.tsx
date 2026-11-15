"use client";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, LogOut, Phone, Mail } from "lucide-react";
import { useAccount } from "@/components/account-provider";
import { Button } from "@/components/ui/button";
export default function Account() {
  const {
    client,
    user,
    phone,
    verified,
    callingEnabled,
    error: profileError,
    refreshProfile,
  } = useAccount();
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <div className="account-content">
      <div className="page-heading">
        <div>
          <span className="eyebrow">YOUR PERSONAL SPACE</span>
          <h1>Your account.</h1>
          <p>A few details. All in one place.</p>
        </div>
      </div>
      <section className="account-card">
        <div className="account-detail">
          <Mail size={20} />
          <div>
            <span>Email address</span>
            <strong>{user?.email}</strong>
          </div>
        </div>
        <div className="account-detail">
          <Phone size={20} />
          <div>
            <span>Your mobile number</span>
            <strong>{phone || "Not added yet"}</strong>
            <p>
              {verified
                ? callingEnabled
                  ? "Verified. Critical reminder calls are enabled."
                  : "Verified. Reminder calls are currently off."
                : "Finish verification to enable critical reminder calls."}
            </p>
          </div>
          <Link className="text-link" href="/onboarding/phone">
            {callingEnabled ? "Change" : "Set up calls"}{" "}
            <ArrowRight size={14} />
          </Link>
        </div>
      </section>
      <p className="account-note">
        Sir Jarvis’s number is on your <Link href="/">homepage</Link>. Your
        number is where Sir Jarvis can reach you once calling is enabled.
      </p>
      {(error || profileError) && (
        <p role="alert" className="flow-error">
          {error || profileError}
        </p>
      )}
      <div className="account-actions">
        {callingEnabled && (
          <Button
            variant="outline"
            disabled={busy}
            onClick={async () => {
              if (!client || !user) return;
              setBusy(true);
              setError("");
              try {
                const { data, error } = await client
                  .from("profiles")
                  .update({ outreach_enabled: false })
                  .eq("user_id", user.id)
                  .select("outreach_enabled")
                  .single();
                if (error) throw error;
                if (data?.outreach_enabled !== false)
                  throw new Error("We couldn’t pause calls. Please try again.");
                await refreshProfile();
              } catch (err) {
                setError(
                  err instanceof Error ? err.message : "Please try again.",
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            Pause reminder calls
          </Button>
        )}
        <Button
          variant="outline"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            const result = await client?.auth.signOut();
            if (result?.error) {
              setError(result.error.message);
              setBusy(false);
            } else router.replace("/auth");
          }}
        >
          <LogOut size={16} />
          {busy ? "Signing out…" : "Sign out"}
        </Button>
      </div>
    </div>
  );
}
