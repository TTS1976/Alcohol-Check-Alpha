import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import {
  PublicClientApplication,
  SilentRequest,
  InteractionRequiredAuthError,
} from '@azure/msal-browser';
import { msalConfig, loginRequest } from '../config/authConfig';
import { AuthContextType, AuthState } from '../types/auth';
import { GraphService } from '../services/graphService';
import { UserRole } from '../config/authConfig';

// Create MSAL instance
const msalInstance = new PublicClientApplication(msalConfig);

// Initialize MSAL
msalInstance.initialize().then(() => {
  console.log('MSAL initialized');
});

const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AuthProviderProps {
  children: React.ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [authState, setAuthState] = useState<AuthState>({
    isAuthenticated: false,
    isLoading: true,
    user: null,
    account: null,
    error: null,
  });

  const [graphService, setGraphService] = useState<GraphService | null>(null);

  // Get access token for Microsoft Graph API
  const getAccessToken = useCallback(async (): Promise<string> => {
    const account = msalInstance.getActiveAccount();
    if (!account) {
      throw new Error('No active account found');
    }

    const silentRequest: SilentRequest = {
      ...loginRequest,
      account: account,
    };

    try {
      const response = await msalInstance.acquireTokenSilent(silentRequest);
      return response.accessToken;
    } catch (error) {
      if (error instanceof InteractionRequiredAuthError) {
        // Fallback to interactive method if silent fails
        const response = await msalInstance.acquireTokenPopup(loginRequest);
        return response.accessToken;
      }
      throw error;
    }
  }, []);

  // Initialize Graph Service
  useEffect(() => {
    if (authState.isAuthenticated && !graphService) {
      setGraphService(new GraphService(getAccessToken));
    }
  }, [authState.isAuthenticated, graphService, getAccessToken]);

  // Check authentication state on mount
  useEffect(() => {
    checkAuthState();
  }, []);

  const checkAuthState = async () => {
    try {
      setAuthState(prev => ({ ...prev, isLoading: true, error: null }));

      const accounts = msalInstance.getAllAccounts();
      console.log('Checking auth state, found accounts:', accounts.length);
      
      if (accounts.length === 0) {
        console.log('No cached accounts found, user needs to login');
        setAuthState({
          isAuthenticated: false,
          isLoading: false,
          user: null,
          account: null,
          error: null,
        });
        return;
      }

      const account = accounts[0];
      console.log('Found cached account:', account.username);
      msalInstance.setActiveAccount(account);

      // Test if tokens are still valid by trying to get an access token
      try {
        await getAccessToken();
        console.log('Tokens are valid, building user profile');
      } catch (tokenError) {
        console.log('Tokens expired or invalid, clearing cache');
        await msalInstance.clearCache();
        setAuthState({
          isAuthenticated: false,
          isLoading: false,
          user: null,
          account: null,
          error: null,
        });
        return;
      }

      // Initialize GraphService and build user profile
      const tempGraphService = new GraphService(getAccessToken);
      const appUser = await tempGraphService.buildAppUser(account);

      setAuthState({
        isAuthenticated: true,
        isLoading: false,
        user: appUser,
        account: account,
        error: null,
      });

      setGraphService(tempGraphService);
      console.log('User authenticated successfully:', appUser.displayName);
    } catch (error) {
      console.error('Auth state check failed:', error);
      // Clear cache if there's an error
      await msalInstance.clearCache();
      setAuthState({
        isAuthenticated: false,
        isLoading: false,
        user: null,
        account: null,
        error: error instanceof Error ? error.message : 'Authentication failed',
      });
    }
  };

  const login = async () => {
    try {
      setAuthState(prev => ({ ...prev, isLoading: true, error: null }));

      // Force a fresh login by clearing any existing accounts first
      const accounts = msalInstance.getAllAccounts();
      if (accounts.length > 0) {
        console.log('Clearing existing accounts to force fresh login');
        await msalInstance.clearCache();
      }

      const response = await msalInstance.loginPopup({
        ...loginRequest,
        prompt: 'select_account', // Force account selection
      });
      
      if (response.account) {
        msalInstance.setActiveAccount(response.account);
        
        // Build user profile after successful login
        const tempGraphService = new GraphService(getAccessToken);
        const appUser = await tempGraphService.buildAppUser(response.account);

        setAuthState({
          isAuthenticated: true,
          isLoading: false,
          user: appUser,
          account: response.account,
          error: null,
        });

        setGraphService(tempGraphService);
      }
    } catch (error) {
      console.error('Login failed:', error);
      setAuthState(prev => ({
        ...prev,
        isLoading: false,
        error: error instanceof Error ? error.message : 'Login failed',
      }));
    }
  };

  const logout = async () => {
    try {
      setAuthState(prev => ({ ...prev, isLoading: true }));

      const account = msalInstance.getActiveAccount();
      
      // Clear all cached data first
      await msalInstance.clearCache();
      
      // Then perform logout
      if (account) {
        try {
          await msalInstance.logoutPopup({
            account: account,
            mainWindowRedirectUri: msalConfig.auth.postLogoutRedirectUri || undefined,
          });
        } catch (logoutError) {
          // If popup logout fails, try redirect logout
          console.warn('Popup logout failed, trying redirect logout:', logoutError);
          await msalInstance.logoutRedirect({
            account: account,
            postLogoutRedirectUri: msalConfig.auth.postLogoutRedirectUri || undefined,
          });
        }
      }

      // Force state reset regardless of logout method
      setAuthState({
        isAuthenticated: false,
        isLoading: false,
        user: null,
        account: null,
        error: null,
      });

      setGraphService(null);
      
      // Reload the page to ensure clean state
      window.location.reload();
      
    } catch (error) {
      console.error('Logout failed:', error);
      
      // Even if logout fails, clear local state
      setAuthState({
        isAuthenticated: false,
        isLoading: false,
        user: null,
        account: null,
        error: error instanceof Error ? error.message : 'Logout failed',
      });
      
      setGraphService(null);
      
      // Force page reload as fallback
      setTimeout(() => window.location.reload(), 1000);
    }
  };

  const refreshUserData = async () => {
    if (!authState.account || !graphService) {
      return;
    }

    try {
      setAuthState(prev => ({ ...prev, isLoading: true, error: null }));

      const appUser = await graphService.buildAppUser(authState.account);
      setAuthState(prev => ({
        ...prev,
        user: appUser,
        isLoading: false,
      }));
    } catch (error) {
      console.error('Failed to refresh user data:', error);
      setAuthState(prev => ({
        ...prev,
        isLoading: false,
        error: error instanceof Error ? error.message : 'Failed to refresh user data',
      }));
    }
  };

  const checkUserRole = (requiredRole: UserRole): boolean => {
    if (!authState.user) return false;
    
    // TEMPORARY: Give syed00 full admin privileges for testing
    if (authState.user.mailNickname === 'syed00') {
      return true; // Grant all permissions
    }
    
    // SafeDrivingManager has access to everything
    if (authState.user.role === 'SafeDrivingManager') return true;
    
    return authState.user.role === requiredRole;
  };

  const canSelectConfirmer = (confirmerId: string): boolean => {
    if (!authState.user) return false;
    
    // TEMPORARY: Give syed00 full confirmer selection privileges for testing
    if (authState.user.mailNickname === 'syed00') {
      return true; // Can select any confirmer
    }
    
    return authState.user.canSelectConfirmers.includes(confirmerId);
  };

  const contextValue: AuthContextType = {
    ...authState,
    login,
    logout,
    refreshUserData,
    checkUserRole,
    canSelectConfirmer,
    graphService, // Expose GraphService
  };

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
};

// Custom hook to use auth context
export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export default AuthContext; 