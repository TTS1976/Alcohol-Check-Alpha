import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from '../contexts/AuthContext';
import AzureLogin from './AzureLogin';
import App from '../App';

// Loading component
const LoadingScreen: React.FC = () => (
  <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 flex items-center justify-center">
    <div className="text-center">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
      <p className="text-gray-600">読み込み中...</p>
    </div>
  </div>
);

// Main application wrapper with authentication
const AppWrapper: React.FC = () => {
  const { isAuthenticated, isLoading, user } = useAuth();

  if (isLoading) {
    return <LoadingScreen />;
  }

  if (isAuthenticated && user) {
    // Transform user object to match the expected structure for compatibility
    const transformedUser = {
      username: user.email,
      displayName: user.displayName,
      email: user.email, // Add email field
      mailNickname: user.mailNickname, // Add mailNickname field
      userPrincipalName: user.email, // Add userPrincipalName as fallback
      signInDetails: {
        loginId: user.email
      },
      // Add Azure AD specific data
      azureId: user.azureId,
      jobTitle: user.jobTitle,
      department: user.department,
      jobLevel: user.jobLevel, // Add job level
      role: user.role,
      isSafeDrivingManager: user.isSafeDrivingManager,
      manager: user.manager,
      directReports: user.directReports,
    };
    
    console.log('Transformed user data being passed to App:', transformedUser);
    
    return <App user={transformedUser} />;
  }

  return (
    <Routes>
      <Route path="/" element={<AzureLogin />} />
      <Route path="/auth/callback" element={<LoadingScreen />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
};

const AuthRouter: React.FC = () => {
  return (
    <AuthProvider>
      <Router>
        <AppWrapper />
      </Router>
    </AuthProvider>
  );
};

export default AuthRouter; 