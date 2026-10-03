import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Button, Badge } from "ui-common-components";
import BrandLogo from "../components/BrandLogo";
import { api } from "../api";

const PAGE_BG =
  "radial-gradient(1100px 520px at 50% -12%, var(--color-accent-lavender-10), transparent 60%), " +
  "radial-gradient(820px 460px at 88% 4%, var(--color-accent-sky-10), transparent 55%), " +
  "var(--color-bg-subtle, #f6f7f9)";

export default function VerifyEmail() {
  const navigate = useNavigate();
  const { token } = useParams<{ token: string }>();

  const [verifying, setVerifying] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await api.verifyEmail(token ?? "");
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Something went wrong");
        }
      } finally {
        if (!cancelled) setVerifying(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

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
          textAlign: "center",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, marginBottom: 18 }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 20, fontWeight: 700, letterSpacing: "-0.01em" }}>
            <BrandLogo size={24} /> LinkSnip
          </span>
        </div>

        {verifying ? (
          <>
            <h1 style={{ margin: "18px 0 4px", fontSize: 26, fontWeight: 800, letterSpacing: "-0.01em" }}>
              Verifying…
            </h1>
            <Badge variant="info" tone="soft" shape="pill">
              Validating your link
            </Badge>
          </>
        ) : error ? (
          <>
            <h1 style={{ margin: "18px 0 4px", fontSize: 26, fontWeight: 800, letterSpacing: "-0.01em" }}>
              Verification failed
            </h1>
            <p style={{ margin: 0, color: "var(--color-text-secondary)" }}>{error}</p>
            <Button variant="primary" onClick={() => navigate("/auth")} block style={{ marginTop: 18 }}>
              Back to log in
            </Button>
          </>
        ) : (
          <>
            <h1 style={{ margin: "18px 0 4px", fontSize: 26, fontWeight: 800, letterSpacing: "-0.01em" }}>
              Email verified
            </h1>
            <p style={{ margin: 0, color: "var(--color-text-secondary)" }}>
              Your email is verified. You can now log in and manage your links.
            </p>
            <Button variant="primary" onClick={() => navigate("/auth")} block style={{ marginTop: 18 }}>
              Go to log in
            </Button>
          </>
        )}
      </div>
    </div>
  );
}