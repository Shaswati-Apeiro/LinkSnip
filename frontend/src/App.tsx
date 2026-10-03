import { Routes, Route } from "react-router-dom";
import { RequireAuth } from "./auth";
import Home from "./pages/Home";
import Auth from "./pages/Auth";
import ResetPassword from "./pages/ResetPassword";
import VerifyEmail from "./pages/VerifyEmail";
import VerifyRequired from "./pages/VerifyRequired";
import Dashboard from "./pages/Dashboard";
import CreateLink from "./pages/CreateLink";
import BulkCreate from "./pages/BulkCreate";
import QRCodes from "./pages/QRCodes";
import LinkDetail from "./pages/LinkDetail";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/auth" element={<Auth />} />
      <Route path="/reset/:token" element={<ResetPassword />} />
      <Route path="/verify-email/:token" element={<VerifyEmail />} />
      <Route path="/verify-required" element={<VerifyRequired />} />
      <Route
        path="/dashboard"
        element={
          <RequireAuth>
            <Dashboard />
          </RequireAuth>
        }
      />
      <Route
        path="/dashboard/new"
        element={
          <RequireAuth>
            <CreateLink />
          </RequireAuth>
        }
      />
      <Route
        path="/dashboard/bulk"
        element={
          <RequireAuth>
            <BulkCreate />
          </RequireAuth>
        }
      />
      <Route
        path="/dashboard/qr"
        element={
          <RequireAuth>
            <QRCodes />
          </RequireAuth>
        }
      />
      <Route
        path="/dashboard/links/:id"
        element={
          <RequireAuth>
            <LinkDetail />
          </RequireAuth>
        }
      />
    </Routes>
  );
}
