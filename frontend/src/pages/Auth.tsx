import { useState } from "react";
import { useNavigate, Navigate } from "react-router-dom";
import {
  Button,
  Input,
  Card,
  CardContent,
  Badge,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "ui-common-components";
import { AreaChart } from "ui-common-components/charts";
import { useMediaQuery } from "ui-common-hooks";
import BrandLogo from "../components/BrandLogo";
import { api, setPendingVerifyEmail } from "../api";
import { useAuth } from "../auth";

const HERO_GRADIENT =
  "linear-gradient(135deg, var(--color-accent-lavender-40) 0%, var(--color-accent-sky-40) 100%)";

const DEMO = [
  { day: "Mon", clicks: 42 },
  { day: "Tue", clicks: 88 },
  { day: "Wed", clicks: 71 },
  { day: "Thu", clicks: 134 },
  { day: "Fri", clicks: 96 },
  { day: "Sat", clicks: 168 },
  { day: "Sun", clicks: 210 },
];

const PAGE_BG =
  "radial-gradient(1100px 520px at 50% -12%, var(--color-accent-lavender-10), transparent 60%), " +
  "radial-gradient(820px 460px at 88% 4%, var(--color-accent-sky-10), transparent 55%), " +
  "var(--color-bg-subtle, #f6f7f9)";

export default function Auth() {
  const navigate = useNavigate();
  const { login, token } = useAuth();
  const wide = useMediaQuery("(min-width: 860px)");

  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [forgot, setForgot] = useState(false);
  const [forgotDone, setForgotDone] = useState(false);

  // Already logged in → no need for the auth screen.
  if (token) return <Navigate to="/dashboard" replace />;

  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  async function submitForgot() {
    setError(null);
    setEmailError(null);
    if (!EMAIL_RE.test(email.trim())) {
      setEmailError("Enter a valid email address.");
      return;
    }
    setSubmitting(true);
    try {
      await api.forgotPassword(email.trim());
      setForgotDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  async function submit() {
    setError(null);
    setEmailError(null);
    setPasswordError(null);

    if (!EMAIL_RE.test(email.trim())) {
      setEmailError("Enter a valid email address.");
      return;
    }
    if (!password) {
      setPasswordError("Password is required.");
      return;
    }
    // min-length is a signup policy; login just authenticates whatever exists.
    if (mode === "signup" && password.length < 6) {
      setPasswordError("Password must be at least 6 characters.");
      return;
    }

    setSubmitting(true);
    try {
      if (mode === "signup") {
        // Create the account and send the verification email. Do NOT create a
        // dashboard session here: the email must be verified first.
        await api.signup(email.trim(), password);
        setPendingVerifyEmail(email.trim());
        navigate("/verify-required");
        return;
      }
      const res = await api.login(email.trim(), password);
      login(res.access_token);
      navigate("/dashboard");
    } catch (e) {
      const err = e as Error & { status?: number };
      if (err.status === 403) {
        // Unverified account → route to the dedicated verify screen.
        setPendingVerifyEmail(email.trim());
        navigate("/verify-required");
      } else {
        setError(e instanceof Error ? e.message : "Something went wrong");
      }
    } finally {
      setSubmitting(false);
    }
  }

  const form = (
    <div style={{ display: "grid", gap: 16, marginTop: 14 }}>
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
        onPressEnter={submit}
        status={emailError ? "error" : undefined}
        errorMessage={emailError ?? undefined}
        fullWidth
      />
      <Input
        label="Password"
        type="password"
        placeholder="••••••••"
        value={password}
        onChange={(v) => {
          setPassword(v);
          setPasswordError(null);
        }}
        onPressEnter={submit}
        status={passwordError ? "error" : undefined}
        errorMessage={passwordError ?? undefined}
        showToggleIcon
        fullWidth
      />
      {error && (
        <div role="alert" style={{ color: "var(--color-text-danger, #b42318)", fontSize: 14 }}>
          {error}
        </div>
      )}
      <Button variant="primary" onClick={submit} loading={submitting} disabled={submitting} block>
        {mode === "login" ? "Log in" : "Create account"}
      </Button>
      {mode === "login" && (
        <div style={{ textAlign: "center" }}>
          <button
            type="button"
            onClick={() => {
              setForgot(true);
              setError(null);
              setEmailError(null);
              setForgotDone(false);
            }}
            style={{
              background: "none",
              border: "none",
              padding: 0,
              margin: "6px 0 0",
              cursor: "pointer",
              fontSize: 13,
              color: "var(--color-accent-sky-600, var(--color-accent-sky, #00539a))",
              textDecoration: "underline",
            }}
          >
            Forgot password?
          </button>
        </div>
      )}
    </div>
  );

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
          maxWidth: 940,
          background: "var(--color-surface, #ffffff)",
          borderRadius: 20,
          boxShadow: "0 24px 70px rgba(20, 30, 60, 0.14)",
          overflow: "hidden",
          display: "grid",
          gridTemplateColumns: wide ? "1fr 1fr" : "1fr",
        }}
      >
        {/* LEFT — form */}
        <div style={{ padding: wide ? "44px" : "32px 24px" }}>
          <button
            type="button"
            onClick={() => navigate("/")}
            style={{
              background: "none",
              border: "none",
              padding: 0,
              marginBottom: 16,
              cursor: "pointer",
              fontSize: 13,
              color: "var(--color-text-secondary)",
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
            }}
          >
            ← Back to Home
          </button>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 20, fontWeight: 700, letterSpacing: "-0.01em" }}>
              <BrandLogo size={24} /> LinkSnip
            </span>
            <Badge variant="neutral" tone="soft" shape="pill" size="sm">
              URL shortener
            </Badge>
          </div>

          {forgot ? (
            <div>
              <h1 style={{ margin: "18px 0 4px", fontSize: 26, fontWeight: 800, letterSpacing: "-0.01em" }}>
                {forgotDone ? "Check your email" : "Reset your password"}
              </h1>
              {forgotDone ? (
                <>
                  <p style={{ margin: 0, color: "var(--color-text-secondary)" }}>
                    If that email is registered, a reset link has been sent. Check your inbox
                    and use it within 30 minutes.
                  </p>
                  <Button
                    variant="outlineSecondary"
                    onClick={() => {
                      setForgot(false);
                      setForgotDone(false);
                    }}
                    block
                    style={{ marginTop: 16 }}
                  >
                    Back to log in
                  </Button>
                </>
              ) : (
                <>
                  <p style={{ margin: 0, color: "var(--color-text-secondary)" }}>
                    Enter your email and we'll send you a link to set a new password.
                  </p>
                  <div style={{ display: "grid", gap: 16, marginTop: 14 }}>
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
                      onPressEnter={submitForgot}
                      status={emailError ? "error" : undefined}
                      errorMessage={emailError ?? undefined}
                      fullWidth
                    />
                    {error && (
                      <div role="alert" style={{ color: "var(--color-text-danger, #b42318)", fontSize: 14 }}>
                        {error}
                      </div>
                    )}
                    <Button variant="primary" onClick={submitForgot} loading={submitting} disabled={submitting} block>
                      Send reset link
                    </Button>
                    <div style={{ textAlign: "center" }}>
                      <button
                        type="button"
                        onClick={() => {
                          setForgot(false);
                          setError(null);
                        }}
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
          ) : (
            <Tabs
              value={mode}
              onValueChange={(v) => {
                setMode(v);
                setError(null);
                setEmailError(null);
                setPasswordError(null);
              }}
              variant="segmented"
              listLayout="equal"
            >
              <TabsList ariaLabel="Log in or sign up">
              <TabsTrigger value="login">Log in</TabsTrigger>
              <TabsTrigger value="signup">Sign up</TabsTrigger>
            </TabsList>

            <TabsContent value="login">
              <h1 style={{ margin: "18px 0 4px", fontSize: 26, fontWeight: 800, letterSpacing: "-0.01em" }}>
                Welcome back
              </h1>
              <p style={{ margin: 0, color: "var(--color-text-secondary)" }}>
                Log in to manage your links and analytics.
              </p>
              {form}
            </TabsContent>

            <TabsContent value="signup">
              <h1 style={{ margin: "18px 0 4px", fontSize: 26, fontWeight: 800, letterSpacing: "-0.01em" }}>
                Create your account
              </h1>
              <p style={{ margin: 0, color: "var(--color-text-secondary)" }}>
                Sign up for custom aliases and click analytics.
              </p>
              {form}
            </TabsContent>
          </Tabs>
          )}
        </div>

        {/* RIGHT — decorative illustration panel (hidden on narrow screens) */}
        {wide && (
          <div
            style={{
              background: HERO_GRADIENT,
              color: "#ffffff",
              padding: 44,
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              gap: 16,
            }}
          >
            <span
              style={{
                alignSelf: "flex-start",
                background: "rgba(255,255,255,0.22)",
                color: "#fff",
                fontSize: 12,
                fontWeight: 600,
                padding: "5px 12px",
                borderRadius: 999,
              }}
            >
              📈 Track every click
            </span>
            <h2 style={{ margin: 0, fontSize: 32, fontWeight: 800, lineHeight: 1.12, letterSpacing: "-0.02em" }}>
              Shorten. Share. Track.
            </h2>
            <p style={{ margin: 0, fontSize: 15, color: "rgba(255,255,255,0.9)", maxWidth: 360 }}>
              Create short links and see exactly how they perform — clicks over time, devices, and
              top referrers, all in one dashboard.
            </p>

            <Card variant="elevated" elevation="lg" style={{ borderRadius: 14, marginTop: 6 }}>
              <CardContent>
                <div style={{ fontSize: 13, color: "var(--color-text-secondary)", marginBottom: 6 }}>
                  Clicks this week
                </div>
                <AreaChart
                  data={DEMO}
                  xAxisKey="day"
                  series={[{ dataKey: "clicks", name: "Clicks" }]}
                  curve="monotone"
                  width="100%"
                  height={160}
                  showLegend={false}
                />
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
                  <Badge variant="success" tone="soft" shape="pill">
                    1.2k clicks
                  </Badge>
                  <Badge variant="info" tone="soft" shape="pill">
                    Top: Mobile
                  </Badge>
                  <Badge variant="neutral" tone="soft" shape="pill">
                    3 referrers
                  </Badge>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
