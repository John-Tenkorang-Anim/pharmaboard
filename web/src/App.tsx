import { lazy, Suspense } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { RequireAuth } from "@/features/auth/RequireAuth";
import { LoginPage } from "@/features/auth/LoginPage";

// Each feature is its own chunk, fetched only when the user navigates to
// it, so the initial bundle stays small as more features are added —
// community/notices/messaging/admin are already independent enough that no
// route needs another route's code up front.
const HomePage = lazy(() =>
  import("@/features/community/HomePage").then((m) => ({ default: m.HomePage })),
);
const CommunityPage = lazy(() =>
  import("@/features/community/CommunityPage").then((m) => ({ default: m.CommunityPage })),
);
const PostPage = lazy(() =>
  import("@/features/community/CommunityPage").then((m) => ({ default: m.PostPage })),
);
const ForumPage = lazy(() =>
  import("@/features/community/ForumPage").then((m) => ({ default: m.ForumPage })),
);
const ThreadPage = lazy(() =>
  import("@/features/community/ThreadPage").then((m) => ({ default: m.ThreadPage })),
);
const NetworkPage = lazy(() =>
  import("@/features/community/NetworkPage").then((m) => ({ default: m.NetworkPage })),
);
const ProfilePage = lazy(() =>
  import("@/features/community/ProfilePage").then((m) => ({ default: m.ProfilePage })),
);
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

const WorkspacePage = lazy(() =>
  import("@/features/workspace/WorkspacePage").then((m) => ({ default: m.WorkspacePage })),
);

function RouteFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas">
      <p className="kicker animate-pulse">Loading console</p>
    </div>
  );
}

export function App() {
  return (
    <Suspense fallback={<RouteFallback />}>
      <Routes>
        {(["learning", "jobs", "sessions"] as const).map((kind) => (
          <Route
            key={kind}
            path={`/${kind}`}
            element={
              <RequireAuth>
                <WorkspacePage key={kind} kind={kind} />
              </RequireAuth>
            }
          />
        ))}
        <Route
          path="/community"
          element={
            <RequireAuth>
              <CommunityPage />
            </RequireAuth>
          }
        />
        <Route
          path="/community/posts/:id"
          element={
            <RequireAuth>
              <PostPage />
            </RequireAuth>
          }
        />
        <Route path="/login" element={<LoginPage />} />

        <Route
          path="/home"
          element={
            <RequireAuth>
              <HomePage />
            </RequireAuth>
          }
        />
        <Route
          path="/forum"
          element={
            <RequireAuth>
              <ForumPage />
            </RequireAuth>
          }
        />
        <Route
          path="/forum/:id"
          element={
            <RequireAuth>
              <ThreadPage />
            </RequireAuth>
          }
        />
        <Route
          path="/network"
          element={
            <RequireAuth>
              <NetworkPage />
            </RequireAuth>
          }
        />
        <Route
          path="/people/:id"
          element={
            <RequireAuth>
              <ProfilePage />
            </RequireAuth>
          }
        />

        <Route
          path="/notices"
          element={
            <RequireAuth>
              <NoticesListPage />
            </RequireAuth>
          }
        />
        <Route
          path="/notices/compose"
          element={
            <RequireAuth>
              <ComposeNoticePage />
            </RequireAuth>
          }
        />
        <Route
          path="/notices/:id"
          element={
            <RequireAuth>
              <NoticeDetailPage />
            </RequireAuth>
          }
        />

        <Route
          path="/messaging"
          element={
            <RequireAuth>
              <MessagingPage />
            </RequireAuth>
          }
        />
        <Route
          path="/messaging/:conversationId"
          element={
            <RequireAuth>
              <MessagingPage />
            </RequireAuth>
          }
        />

        <Route
          path="/admin"
          element={
            <RequireAuth>
              <AdminPage />
            </RequireAuth>
          }
        />

        <Route path="/" element={<Navigate to="/home" replace />} />
        <Route path="*" element={<Navigate to="/home" replace />} />
      </Routes>
    </Suspense>
  );
}
