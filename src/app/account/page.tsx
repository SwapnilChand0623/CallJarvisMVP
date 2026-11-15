"use client";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, LogOut, Phone, Mail } from "lucide-react";
import { useAccount } from "@/components/account-provider";
import { Button } from "@/components/ui/button";
export default function Account() {
  const { client, user, phone, verified, error: profileError } = useAccount();
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
                ? "Phone verified. Call availability depends on your line and permissions."
                : "Saved for setup. Calls and messages aren’t enabled by adding a number."}
            </p>
          </div>
          <Link className="text-link" href="/onboarding/phone">
            Change <ArrowRight size={14} />
          </Link>
        </div>
      </section>
      <p className="account-note">
        Jarvis’s number is on your <Link href="/">homepage</Link>. Your number
        is where Jarvis can reach you once calling is enabled.
      </p>
      {(error || profileError) && (
        <p role="alert" className="flow-error">
          {error || profileError}
        </p>
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
  );
}
