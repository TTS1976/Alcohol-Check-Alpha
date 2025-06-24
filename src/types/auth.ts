import { AccountInfo } from '@azure/msal-browser';
import { UserRole } from '../config/authConfig';

// Extended user information from Microsoft Graph
export interface GraphUser {
  id: string;
  displayName: string;
  mail: string;
  userPrincipalName: string;
  givenName: string;
  surname: string;
  jobTitle: string;
  department: string;
  mobilePhone?: string;
  businessPhones: string[];
  officeLocation?: string;
  employeeId?: string;
  mailNickname: string;
}

// Manager information
export interface GraphManager {
  id: string;
  displayName: string;
  mail: string;
  jobTitle: string;
  department: string;
  mailNickname: string;
}

// Direct reports information
export interface GraphDirectReport {
  id: string;
  displayName: string;
  mail: string;
  jobTitle: string;
  department: string;
  mailNickname: string;
}

// Application-specific user data
export interface AppUser {
  // Azure AD data
  azureId: string;
  email: string;
  displayName: string;
  firstName: string;
  lastName: string;
  mailNickname: string; // Primary identifier for database operations
  
  // Organizational data from Graph API
  jobTitle: string;
  department: string;
  employeeId?: string;
  officeLocation?: string;
  mobilePhone?: string;
  businessPhones: string[];
  
  // Role and hierarchy data
  jobLevel: number; // Derived from jobTitle using hierarchy table
  jobOrder: number; // Order within the job level (1, 2, 3...)
  position: string; // Parsed position name from hierarchy table (e.g., '課長', '部長')
  role: UserRole;
  isSafeDrivingManager: boolean;
  
  // Manager and subordinates
  manager?: GraphManager | null;
  directReports: GraphDirectReport[];
  
  // Permissions for the hierarchy system
  canSelectConfirmers: string[]; // Array of user IDs that this user can select as confirmers
  
  // Session data
  lastLogin: Date;
  sessionId: string;
}

// Authentication state
export interface AuthState {
  isAuthenticated: boolean;
  isLoading: boolean;
  user: AppUser | null;
  account: AccountInfo | null;
  error: string | null;
}

// Authentication context
export interface AuthContextType extends AuthState {
  login: () => Promise<void>;
  logout: () => Promise<void>;
  refreshUserData: () => Promise<void>;
  checkUserRole: (requiredRole: UserRole) => boolean;
  canSelectConfirmer: (confirmerId: string) => boolean;
  graphService?: any; // GraphService instance for direct API access
}

// Hierarchy levels for confirmer selection
export interface ConfirmerOption {
  id: string;
  name: string;
  email: string;
  jobTitle: string;
  department: string;
  jobLevel: number;
  relationship: 'manager' | 'subordinate' | 'self';
} 