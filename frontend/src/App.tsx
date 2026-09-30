import { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import './lib/i18n';
import { AppLayout } from './components/shared/AppLayout';
import { Toaster } from './components/ui/toast';
import { SkeletonCard } from './components/shared/states';
import { LandingPage } from './pages/landing/LandingPage';
import { ChatPage } from './pages/chat/ChatPage';
import { LoginPage, RegisterPage } from './pages/auth/AuthPages';

const ProfilePage = lazy(() => import('./pages/profile/ProfilePage').then((m) => ({ default: m.ProfilePage })));
const RoadmapPage = lazy(() => import('./pages/roadmap/RoadmapPage').then((m) => ({ default: m.RoadmapPage })));
const RoadmapIndexRedirect = lazy(() => import('./pages/roadmap/RoadmapPage').then((m) => ({ default: m.RoadmapIndexRedirect })));
const ApplicationsPage = lazy(() => import('./pages/applications/ApplicationsPage').then((m) => ({ default: m.ApplicationsPage })));
const StandardsPage = lazy(() => import('./pages/standards/StandardsPage').then((m) => ({ default: m.StandardsPage })));
const StandardDetailPage = lazy(() => import('./pages/standards/StandardDetailPage').then((m) => ({ default: m.StandardDetailPage })));
const LabsPage = lazy(() => import('./pages/labs/LabsPage').then((m) => ({ default: m.LabsPage })));
const ConsumerPage = lazy(() => import('./pages/consumer/ConsumerPage').then((m) => ({ default: m.ConsumerPage })));
const AdminMetricsPage = lazy(() => import('./pages/admin/AdminPages').then((m) => ({ default: m.AdminMetricsPage })));
const AdminSourcesPage = lazy(() => import('./pages/admin/AdminPages').then((m) => ({ default: m.AdminSourcesPage })));

function PageFallback() {
  return (
    <div className="mx-auto max-w-3xl space-y-4 px-4 py-8">
      <SkeletonCard lines={3} />
      <SkeletonCard lines={4} />
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route
          path="/*"
          element={
            <AppLayout>
              <Suspense fallback={<PageFallback />}>
                <Routes>
                  <Route path="chat" element={<ChatPage />} />
                  <Route path="chat/:conversationId" element={<ChatPage />} />
                  <Route path="business/:businessId" element={<ProfilePage />} />
                  <Route path="business/:businessId/roadmap" element={<RoadmapPage />} />
                  <Route path="roadmap" element={<RoadmapIndexRedirect />} />
                  <Route path="applications" element={<ApplicationsPage />} />
                  <Route path="standards" element={<StandardsPage />} />
                  <Route path="standards/compare" element={<StandardsPage />} />
                  <Route path="standards/:standardId" element={<StandardDetailPage />} />
                  <Route path="labs" element={<LabsPage />} />
                  <Route path="consumer" element={<ConsumerPage />} />
                  <Route path="admin/metrics" element={<AdminMetricsPage />} />
                  <Route path="admin/sources" element={<AdminSourcesPage />} />
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
              </Suspense>
            </AppLayout>
          }
        />
      </Routes>
      <Toaster />
    </BrowserRouter>
  );
}
