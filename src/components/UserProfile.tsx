import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';

const UserProfile: React.FC = () => {
  const { user, logout, refreshUserData } = useAuth();
  const [isRefreshing, setIsRefreshing] = useState(false);

  if (!user) return null;

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await refreshUserData();
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleLogout = async () => {
    try {
      await logout();
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case 'SafeDrivingManager':
        return 'bg-purple-100 text-purple-800 border-purple-200';
      case 'Manager':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'EntryLevel':
        return 'bg-green-100 text-green-800 border-green-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getRoleDisplayName = (role: string) => {
    switch (role) {
      case 'SafeDrivingManager':
        return '安全運転管理者';
      case 'Manager':
        return '管理者';
      case 'EntryLevel':
        return '一般職員';
      default:
        return role;
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold text-gray-900">ユーザープロフィール</h2>
        <div className="flex gap-2">
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="text-blue-600 hover:text-blue-800 p-2 rounded-lg hover:bg-blue-50 transition-colors duration-200"
            title="プロフィール情報を更新"
          >
            <svg 
              className={`w-5 h-5 ${isRefreshing ? 'animate-spin' : ''}`} 
              fill="none" 
              stroke="currentColor" 
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
          <button
            onClick={handleLogout}
            className="text-red-600 hover:text-red-800 p-2 rounded-lg hover:bg-red-50 transition-colors duration-200"
            title="サインアウト"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Basic Information */}
        <div className="space-y-4">
          <h3 className="text-lg font-medium text-gray-900 border-b border-gray-200 pb-2">基本情報</h3>
          
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700">表示名</label>
              <p className="mt-1 text-sm text-gray-900">{user.displayName}</p>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700">メールアドレス</label>
              <p className="mt-1 text-sm text-gray-900">{user.email}</p>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700">職位</label>
              <p className="mt-1 text-sm text-gray-900">{user.jobTitle}</p>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700">部署</label>
              <p className="mt-1 text-sm text-gray-900">{user.department}</p>
            </div>

            {user.employeeId && (
              <div>
                <label className="block text-sm font-medium text-gray-700">社員ID</label>
                <p className="mt-1 text-sm text-gray-900">{user.employeeId}</p>
              </div>
            )}
          </div>
        </div>

        {/* Role and Permissions */}
        <div className="space-y-4">
          <h3 className="text-lg font-medium text-gray-900 border-b border-gray-200 pb-2">権限情報</h3>
          
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700">役割</label>
              <div className="mt-1">
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${getRoleBadgeColor(user.role)}`}>
                  {getRoleDisplayName(user.role)}
                </span>
              </div>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700">職位レベル</label>
              <p className="mt-1 text-sm text-gray-900">レベル {user.jobLevel}</p>
            </div>

            {user.isSafeDrivingManager && (
              <div>
                <label className="block text-sm font-medium text-gray-700">特別権限</label>
                <div className="mt-1">
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800 border border-purple-200">
                    安全運転管理者
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Manager Information */}
        {user.manager && (
          <div className="space-y-4">
            <h3 className="text-lg font-medium text-gray-900 border-b border-gray-200 pb-2">上司情報</h3>
            
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="space-y-2">
                <div>
                  <label className="block text-sm font-medium text-gray-700">上司</label>
                  <p className="mt-1 text-sm text-gray-900">{user.manager.displayName}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">メールアドレス</label>
                  <p className="mt-1 text-sm text-gray-900">{user.manager.mail}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">職位</label>
                  <p className="mt-1 text-sm text-gray-900">{user.manager.jobTitle}</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Direct Reports */}
        {user.directReports.length > 0 && (
          <div className="space-y-4">
            <h3 className="text-lg font-medium text-gray-900 border-b border-gray-200 pb-2">部下 ({user.directReports.length}名)</h3>
            
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {user.directReports.map((report) => (
                <div key={report.id} className="bg-gray-50 rounded-lg p-3">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-medium text-sm text-gray-900">{report.displayName}</p>
                      <p className="text-xs text-gray-600">{report.jobTitle}</p>
                      <p className="text-xs text-gray-500">{report.mail}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Session Information */}
      <div className="mt-6 pt-6 border-t border-gray-200">
        <div className="flex justify-between items-center text-sm text-gray-500">
          <span>最終サインイン: {user.lastLogin.toLocaleString('ja-JP')}</span>
          <span>セッションID: {user.sessionId.substring(0, 8)}...</span>
        </div>
      </div>
    </div>
  );
};

export default UserProfile; 