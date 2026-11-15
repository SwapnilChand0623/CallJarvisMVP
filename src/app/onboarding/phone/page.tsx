"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Phone, LockKeyhole } from "lucide-react";
import { Brand } from "@/components/shell";
import { Button } from "@/components/ui/button";
import { useAccount } from "@/components/account-provider";
export default function PhoneSetup() {
  const { client, phone } = useAccount();
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <div className="onboarding-layout">
      <Brand />
      <section className="onboarding-card">
        <div className="setup-progress">
          <span className="complete">✓ Account</span>
          <span className="progress-line" />
          <span>02 Your number</span>
        </div>
        <span className="setup-icon">
          <Phone size={28} />
        </span>
        <h1>
          Where can Jarvis
          <br />
          reach you?
        </h1>
        <p>
          Add your mobile number to your account.
          <br />
          You’ll always choose how Jarvis gets in touch.
        </p>
        <form
          className="flow-form"
          onSubmit={async (event) => {
            event.preventDefault();
            if (!client || busy) return;
            const value = String(
              new FormData(event.currentTarget).get("phone"),
            ).replace(/[\s().-]/g, "");
            if (!/^\+[1-9]\d{7,14}$/.test(value)) {
              setError(
                "Include your country code, for example +1 555 123 4567.",
              );
              return;
            }
            setBusy(true);
            setError("");
            try {
              // Save a request only. Verification and delivery authorization remain server-owned.
              const { error } = await client.auth.updateUser({
                data: { contact_phone: value },
              });
              if (error) throw error;
              router.replace("/");
            } catch (err) {
              setError(
                err instanceof Error
                  ? err.message
                  : "We couldn’t save your number. Please try again.",
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          <label>
            Mobile number
            <input
              name="phone"
              type="tel"
              autoComplete="tel"
              inputMode="tel"
              placeholder="+1 555 123 4567"
              defaultValue={phone}
              required
              aria-describedby="phone-help"
            />
          </label>
          <p id="phone-help" className="field-help">
            Include your country code. We’ll save this number; calls and
            messages require separate verification and permission.
          </p>
          {error && (
            <p className="flow-error" role="alert">
              {error}
            </p>
          )}
          <Button disabled={busy || !client} type="submit">
            {busy ? "Saving…" : "Save and continue"}
            <ArrowRight size={17} />
          </Button>
        </form>
        <p className="privacy-note">
          <LockKeyhole size={14} /> Adding a number won’t start calls or
          messages.
        </p>
        {phone && (
          <Button variant="ghost" onClick={() => router.replace("/")}>
            Back to home
          </Button>
        )}
        <Button
          variant="ghost"
          disabled={busy}
          onClick={async () => {
            const result = await client?.auth.signOut();
            if (result?.error) setError(result.error.message);
            else router.replace("/auth");
          }}
        >
          Sign out
        </Button>
      </section>
    </div>
  );
}
