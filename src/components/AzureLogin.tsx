import React from 'react';
import { useAuth } from '../contexts/AuthContext';
import odlsIcon from '../assets/ODLS.png';
import { logger } from '../utils/logger';

const AzureLogin: React.FC = () => {
  const { login, isLoading, error } = useAuth();
  
  const handleClearCacheAndLogin = async () => {
    try {
      // Clear browser storage
      sessionStorage.clear();
      localStorage.clear();
      
      // Force a fresh login
      await login();
    } catch (error) {
      logger.error('Clear cache and login error:', error);
    }
  };

  const handleLogin = async () => {
    try {
      await login();
    } catch (error: any) {
      logger.error('Login error:', error);
      
      // If interaction_in_progress error, suggest using the clear cache button
      if (error?.message?.includes('interaction_in_progress')) {
        logger.warn('Interaction in progress detected in AzureLogin, please use clear cache option');
      }
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        <div className="bg-white/80 backdrop-blur-lg rounded-2xl shadow-xl border border-white/20 p-8">
          {/* Header */}
          <div className="text-center mb-8">
            <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent mb-2 flex items-center justify-center gap-3">
              <img src={odlsIcon} alt="ODLS" className="w-8 h-8" />
              TTSグループ運行管理システム
            </h1>
            <p className="text-gray-600">Azure ADでサインインしてください</p>
          </div>

          {/* Error Display */}
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6">
              <div className="flex">
                <div className="flex-shrink-0">
                  <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  </svg>
                </div>
                <div className="ml-3">
                  <h3 className="text-sm font-medium text-red-800">サインインエラー</h3>
                  <div className="mt-2 text-sm text-red-700">
                    <p>{error}</p>
                    {error.includes('interaction_in_progress') && (
                      <div className="mt-2 p-2 bg-yellow-50 border border-yellow-200 rounded">
                        <p className="text-yellow-800 text-xs">
                          💡 このエラーが発生した場合は、下の「キャッシュクリア & 新規ログイン」ボタンをお試しください。
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

                      {/* Azure AD Login Buttons */}
            <div className="space-y-4">
              <button
                onClick={handleLogin}
                disabled={isLoading}
                className={`w-full py-4 px-6 rounded-lg font-medium transition-all duration-200 flex items-center justify-center gap-3 ${
                  isLoading
                    ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                    : 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white hover:from-blue-700 hover:to-indigo-700 transform hover:scale-[1.02] shadow-lg hover:shadow-xl'
                }`}
              >
              {isLoading ? (
                <>
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                  <span>サインイン中...</span>
                </>
              ) : (
                <>
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M21.54 7.67h-6.75v-1.08h6.75c.84 0 1.51-.69 1.51-1.54S22.38 3.5 21.54 3.5h-8.38c-.84 0-1.52.69-1.52 1.54v14.92c0 .85.68 1.54 1.52 1.54h8.38c.84 0 1.51-.69 1.51-1.54s-.67-1.54-1.51-1.54h-6.75v-1.08h6.75c.84 0 1.51-.69 1.51-1.54s-.67-1.54-1.51-1.54h-6.75V12.5h6.75c.84 0 1.51-.69 1.51-1.54s-.67-1.54-1.51-1.54h-6.75V8.33h6.75c.84 0 1.51-.69 1.51-1.54s-.67-1.54-1.51-1.54z"/>
                    <path d="M6.96 3.5H5.42c-.84 0-1.52.69-1.52 1.54v14.92c0 .85.68 1.54 1.52 1.54h1.54c.84 0 1.52-.69 1.52-1.54V5.04c0-.85-.68-1.54-1.52-1.54z"/>
                  </svg>
                  <span>Microsoft Azure AD でサインイン</span>
                </>
              )}
            </button>

            {/* Clear Cache Button for Debugging */}
            <button
              onClick={handleClearCacheAndLogin}
              disabled={isLoading}
              className={`w-full py-3 px-4 rounded-lg font-medium transition-all duration-200 flex items-center justify-center gap-2 ${
                isLoading
                  ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  : 'bg-orange-600 text-white hover:bg-orange-700 transform hover:scale-[1.02] shadow-md hover:shadow-lg'
              }`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              <span>キャッシュクリア & 新規ログイン</span>
            </button>

            {/* Information Section */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="flex">
                <div className="flex-shrink-0">
                  <svg className="h-5 w-5 text-blue-400" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                  </svg>
                </div>
                <div className="ml-3">
                  <h3 className="text-sm font-medium text-blue-800">ご注意</h3>
                  <div className="mt-2 text-sm text-blue-700">
                    <ul className="list-disc list-inside space-y-1">
                      <li>組織のAzure ADアカウントが必要です</li>
                      <li>初回ログイン時は追加の権限許可が必要な場合があります</li>
                      <li>問題が発生した場合は管理者にお問い合わせください</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="mt-8 text-center text-sm text-gray-500">
            <p>© 2025 テラルテクノサービス株式会社</p>
            <p className="mt-1">Powered by Microsoft Azure AD</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AzureLogin; 