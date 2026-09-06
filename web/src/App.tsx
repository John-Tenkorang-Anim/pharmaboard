import { lazy, Suspense } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { RequireAuth } from "@/features/auth/RequireAuth";
import { LoginPage } from "@/features/auth/LoginPage";

// Each feature is its own chunk, fetched only when the user navigates to
// it, so the initial bundle stays small as more features are added —
// notices/messaging/admin are already independent enough that no route
// needs another route's code up front.
const NoticesListPage = lazy(() =>
  import("@/features/notices/NoticesListPage").then((m) => ({ default: m.NoticesListPage })),
);
const ComposeNoticePage = lazy(() =>
  import("@/features/notices/ComposeNoticePage").then((m) => ({ default: m.ComposeNoticePage })),
);
const NoticeDetailPage = lazy(() =>
  import("@/features/notices/NoticeDetailPage").then((m) => ({ default: m.NoticeDetailPage })),
);
const MessagingPage = lazy(() =>
  import("@/features/messaging/MessagingPage").then((m) => ({ default: m.MessagingPage })),
);
const AdminPage = lazy(() =>
  import("@/features/admin/AdminPage").then((m) => ({ default: m.AdminPage })),
);

function RouteFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-paper">
      <p className="label-caps animate-pulse text-ink-faint">Loading</p>
    </div>
  );
}

export function App() {
  return (
    <Suspense fallback={<RouteFallback />}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />

        <Route path="/notices" element={<RequireAuth><NoticesListPage /></RequireAuth>} />
        <Route path="/notices/compose" element={<RequireAuth><ComposeNoticePage /></RequireAuth>} />
        <Route path="/notices/:id" element={<RequireAuth><NoticeDetailPage /></RequireAuth>} />

        <Route path="/messaging" element={<RequireAuth><MessagingPage /></RequireAuth>} />
        <Route path="/messaging/:conversationId" element={<RequireAuth><MessagingPage /></RequireAuth>} />

        <Route path="/admin" element={<RequireAuth><AdminPage /></RequireAuth>} />

        <Route path="/" element={<Navigate to="/notices" replace />} />
        <Route path="*" element={<Navigate to="/notices" replace />} />
      </Routes>
    </Suspense>
  );
}
