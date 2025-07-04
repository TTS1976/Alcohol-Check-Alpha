import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import {
  PublicClientApplication,
  SilentRequest,
  InteractionRequiredAuthError,
} from '@azure/msal-browser';
import { msalConfig, loginRequest } from '../config/authConfig';
import { AuthContextType, AuthState } from '../types/auth';
import { GraphService } from '../services/graphService';
import { UserRole, ADMIN_DEPARTMENTS } from '../config/authConfig';
import { logger } from '../utils/logger';

// Create MSAL instance
const msalInstance = new PublicClientApplication(msalConfig);

// Initialize MSAL
msalInstance.initialize().then(() => {
  logger.info('MSAL initialized');
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

      // Handle any redirect responses first
      try {
        const redirectResponse = await msalInstance.handleRedirectPromise();
        if (redirectResponse) {
          msalInstance.setActiveAccount(redirectResponse.account);
          
          // Build user profile after successful redirect login
          const tempGraphService = new GraphService(getAccessToken);
          const appUser = await tempGraphService.buildAppUser(redirectResponse.account);

          setAuthState({
            isAuthenticated: true,
            isLoading: false,
            user: appUser,
            account: redirectResponse.account,
            error: null,
          });

          setGraphService(tempGraphService);
          return;
        }
      } catch (redirectError) {
        // Continue to check cached accounts
      }

      const accounts = msalInstance.getAllAccounts();
      
      if (accounts.length === 0) {
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
      msalInstance.setActiveAccount(account);

          // Test if tokens are still valid by trying to get an access token
    try {
      const token = await getAccessToken();
      if (!token || token.length < 10) {
        throw new Error('Invalid token format');
      }
    } catch (tokenError) {
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
    } catch (error) {
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

      // Check if there's already an interaction in progress
      const inProgress = msalInstance.getActiveAccount();
      if (inProgress) {
        await msalInstance.clearCache();
        // Add small delay to ensure state is cleared
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      // Handle any ongoing interactions
      try {
        await msalInstance.handleRedirectPromise();
      } catch (handleError) {
        // No redirect to handle or error handling redirect
      }

      let response;
      try {
        response = await msalInstance.loginPopup({
          ...loginRequest,
          prompt: 'select_account', // Force account selection
        });
      } catch (popupError: any) {
        // If popup is blocked or interaction_in_progress error, try redirect
        if (popupError.errorCode === 'interaction_in_progress' || 
            popupError.message?.includes('interaction_in_progress')) {
          // Force clear any ongoing interactions
          await msalInstance.clearCache();
          await new Promise(resolve => setTimeout(resolve, 500));
          
          // Try again with redirect if popup fails
          try {
            response = await msalInstance.loginPopup({
              ...loginRequest,
              prompt: 'select_account',
            });
          } catch (retryError) {
            await msalInstance.loginRedirect({
              ...loginRequest,
              prompt: 'select_account',
            });
            return; // Exit here as redirect will handle the rest
          }
        } else {
          throw popupError;
        }
      }
      
      if (response && response.account) {
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
    } catch (error: any) {
      logger.error('Login failed:', error);
      
      // Clear cache on error to prevent stuck states
      try {
        await msalInstance.clearCache();
      } catch (clearError) {
        logger.error('Failed to clear cache after login error:', clearError);
      }
      
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
      
      // First, force clear any ongoing interactions
      try {
        await msalInstance.clearCache();
        logger.debug('Cache cleared successfully');
      } catch (clearError) {
        logger.error('Error clearing cache:', clearError);
      }
      
      // Reset local state immediately
      setAuthState({
        isAuthenticated: false,
        isLoading: false,
        user: null,
        account: null,
        error: null,
      });
      setGraphService(null);
      
      // Then attempt logout with the server
      if (account) {
        try {
          await msalInstance.logoutPopup({
            account: account,
            mainWindowRedirectUri: msalConfig.auth.postLogoutRedirectUri || undefined,
          });
        } catch (logoutError: any) {
          
          // If popup logout fails, clear everything and use redirect
          try {
            // Clear everything again before redirect
            await msalInstance.clearCache();
            await msalInstance.logoutRedirect({
              account: account,
              postLogoutRedirectUri: msalConfig.auth.postLogoutRedirectUri || undefined,
            });
          } catch (redirectError) {
            // Force clean state and reload
            window.location.reload();
          }
        }
      }
      
      // Small delay before reload to ensure logout completes
      setTimeout(() => {
        window.location.reload();
      }, 500);
      
    } catch (error) {
      // Force clear everything even if logout fails
      try {
        await msalInstance.clearCache();
      } catch (clearError) {
        // Final cache clear failed
      }
      
      // Reset state regardless
      setAuthState({
        isAuthenticated: false,
        isLoading: false,
        user: null,
        account: null,
        error: null,
      });
      setGraphService(null);
      
      // Force page reload as final fallback
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
      setAuthState(prev => ({
        ...prev,
        isLoading: false,
        error: error instanceof Error ? error.message : 'Failed to refresh user data',
      }));
    }
  };

  const checkUserRole = (requiredRole: UserRole): boolean => {
    if (!authState.user) return false;
    // Department-based admin
    if (authState.user && authState.user.department && ADMIN_DEPARTMENTS.some(dept => authState.user!.department!.includes(dept))) {
      return true; // Grant all permissions
    }
    // SafeDrivingManager has access to everything
    if (authState.user.role === 'SafeDrivingManager') return true;
    return authState.user.role === requiredRole;
  };

  const canSelectConfirmer = (confirmerId: string): boolean => {
    if (!authState.user) return false;
    // Department-based admin
    if (authState.user && authState.user.department && ADMIN_DEPARTMENTS.some(dept => authState.user!.department!.includes(dept))) {
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