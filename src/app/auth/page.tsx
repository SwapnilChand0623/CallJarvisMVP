"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, AudioLines, Check, Mail } from "lucide-react";
import { Brand } from "@/components/shell";
import { Button } from "@/components/ui/button";
import { useAccount } from "@/components/account-provider";
export default function Auth() {
  const { client, user, loading, phone, error: accountError } = useAccount();
  const router = useRouter();
  const [signup, setSignup] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [checkEmail, setCheckEmail] = useState(false);
  useEffect(() => {
    if (!loading && user && !accountError)
      router.replace(phone ? "/" : "/onboarding/phone");
  }, [loading, user, phone, accountError, router]);
  return (
    <div className="welcome-layout">
      <section className="welcome-story">
        <Brand />
        <div className="welcome-story-copy">
          <span className="eyebrow">A LITTLE MORE PEACE OF MIND</span>
          <h1>
            More living.
            <br />
            Less remembering.
          </h1>
          <p>
            Your reminders, a conversation away. Meet the assistant you can
            simply call.
          </p>
          <div className="voice-illustration" aria-hidden="true">
            <AudioLines size={70} strokeWidth={1.2} />
          </div>
          <div className="example-bubble">
            “Remind me to pick up my prescription tomorrow.”
            <span>
              <Check size={14} /> One less thing on your mind.
            </span>
          </div>
        </div>
        <p className="welcome-footnote">Your day, a little lighter.</p>
      </section>
      <section className="welcome-form-wrap">
        <div className="welcome-form">
          <span className="eyebrow">
            {signup ? "LET’S GET YOU STARTED" : "YOUR PERSONAL SPACE"}
          </span>
          <h2>
            {checkEmail
              ? "Check your inbox"
              : signup
                ? "Meet your Jarvis."
                : "Welcome back."}
          </h2>
          <p className="form-intro">
            {checkEmail
              ? "Open the confirmation email to finish creating your account. Then come back to sign in and add your phone number."
              : signup
                ? "Create an account. Add your number. Take a breath."
                : "Sign in to pick up where you left off."}
          </p>
          {checkEmail ? (
            <>
              <Mail className="confirmation-icon" size={38} />
              <Button
                onClick={() => {
                  setCheckEmail(false);
                  setSignup(false);
                }}
              >
                Back to sign in <ArrowRight size={16} />
              </Button>
            </>
          ) : (
            <>
              <div className="auth-tabs" aria-label="Account access">
                <button
                  type="button"
                  aria-pressed={!signup}
                  disabled={busy}
                  onClick={() => {
                    setSignup(false);
                    setError("");
                  }}
                >
                  Sign in
                </button>
                <button
                  type="button"
                  aria-pressed={signup}
                  disabled={busy}
                  onClick={() => {
                    setSignup(true);
                    setError("");
                  }}
                >
                  Create account
                </button>
              </div>
              <form
                className="flow-form"
                onSubmit={async (event) => {
                  event.preventDefault();
                  if (!client || busy) return;
                  setBusy(true);
                  setError("");
                  const form = new FormData(event.currentTarget);
                  const credentials = {
                    email: String(form.get("email")).trim(),
                    password: String(form.get("password")),
                  };
                  try {
                    if (signup) {
                      const { data, error } = await client.auth.signUp({
                        ...credentials,
                        options: {
                          emailRedirectTo: `${window.location.origin}/auth`,
                        },
                      });
                      if (error) throw error;
                      if (!data.session) setCheckEmail(true);
                    } else {
                      const { error } =
                        await client.auth.signInWithPassword(credentials);
                      if (error) throw error;
                    }
                  } catch (err) {
                    setError(
                      err instanceof Error ? err.message : "Please try again.",
                    );
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                <label>
                  Email address
                  <input
                    name="email"
                    type="email"
                    autoComplete="email"
                    placeholder="you@example.com"
                    required
                  />
                </label>
                <label>
                  Password
                  <input
                    name="password"
                    type="password"
                    autoComplete={signup ? "new-password" : "current-password"}
                    minLength={signup ? 6 : undefined}
                    placeholder={
                      signup ? "At least 6 characters" : "Your password"
                    }
                    required
                  />
                </label>
                {error && (
                  <p className="flow-error" role="alert">
                    {error}
                  </p>
                )}
                <Button disabled={!client || busy || loading} type="submit">
                  {busy
                    ? "Just a moment…"
                    : signup
                      ? "Create account"
                      : "Sign in"}
                  <ArrowRight size={17} />
                </Button>
              </form>
            </>
          )}
          {(!client || accountError) && (
            <p className="flow-error" role="alert">
              {accountError ||
                "Sign-in is being set up. Please check back soon."}
            </p>
          )}
          <p className="form-fineprint">
            {signup
              ? "Next: add the number where Jarvis can reach you."
              : "A calmer day starts here."}
          </p>
        </div>
      </section>
    </div>
  );
}
