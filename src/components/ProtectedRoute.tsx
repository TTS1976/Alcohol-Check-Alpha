import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { UserRole } from '../config/authConfig';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredRole?: UserRole;
  requireSafeDrivingManager?: boolean;
  redirectTo?: string;
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
  children,
  requiredRole,
  requireSafeDrivingManager = false,
  redirectTo = '/reports'
}) => {
  const { isAuthenticated, user, isLoading } = useAuth();
  const location = useLocation();

  // Show loading screen while checking authentication
  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">認証を確認中...</p>
        </div>
      </div>
    );
  }

  // Redirect to login if not authenticated
  if (!isAuthenticated || !user) {
    return <Navigate to="/" state={{ from: location }} replace />;
  }

  // Check if SafeDrivingManager role is required
  if (requireSafeDrivingManager && !user.isSafeDrivingManager) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full">
          <div className="bg-white/80 backdrop-blur-lg rounded-2xl shadow-xl border border-white/20 p-8 text-center">
            <div className="mb-6">
              <div className="mx-auto w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mb-4">
                <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
              </div>
              <h2 className="text-xl font-semibold text-gray-900 mb-2">アクセス権限がありません</h2>
              <p className="text-gray-600 mb-6">
                この機能にアクセスするには、SafeDrivingManager権限が必要です。
              </p>
              <button
                onClick={() => window.history.back()}
                className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-lg transition-colors duration-200"
              >
                戻る
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Check specific role requirements
  if (requiredRole && user.role !== requiredRole && user.role !== 'SafeDrivingManager') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full">
          <div className="bg-white/80 backdrop-blur-lg rounded-2xl shadow-xl border border-white/20 p-8 text-center">
            <div className="mb-6">
              <div className="mx-auto w-16 h-16 bg-yellow-100 rounded-full flex items-center justify-center mb-4">
                <svg className="w-8 h-8 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
              <h2 className="text-xl font-semibold text-gray-900 mb-2">役職レベルが不足しています</h2>
              <p className="text-gray-600 mb-6">
                この機能にアクセスするには、{requiredRole === 'Manager' ? '管理者' : '上位'}権限が必要です。
                <br />
                <span className="text-sm text-gray-500 mt-2 block">
                  現在の役職: {user.jobTitle} (レベル {user.jobLevel})
                </span>
              </p>
              <button
                onClick={() => window.history.back()}
                className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-lg transition-colors duration-200"
              >
                戻る
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Check for management routes (routes containing 'manage')
  if (location.pathname.includes('manage') && !user.isSafeDrivingManager) {
    return <Navigate to={redirectTo} replace />;
  }

  // All checks passed, render the protected component
  return <>{children}</>;
};

export default ProtectedRoute; 