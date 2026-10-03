import { type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { DashboardShell, AppTopbar } from "ui-common-components/shell";
import BrandLogo from "./BrandLogo";
import { useAuth } from "../auth";

// Small inline icons (currentColor → follow the sidebar/active theme; visible in the collapsed rail).
// Dashboard — home icon (clearly distinct from the QR grid).
const IconDashboard = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    <polyline points="9 22 9 12 15 12 15 22" />
  </svg>
);
const IconCreate = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
    <path d="M12 5v14M5 12h14" />
  </svg>
);
// Bulk import — stack of rows (a CSV of links).
const IconBulk = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M4 6h16M4 12h16M4 18h10" />
  </svg>
);
// QR Codes — lucide-style qr-code (finder squares + scattered modules).
const IconQr = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <rect x="3" y="3" width="5" height="5" rx="1" />
    <rect x="16" y="3" width="5" height="5" rx="1" />
    <rect x="3" y="16" width="5" height="5" rx="1" />
    <path d="M21 16h-3a2 2 0 0 0-2 2v3" />
    <path d="M21 21v.01" />
    <path d="M12 7v3a2 2 0 0 1-2 2H7" />
    <path d="M3 12h.01" />
    <path d="M12 3h.01" />
    <path d="M12 16v.01" />
    <path d="M16 12h1" />
    <path d="M21 12v.01" />
    <path d="M12 21v-1" />
  </svg>
);
const IconLogout = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M10 17l5-5-5-5M15 12H3M21 21V3" />
  </svg>
);

// Shared dashboard chrome (sidebar + topbar) for the protected pages.
export default function AppShellLayout({
  title,
  activeItemId,
  topbarRight,
  children,
}: {
  title: string;
  activeItemId?: string;
  topbarRight?: ReactNode;
  children: ReactNode;
}) {
  const navigate = useNavigate();
  const { logout } = useAuth();

  return (
    <DashboardShell
      sidebar={{
        header: { icon: <BrandLogo size={26} />, title: "LinkSnip", subtitle: "URL shortener" },
        items: [
          { id: "links", label: "Dashboard", icon: IconDashboard, onClick: () => navigate("/dashboard") },
          { id: "new", label: "Create link", icon: IconCreate, onClick: () => navigate("/dashboard/new") },
          { id: "bulk", label: "Bulk import", icon: IconBulk, onClick: () => navigate("/dashboard/bulk") },
          { id: "qr", label: "QR Codes", icon: IconQr, onClick: () => navigate("/dashboard/qr") },
        ],
        activeItemId,
        user: { name: "My account", role: "Signed in" },
        // Log out lives in the footer next to the avatar (icon utility).
        footerActions: [
          {
            id: "logout",
            label: "Log out",
            icon: IconLogout,
            onClick: () => {
              logout();
              navigate("/");
            },
          },
        ],
        showCollapseToggle: true,
        defaultCollapsed: false,
        responsive: true,
        fixed: true,
      }}
      topbar={
        <AppTopbar
          title={title}
          rightSlot={topbarRight ? <div style={{ display: "flex", gap: 8 }}>{topbarRight}</div> : undefined}
        />
      }
    >
      {children}
    </DashboardShell>
  );
}
