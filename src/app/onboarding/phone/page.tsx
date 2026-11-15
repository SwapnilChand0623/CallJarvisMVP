"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Phone, LockKeyhole } from "lucide-react";
import { Brand } from "@/components/shell";
import { Button } from "@/components/ui/button";
import { useAccount } from "@/components/account-provider";
import {
  enableReminderCalls,
  normalizePhone,
  sendPhoneCode,
  verifyPhoneCode,
} from "@/lib/supabase/phone";

export default function PhoneSetup() {
  const { client, user, phone, refreshProfile } = useAccount();
  const router = useRouter();
  // Legacy metadata is a prefill only; it never completes setup or enables outreach.
  const [value, setValue] = useState(
    phone ||
      (typeof user?.user_metadata?.contact_phone === "string"
        ? user.user_metadata.contact_phone
        : ""),
  );
  const [step, setStep] = useState<"phone" | "code" | "activate">("phone");
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  async function finish() {
    if (!client || !user) throw new Error("Sign in to finish setup.");
    await enableReminderCalls(
      client,
      user.id,
      value,
      Intl.DateTimeFormat().resolvedOptions().timeZone,
      consent,
    );
    await refreshProfile();
    router.replace("/");
  }

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
          {step === "phone" ? (
            <>
              Where can Jarvis
              <br />
              reach you?
            </>
          ) : step === "code" ? (
            "Check your phone."
          ) : (
            "Ready for reminder calls."
          )}
        </h1>
        <p>
          {step === "phone"
            ? "Verify your mobile number to receive calls about critical reminders."
            : step === "code"
              ? `Enter the verification code sent to ${value}.`
              : "Your phone is verified. Finish setup to enable critical reminder calls."}
        </p>
        <form
          className="flow-form"
          onSubmit={async (event) => {
            event.preventDefault();
            if (!client || !user || busy) return;
            setBusy(true);
            setError("");
            setNotice("");
            const data = new FormData(event.currentTarget);
            try {
              if (!consent)
                throw new Error("Please allow reminder calls to continue.");
              if (step === "phone") {
                const normalized = normalizePhone(value);
                setValue(normalized);
                const result = await sendPhoneCode(client, user.id, normalized);
                if (result.needsCode) {
                  setStep("code");
                  return;
                }
                setStep("activate");
              } else if (step === "code") {
                await verifyPhoneCode(
                  client,
                  user.id,
                  value,
                  String(data.get("code")),
                );
                // Keep this phase on a database/network error: retry without consuming another code.
                setStep("activate");
              }
              await finish();
            } catch (err) {
              setError(
                err instanceof Error
                  ? err.message
                  : "We couldn’t finish setup. Please try again.",
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          {step === "phone" ? (
            <>
              <label>
                Mobile number
                <input
                  name="phone"
                  type="tel"
                  autoComplete="tel"
                  inputMode="tel"
                  placeholder="+1 555 123 4567"
                  value={value}
                  onChange={(event) => setValue(event.target.value)}
                  disabled={busy}
                  required
                  aria-describedby="phone-help"
                />
              </label>
              <p id="phone-help" className="field-help">
                Include your country code. We’ll send a verification code by
                text.
              </p>
              <label className="calling-consent">
                <input
                  type="checkbox"
                  checked={consent}
                  onChange={(event) => setConsent(event.target.checked)}
                  disabled={busy}
                  required
                />
                <span>
                  Allow Jarvis to call this number about my critical reminders.
                </span>
              </label>
            </>
          ) : step === "code" ? (
            <label>
              Verification code
              <input
                name="code"
                type="text"
                autoComplete="one-time-code"
                inputMode="numeric"
                pattern="[0-9]{6,10}"
                minLength={6}
                maxLength={10}
                placeholder="Enter your code"
                required
                disabled={busy}
              />
            </label>
          ) : null}
          {error && (
            <p className="flow-error" role="alert">
              {error}
            </p>
          )}
          {notice && <p role="status">{notice}</p>}
          <Button disabled={busy || !client} type="submit">
            {busy
              ? "Just a moment…"
              : step === "phone"
                ? "Send verification code"
                : step === "code"
                  ? "Verify and enable calls"
                  : "Finish setup"}
            <ArrowRight size={17} />
          </Button>
        </form>
        {step === "code" && (
          <Button
            variant="ghost"
            disabled={busy}
            onClick={async () => {
              if (!client) return;
              setBusy(true);
              setError("");
              setNotice("");
              try {
                const { error } = await client.auth.resend({
                  type: "phone_change",
                  phone: value,
                });
                if (error) throw error;
                setNotice("A new code has been sent. Please check your phone.");
              } catch (err) {
                setError(
                  err instanceof Error
                    ? err.message
                    : "Please wait a moment and try again.",
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            Resend code
          </Button>
        )}
        {step !== "phone" && (
          <Button
            variant="ghost"
            disabled={busy}
            onClick={() => {
              setStep("phone");
              setError("");
              setNotice("");
            }}
          >
            Use a different number
          </Button>
        )}
        <p className="privacy-note">
          <LockKeyhole size={14} /> Only your verified number is used for
          reminder calls.
        </p>
        {phone && (
          <Button
            variant="ghost"
            disabled={busy}
            onClick={() => router.replace("/")}
          >
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
