import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button, Input, Badge } from "ui-common-components";
import BrandLogo from "../components/BrandLogo";
import { api, getPendingVerifyEmail, setPendingVerifyEmail } from "../api";

const PAGE_BG =
  "radial-gradient(1100px 520px at 50% -12%, var(--color-accent-lavender-10), transparent 60%), " +
  "radial-gradient(820px 460px at 88% 4%, var(--color-accent-sky-10), transparent 55%), " +
  "var(--color-bg-subtle, #f6f7f9)";

export default function VerifyRequired() {
  const navigate = useNavigate();
  const [email, setEmail] = useState<string>(() => getPendingVerifyEmail() ?? "");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [resending, setResending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  async function resend() {
    setError(null);
    setEmailError(null);
    if (!EMAIL_RE.test(email.trim())) {
      setEmailError("Enter a valid email address.");
      return;
    }
    setResending(true);
    try {
      await api.resendVerification(email.trim());
      setPendingVerifyEmail(email.trim());
      setSent(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setResending(false);
    }
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: 24,
        background: PAGE_BG,
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 440,
          background: "var(--color-surface, #ffffff)",
          borderRadius: 20,
          boxShadow: "0 24px 70px rgba(20, 30, 60, 0.14)",
          overflow: "hidden",
          padding: "40px 32px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, marginBottom: 18 }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 20, fontWeight: 700, letterSpacing: "-0.01em" }}>
            <BrandLogo size={24} /> LinkSnip
          </span>
        </div>

        <div style={{ textAlign: "center", marginBottom: 16 }}>
          <Badge variant="info" tone="soft" shape="pill">Email verification</Badge>
        </div>

        <h1 style={{ margin: "12px 0 4px", fontSize: 26, fontWeight: 800, letterSpacing: "-0.01em", textAlign: "center" }}>
          {sent ? "Verification link sent" : "Please verify your email"}
        </h1>
        <p style={{ margin: "6px 0 0", color: "var(--color-text-secondary)", textAlign: "center", fontSize: 14 }}>
          {sent
            ? `We sent a new link to ${email.trim() || "your inbox"}. Click it to activate your account.`
            : "We emailed you a verification link. You need to verify your email before you can log in and use the dashboard."}
        </p>

        <div style={{ display: "grid", gap: 16, marginTop: 18 }}>
          <Input
            label="Email"
            type="email"
            validation="email"
            placeholder="you@example.com"
            value={email}
            onChange={(v) => {
              setEmail(v);
              setEmailError(null);
            }}
            onPressEnter={resend}
            status={emailError ? "error" : undefined}
            errorMessage={emailError ?? undefined}
            fullWidth
          />
          {error && (
            <div role="alert" style={{ color: "var(--color-text-danger, #b42318)", fontSize: 14 }}>
              {error}
            </div>
          )}
          <Button variant="primary" onClick={resend} loading={resending} disabled={resending} block>
            {sent ? "Resend verification email" : "Resend verification email"}
          </Button>
          <div style={{ textAlign: "center" }}>
            <button
              type="button"
              onClick={() => navigate("/auth")}
              style={{
                background: "none",
                border: "none",
                padding: 0,
                cursor: "pointer",
                fontSize: 13,
                color: "var(--color-text-secondary)",
                textDecoration: "underline",
              }}
            >
              Back to log in
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}