import React, { useState } from 'react';
import { signUp, signIn, confirmSignUp } from 'aws-amplify/auth';
import { Link } from 'react-router-dom';

interface AdminRegistrationProps {
  onSignIn: () => void;
}

const AdminRegistration: React.FC<AdminRegistrationProps> = ({ onSignIn }) => {
  const [mode, setMode] = useState<'signin' | 'signup' | 'verify'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      await signIn({
        username: email,
        password: password,
      });
      onSignIn();
    } catch (error: any) {
      console.error('Sign in error:', error);
      setError(error.message || 'サインインに失敗しました');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');
    setSuccess('');

    if (password !== confirmPassword) {
      setError('パスワードが一致しません');
      setIsLoading(false);
      return;
    }

    if (password.length < 8) {
      setError('パスワードは8文字以上である必要があります');
      setIsLoading(false);
      return;
    }

    try {
      const { isSignUpComplete } = await signUp({
        username: email,
        password: password,
        options: {
          userAttributes: {
            email: email,
          },
        },
      });

      if (isSignUpComplete) {
        setSuccess('アカウントが正常に作成されました。サインインしてください。');
        setMode('signin');
        setPassword('');
        setConfirmPassword('');
      } else {
        setSuccess('確認メールを送信しました。確認コードを入力してください。');
        setMode('verify');
      }
    } catch (error: any) {
      console.error('Sign up error:', error);
      setError(error.message || 'アカウント作成に失敗しました');
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerification = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');
    setSuccess('');

    try {
      await confirmSignUp({
        username: email,
        confirmationCode: verificationCode
      });
      
      setSuccess('アカウントが正常に確認されました。サインインしてください。');
      setMode('signin');
      setVerificationCode('');
    } catch (error: any) {
      console.error('Verification error:', error);
      setError(error.message || '確認コードの検証に失敗しました');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-pink-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        <div className="bg-white/80 backdrop-blur-lg rounded-2xl shadow-xl border border-white/20 p-8">
          {/* Header */}
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent mb-2">
              管理者ページ
            </h1>
            <p className="text-gray-600">
              {mode === 'signin' ? 'サインイン' : mode === 'signup' ? 'アカウント作成' : '確認コード入力'}
            </p>
          </div>

          {/* Mode Toggle - Only show for signin/signup */}
          {mode !== 'verify' && (
            <div className="flex mb-6 bg-gray-100 rounded-lg p-1">
              <button
                type="button"
                onClick={() => {
                  setMode('signin');
                  setError('');
                  setSuccess('');
                }}
                className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-all duration-200 ${
                  mode === 'signin'
                    ? 'bg-white text-purple-600 shadow-sm'
                    : 'text-gray-600 hover:text-purple-600'
                }`}
              >
                サインイン
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode('signup');
                  setError('');
                  setSuccess('');
                }}
                className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-all duration-200 ${
                  mode === 'signup'
                    ? 'bg-white text-purple-600 shadow-sm'
                    : 'text-gray-600 hover:text-purple-600'
                }`}
              >
                アカウント作成
              </button>
            </div>
          )}

          {/* Form */}
          <form 
            onSubmit={
              mode === 'signin' ? handleSignIn : 
              mode === 'signup' ? handleSignUp : 
              handleVerification
            } 
            className="space-y-6"
            autoComplete="on"
          >
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
                {error}
              </div>
            )}

            {success && (
              <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg">
                {success}
              </div>
            )}

            {mode === 'verify' ? (
              <div>
                <label htmlFor="verificationCode" className="block text-sm font-medium text-gray-700 mb-2">
                  確認コード
                </label>
                <input
                  id="verificationCode"
                  name="verificationCode"
                  type="text"
                  value={verificationCode}
                  onChange={(e) => setVerificationCode(e.target.value)}
                  required
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all duration-200"
                  placeholder="メールに送信された確認コードを入力"
                />
                <p className="text-xs text-gray-500 mt-1">
                  {email} に送信された確認コードを入力してください
                </p>
              </div>
            ) : (
              <>
                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
                    メールアドレス
                  </label>
                  <input
                    id="email"
                    name="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoComplete="email"
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all duration-200"
                    placeholder="admin@example.com"
                  />
                </div>

                <div>
                  <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
                    パスワード
                  </label>
                  <input
                    id="password"
                    name="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all duration-200"
                    placeholder="パスワードを入力"
                  />
                  {mode === 'signup' && (
                    <p className="text-xs text-gray-500 mt-1">8文字以上で入力してください</p>
                  )}
                </div>

                {mode === 'signup' && (
                  <div>
                    <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-2">
                      パスワード確認
                    </label>
                    <input
                      id="confirmPassword"
                      name="confirmPassword"
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      required
                      autoComplete="new-password"
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all duration-200"
                      placeholder="パスワードを再入力"
                    />
                  </div>
                )}
              </>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className={`w-full py-3 px-4 rounded-lg font-medium transition-all duration-200 ${
                isLoading
                  ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  : 'bg-gradient-to-r from-purple-600 to-pink-600 text-white hover:from-purple-700 hover:to-pink-700 transform hover:scale-[1.02] shadow-lg hover:shadow-xl'
              }`}
            >
              {isLoading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="animate-spin">⏳</span>
                  {mode === 'signin' ? 'サインイン中...' : 
                   mode === 'signup' ? 'アカウント作成中...' : 
                   '確認中...'}
                </span>
              ) : (
                mode === 'signin' ? 'サインイン' : 
                mode === 'signup' ? 'アカウント作成' : 
                '確認コードを送信'
              )}
            </button>
          </form>

          {/* Back to regular login */}
          <div className="mt-8 text-center">
            <Link 
              to="/" 
              className="text-sm text-gray-500 hover:text-purple-600 transition-colors duration-200"
            >
              ← 通常ログインに戻る
            </Link>
          </div>

          {/* Footer */}
          <div className="mt-8 text-center text-sm text-gray-500">
            <p>© 2025 テラルテクノサービス株式会社</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminRegistration; 