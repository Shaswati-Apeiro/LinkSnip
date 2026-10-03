import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Button, Input, Badge } from "ui-common-components";
import BrandLogo from "../components/BrandLogo";
import { api, setToken } from "../api";
import { useAuth } from "../auth";

const PAGE_BG =
  "radial-gradient(1100px 520px at 50% -12%, var(--color-accent-lavender-10), transparent 60%), " +
  "radial-gradient(820px 460px at 88% 4%, var(--color-accent-sky-10), transparent 55%), " +
  "var(--color-bg-subtle, #f6f7f9)";

export default function ResetPassword() {
  const navigate = useNavigate();
  const { token } = useParams<{ token: string }>();
  const { login } = useAuth();

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [needsVerify, setNeedsVerify] = useState(false);

  async function submit() {
    setError(null);
    setFieldError(null);
    setNeedsVerify(false);

    if (password.length < 6) {
      setFieldError("Password must be at least 6 characters.");
      return;
    }
    if (password !== confirm) {
      setFieldError("Passwords do not match.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await api.resetPassword(token ?? "", password);
      // The password is updated. Probe access with the fresh token: verified (or
      // whitelisted) users proceed to the dashboard; unverified users must NOT be
      // logged in — route them to verify their email instead.
      setToken(res.access_token);
      try {
        await api.me();
        login(res.access_token);
        setDone(true);
      } catch (probe) {
        setToken(null);
        setNeedsVerify(true);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setSubmitting(false);
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
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 20, fontWeight: 700, letterSpacing: "-0.01em" }}>
            <BrandLogo size={24} /> LinkSnip
          </span>
          <Badge variant="neutral" tone="soft" shape="pill" size="sm">
            Password reset
          </Badge>
        </div>

        {needsVerify ? (
          <>
            <h1 style={{ margin: "18px 0 4px", fontSize: 26, fontWeight: 800, letterSpacing: "-0.01em" }}>
              Password updated
            </h1>
            <p style={{ margin: 0, color: "var(--color-text-secondary)" }}>
              Your password was reset successfully. Your email still needs to be verified before you
              can access the platform.
            </p>
            <Button variant="primary" onClick={() => navigate("/verify-required")} block style={{ marginTop: 18 }}>
              Verify my email
            </Button>
            <div style={{ textAlign: "center", marginTop: 12 }}>
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
          </>
        ) : done ? (
          <>
            <h1 style={{ margin: "18px 0 4px", fontSize: 26, fontWeight: 800, letterSpacing: "-0.01em" }}>
              Password updated
            </h1>
            <p style={{ margin: 0, color: "var(--color-text-secondary)" }}>
              Your password has been reset. You're now logged in.
            </p>
            <Button variant="primary" onClick={() => navigate("/dashboard")} block style={{ marginTop: 18 }}>
              Go to dashboard
            </Button>
          </>
        ) : (
          <>
            <h1 style={{ margin: "18px 0 4px", fontSize: 26, fontWeight: 800, letterSpacing: "-0.01em" }}>
              Set a new password
            </h1>
            <p style={{ margin: 0, color: "var(--color-text-secondary)" }}>
              Choose a new password for your account.
            </p>
            <div style={{ display: "grid", gap: 16, marginTop: 14 }}>
              <Input
                label="New password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(v) => {
                  setPassword(v);
                  setFieldError(null);
                }}
                onPressEnter={submit}
                status={fieldError ? "error" : undefined}
                errorMessage={fieldError ?? undefined}
                showToggleIcon
                fullWidth
              />
              <Input
                label="Confirm new password"
                type="password"
                placeholder="••••••••"
                value={confirm}
                onChange={(v) => {
                  setConfirm(v);
                  setFieldError(null);
                }}
                onPressEnter={submit}
                showToggleIcon
                fullWidth
              />
              {error && (
                <div role="alert" style={{ color: "var(--color-text-danger, #b42318)", fontSize: 14 }}>
                  {error}
                </div>
              )}
              <Button variant="primary" onClick={submit} loading={submitting} disabled={submitting} block>
                Reset password
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
          </>
        )}
      </div>
    </div>
  );
}