import { Configuration, PopupRequest, LogLevel } from '@azure/msal-browser';

// Azure AD Configuration
export const msalConfig: Configuration = {
  auth: {
    clientId: import.meta.env.VITE_AZURE_CLIENT_ID || '9aa3d256-5e02-402e-a381-d91350dc9690',
    authority: `https://login.microsoftonline.com/${import.meta.env.VITE_AZURE_TENANT_ID || 'e8b700c2-ccda-48a5-b90e-c7ce67be6546'}`,
    redirectUri: import.meta.env.VITE_REDIRECT_URI || 'http://localhost:5173/auth/callback',
    postLogoutRedirectUri: import.meta.env.VITE_POST_LOGOUT_REDIRECT_URI || 'http://localhost:5173',
  },
  cache: {
    cacheLocation: 'sessionStorage', // This configures where your cache will be stored
    storeAuthStateInCookie: false, // Set this to "true" if you are having issues on IE11 or Edge
  },
  system: {
    loggerOptions: {
      loggerCallback: (level, message, containsPii) => {
        if (containsPii) {
          return;
        }
        switch (level) {
          case LogLevel.Error:
            console.error(message);
            return;
          case LogLevel.Info:
            console.info(message);
            return;
          case LogLevel.Verbose:
            console.debug(message);
            return;
          case LogLevel.Warning:
            console.warn(message);
            return;
        }
      },
    },
  },
};

// Login request configuration
export const loginRequest: PopupRequest = {
  scopes: [
    'User.Read',
    'Directory.Read.All',
    'User.Read.All',
    'ChannelMessage.Send',  // Add Teams messaging permission
    'profile',
    'openid',
    'email'
  ],
};

// Microsoft Graph API configuration
export const graphConfig = {
  graphMeEndpoint: 'https://graph.microsoft.com/v1.0/me',
  graphUsersEndpoint: 'https://graph.microsoft.com/v1.0/users',
  graphManagerEndpoint: 'https://graph.microsoft.com/v1.0/me/manager',
  graphDirectReportsEndpoint: 'https://graph.microsoft.com/v1.0/me/directReports',
};

// Japanese Corporate Hierarchy Table
// Maps job titles to their corresponding levels and order within that level
export const JAPANESE_HIERARCHY = {
  // Level 1 - 一般
  1: {
    1: { name: '一般', nameEn: 'General', keywords: ['一般', 'general', '社員', 'employee'] }
  },
  // Level 2 - 所長/グループリーダー
  2: {
    1: { name: 'グループリーダー', nameEn: 'Group Leader', keywords: ['グループリーダー', 'group leader', 'GL', 'チームリーダー', 'team leader'] },
    2: { name: '所長', nameEn: 'Office Director', keywords: ['所長', 'office director', 'office manager'] }
  },
  // Level 3 - 課長代理/副支店長
  3: {
    1: { name: '課長代理', nameEn: 'Deputy Section Chief', keywords: ['課長代理', 'deputy section chief', '代理', 'assistant manager'] },
    2: { name: '副支店長', nameEn: 'Deputy Branch Manager', keywords: ['副支店長', 'deputy branch manager', '副店長'] }
  },
  // Level 4 - 支店長/専門課長/課長 (KEY LEVEL - 課長)
  4: {
    1: { name: '支店長', nameEn: 'Branch Manager', keywords: ['支店長', 'branch manager', '店長'] },
    2: { name: '専門課長', nameEn: 'Specialist Section Chief', keywords: ['専門課長', 'specialist section chief', '専門管理職'] },
    3: { name: '課長', nameEn: 'Section Chief', keywords: ['課長', 'section chief', 'manager', '課長'] }
  },
  // Level 5 - 室長
  5: {
    1: { name: '室長', nameEn: 'Office Manager', keywords: ['室長', 'office manager'] }
  },
  // Level 6 - 次長
  6: {
    1: { name: '次長', nameEn: 'Deputy General Manager', keywords: ['次長', 'deputy general manager', 'deputy director'] }
  },
  // Level 7 - 部長/専門部長
  7: {
    1: { name: '部長', nameEn: 'Department Manager', keywords: ['部長', 'department manager', 'director'] },
    2: { name: '専門部長', nameEn: 'Specialist Department Manager', keywords: ['専門部長', 'specialist department manager'] }
  },
  // Level 8 - 本部長
  8: {
    1: { name: '本部長', nameEn: 'Division Manager', keywords: ['本部長', 'division manager', 'general manager'] }
  }
} as const;

// Helper function to extract job level and order from job title
export const parseJobTitle = (jobTitle: string): { level: number; order: number; position: string } => {
  if (!jobTitle) {
    return { level: 1, order: 1, position: '一般' };
  }

  const titleLower = jobTitle.toLowerCase();
  
  // Search through hierarchy table
  for (const [levelStr, positions] of Object.entries(JAPANESE_HIERARCHY)) {
    const level = parseInt(levelStr);
    for (const [orderStr, positionData] of Object.entries(positions)) {
      const order = parseInt(orderStr);
      const { keywords, name } = positionData;
      
      // Check if any keyword matches the job title
      for (const keyword of keywords) {
        if (titleLower.includes(keyword.toLowerCase()) || jobTitle.includes(keyword)) {
          return { level, order, position: name };
        }
      }
    }
  }
  
  // Default fallback
  return { level: 1, order: 1, position: '一般' };
};

// Helper function to get position display name by level and order
export const getPositionByLevelOrder = (level: number, order: number): string => {
  return JAPANESE_HIERARCHY[level as keyof typeof JAPANESE_HIERARCHY]?.[order as keyof typeof JAPANESE_HIERARCHY[keyof typeof JAPANESE_HIERARCHY]]?.name || '一般';
};

// Helper function to check if a position is 課長 level (level 4)
export const isKachoLevel = (level: number): boolean => {
  return level === 4;
};

// Helper function to get all positions at a specific level
export const getPositionsAtLevel = (level: number): Array<{order: number, name: string, nameEn: string}> => {
  const levelData = JAPANESE_HIERARCHY[level as keyof typeof JAPANESE_HIERARCHY];
  if (!levelData) return [];
  
  return Object.entries(levelData).map(([orderStr, data]) => ({
    order: parseInt(orderStr),
    name: data.name,
    nameEn: data.nameEn
  }));
};

// Role definitions
export const ROLES = {
  ENTRY_LEVEL: 'EntryLevel', // JobLevel < 4
  MANAGER: 'Manager', // JobLevel >= 4
  SAFE_DRIVING_MANAGER: 'SafeDrivingManager', // Special role stored in database
} as const;

export type UserRole = typeof ROLES[keyof typeof ROLES];

// Job level thresholds
export const JOB_LEVEL_THRESHOLD = 4; 