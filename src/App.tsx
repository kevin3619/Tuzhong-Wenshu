import { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';

// Pages
import LoginPage from '@/pages/LoginPage';
import RegisterPage from '@/pages/RegisterPage';
import ProjectsPage from '@/pages/ProjectsPage';
import EditorPage from '@/pages/EditorPage';
import OutlineGeneratorPage from '@/pages/OutlineGeneratorPage';
import CharacterManagementPage from '@/pages/CharacterManagementPage';
import WorldSettingPage from '@/pages/WorldSettingPage';
import ChapterManagementPage from '@/pages/ChapterManagementPage';
import VersionControlPage from '@/pages/VersionControlPage';
import UserStatsPage from '@/pages/UserStatsPage';
import ExportPage from '@/pages/ExportPage';

// Loading component
const LoadingPage = () => (
  <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-500 to-purple-600">
    <div className="text-white text-center">
      <div className="mb-4">
        <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-white"></div>
      </div>
      <p className="text-xl">加载中...</p>
    </div>
  </div>
);

// Protected Route component
const ProtectedRoute = ({
  isAuthenticated,
  children,
}: {
  isAuthenticated: boolean;
  children: React.ReactNode;
}) => {
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
};

// Public Route component
const PublicRoute = ({
  isAuthenticated,
  children,
}: {
  isAuthenticated: boolean;
  children: React.ReactNode;
}) => {
  if (isAuthenticated) {
    return <Navigate to="/projects" replace />;
  }
  return <>{children}</>;
};

function App() {
  const { user, checkAuth } = useAuth();
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const initAuth = async () => {
      await checkAuth();
      setIsLoading(false);
    };
    initAuth();
  }, [checkAuth]);

  if (isLoading) {
    return <LoadingPage />;
  }

  const isAuthenticated = !!user;

  return (
    <Router>
      <Routes>
        {/* Public Routes */}
        <Route
          path="/login"
          element={
            <PublicRoute isAuthenticated={isAuthenticated}>
              <LoginPage />
            </PublicRoute>
          }
        />
        <Route
          path="/register"
          element={
            <PublicRoute isAuthenticated={isAuthenticated}>
              <RegisterPage />
            </PublicRoute>
          }
        />

        {/* Protected Routes */}
        <Route
          path="/projects"
          element={
            <ProtectedRoute isAuthenticated={isAuthenticated}>
              <ProjectsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/editor/:id"
          element={
            <ProtectedRoute isAuthenticated={isAuthenticated}>
              <EditorPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/outline-generator"
          element={
            <ProtectedRoute isAuthenticated={isAuthenticated}>
              <OutlineGeneratorPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/characters/:novelId"
          element={
            <ProtectedRoute isAuthenticated={isAuthenticated}>
              <CharacterManagementPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/world-settings/:novelId"
          element={
            <ProtectedRoute isAuthenticated={isAuthenticated}>
              <WorldSettingPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/chapters/:novelId"
          element={
            <ProtectedRoute isAuthenticated={isAuthenticated}>
              <ChapterManagementPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/versions/:novelId"
          element={
            <ProtectedRoute isAuthenticated={isAuthenticated}>
              <VersionControlPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/export"
          element={
            <ProtectedRoute isAuthenticated={isAuthenticated}>
              <ExportPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/profile"
          element={
            <ProtectedRoute isAuthenticated={isAuthenticated}>
              <UserStatsPage />
            </ProtectedRoute>
          }
        />

        {/* Default Route */}
        <Route path="/" element={<Navigate to={isAuthenticated ? '/projects' : '/login'} replace />} />
        <Route path="*" element={<Navigate to={isAuthenticated ? '/projects' : '/login'} replace />} />
      </Routes>
    </Router>
  );
}

export default App;
