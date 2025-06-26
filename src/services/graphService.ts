import { Client } from '@microsoft/microsoft-graph-client';
import { AuthenticationProvider } from '@microsoft/microsoft-graph-client';
import { AccountInfo } from '@azure/msal-browser';
import { GraphUser, GraphManager, GraphDirectReport, AppUser } from '../types/auth';
import { ROLES, JOB_LEVEL_THRESHOLD, UserRole, parseJobTitle } from '../config/authConfig';

// Custom authentication provider for Microsoft Graph
class MsalAuthenticationProvider implements AuthenticationProvider {
  private getAccessTokenFn: () => Promise<string>;

  constructor(getAccessToken: () => Promise<string>) {
    this.getAccessTokenFn = getAccessToken;
  }

  async getAccessToken(): Promise<string> {
    return await this.getAccessTokenFn();
  }
}

export class GraphService {
  private graphClient: Client;
  private getAccessTokenFn: () => Promise<string>;

  constructor(getAccessToken: () => Promise<string>) {
    this.getAccessTokenFn = getAccessToken;
    const authProvider = new MsalAuthenticationProvider(getAccessToken);
    this.graphClient = Client.initWithMiddleware({ authProvider });
  }

  // Expose the access token function for use in Lambda calls
  async getAccessToken(): Promise<string> {
    return await this.getAccessTokenFn();
  }

  // Get current user's profile
  async getUserProfile(): Promise<GraphUser> {
    try {
      const user = await this.graphClient
        .api('/me')
        .select('id,displayName,mail,userPrincipalName,givenName,surname,jobTitle,department,mobilePhone,businessPhones,officeLocation,employeeId,mailNickname')
        .get();
      
              console.log('Successfully retrieved user data from Graph API');
      
      return {
        id: user.id,
        displayName: user.displayName,
        mail: user.mail,
        userPrincipalName: user.userPrincipalName,
        givenName: user.givenName,
        surname: user.surname,
        jobTitle: user.jobTitle || '',
        department: user.department || '',
        mobilePhone: user.mobilePhone,
        businessPhones: user.businessPhones || [],
        officeLocation: user.officeLocation,
        employeeId: user.employeeId,
        mailNickname: user.mailNickname || user.userPrincipalName?.split('@')[0] || '', // Extract from email if mailNickname not available
      };
    } catch (error) {
      console.error('Error fetching user profile:', error);
      throw error;
    }
  }

  // Get user's manager
  async getUserManager(): Promise<GraphManager | null> {
    try {
      const manager = await this.graphClient
        .api('/me/manager')
        .select('id,displayName,mail,jobTitle,department,mailNickname')
        .get();
      return {
        id: manager.id,
        displayName: manager.displayName,
        mail: manager.mail,
        jobTitle: manager.jobTitle || '',
        department: manager.department || '',
        mailNickname: manager.mailNickname || manager.mail?.split('@')[0] || '',
      };
    } catch (error: any) {
      // Manager might not exist or user might not have permission
      if (error?.code === 'Request_ResourceNotFound' || error?.message?.includes('does not exist')) {
        console.info('No manager assigned to this user in Azure AD');
        return null;
      }
      console.warn('Could not fetch manager:', error);
      return null;
    }
  }

  // Get user's direct reports
  async getUserDirectReports(): Promise<GraphDirectReport[]> {
    try {
      const response = await this.graphClient
        .api('/me/directReports')
        .select('id,displayName,mail,jobTitle,department,mailNickname')
        .get();
      return response.value.map((report: any) => ({
        id: report.id,
        displayName: report.displayName,
        mail: report.mail,
        jobTitle: report.jobTitle || '',
        department: report.department || '',
        mailNickname: report.mailNickname || report.mail?.split('@')[0] || '',
      }));
    } catch (error) {
      console.warn('Could not fetch direct reports:', error);
      return [];
    }
  }

  // Get users in the same department (for managers to see subordinates)
  async getDepartmentUsers(department: string): Promise<GraphDirectReport[]> {
    try {
      const response = await this.graphClient
        .api('/users')
        .filter(`department eq '${department}'`)
        .select('id,displayName,mail,jobTitle,department')
        .get();
      
      return response.value.map((user: any) => ({
        id: user.id,
        displayName: user.displayName,
        mail: user.mail,
        jobTitle: user.jobTitle || '',
        department: user.department || '',
      }));
    } catch (error) {
      console.warn('Could not fetch department users:', error);
      return [];
    }
  }

  // Check if user has SafeDrivingManager role (this would be stored in your database)
  async checkSafeDrivingManagerRole(userId: string): Promise<boolean> {
    // TODO: Implement database call to check SafeDrivingManager role
    // For now, return false. You'll need to implement this based on your database
    console.log('Checking SafeDrivingManager role for user');
    return false;
  }

  // Extract job level from job title using the hierarchy table
  private extractJobLevel(jobTitle: string): { level: number; order: number; position: string } {
    if (!jobTitle) {
      return { level: 1, order: 1, position: '一般' };
    }

    // Use the parseJobTitle function from authConfig
    return parseJobTitle(jobTitle);
  }

  // Determine user role based on job level
  private determineUserRole(jobLevel: number, isSafeDrivingManager: boolean): UserRole {
    if (isSafeDrivingManager) {
      return ROLES.SAFE_DRIVING_MANAGER;
    }
    
    return jobLevel >= JOB_LEVEL_THRESHOLD ? ROLES.MANAGER : ROLES.ENTRY_LEVEL;
  }

  // Build complete user profile with hierarchy and permissions
  async buildAppUser(account: AccountInfo): Promise<AppUser> {
    try {
      console.log('Building app user for account:', account.username);
      
      // Get user profile
      const userProfile = await this.getUserProfile();
      console.log('User profile fetched successfully');
      
      // Get manager and direct reports
      const [manager, directReports] = await Promise.all([
        this.getUserManager(),
        this.getUserDirectReports(),
      ]);

      // Check SafeDrivingManager role
      const isSafeDrivingManager = await this.checkSafeDrivingManagerRole(userProfile.id);
      
      // Extract job level and position using the hierarchy table
      const { level: jobLevel, order: jobOrder, position } = this.extractJobLevel(userProfile.jobTitle);
      
      // Determine role
      const role = this.determineUserRole(jobLevel, isSafeDrivingManager);
      
      // Build confirmer list based on role and hierarchy
      const canSelectConfirmers = await this.buildConfirmerList(
        userProfile,
        manager,
        directReports,
        role
      );

      const result = {
        azureId: userProfile.id,
        email: userProfile.mail || account.username,
        displayName: userProfile.displayName,
        firstName: userProfile.givenName,
        lastName: userProfile.surname,
        mailNickname: userProfile.mailNickname,
        jobTitle: userProfile.jobTitle,
        department: userProfile.department,
        employeeId: userProfile.employeeId,
        officeLocation: userProfile.officeLocation,
        mobilePhone: userProfile.mobilePhone,
        businessPhones: userProfile.businessPhones,
        jobLevel,
        jobOrder, // Add order within the level
        position, // Add parsed position name
        role,
        isSafeDrivingManager,
        manager,
        directReports,
        canSelectConfirmers,
        lastLogin: new Date(),
        sessionId: account.homeAccountId,
      };

      console.log('App user built successfully');

      return result;
    } catch (error) {
      console.error('Failed to build app user:', error);
      throw new Error(`Failed to build user profile: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // Build list of confirmers based on user role and hierarchy
  private async buildConfirmerList(
    user: GraphUser,
    manager: GraphManager | null,
    directReports: GraphDirectReport[],
    role: UserRole
  ): Promise<string[]> {
    const confirmers: string[] = [];

    if (role === ROLES.ENTRY_LEVEL) {
      // Entry level users can only select their department head/manager
      if (manager) {
        confirmers.push(manager.id);
      }
    } else if (role === ROLES.MANAGER || role === ROLES.SAFE_DRIVING_MANAGER) {
      // Managers can select subordinates within their department
      confirmers.push(...directReports.map(report => report.id));
      
      // If SafeDrivingManager, they might have additional permissions
      if (role === ROLES.SAFE_DRIVING_MANAGER) {
        // Get all users in department for SafeDrivingManager
        try {
          const departmentUsers = await this.getDepartmentUsers(user.department);
          confirmers.push(...departmentUsers.map(u => u.id));
        } catch (error) {
          console.warn('Could not fetch department users for SafeDrivingManager');
        }
      }
    }

    // Remove duplicates and the user themselves
    return [...new Set(confirmers)].filter(id => id !== user.id);
  }

  // Get vehicle users from Azure AD based on company/department naming patterns
  async getVehicleUsers(userDepartment: string): Promise<Array<{id: string, displayName: string, cleanName: string}>> {
    try {
      // Determine vehicle prefix based on user's department
      const vehiclePrefix = this.getVehiclePrefixByDepartment(userDepartment);
      
      if (!vehiclePrefix) {
        console.warn('No vehicle prefix found for department:', userDepartment);
        return [];
      }

      console.log('Fetching vehicles with department-specific prefix');

      // Query Azure AD users whose displayName starts with the vehicle prefix
      const response = await this.graphClient
        .api('/users')
        .filter(`startswith(displayName,'${vehiclePrefix}')`)
        .select('id,displayName')
        .get();

      // Process the results to remove prefix and create clean names
      const vehicleUsers = response.value.map((user: any) => {
        const cleanName = user.displayName.replace(vehiclePrefix, '').trim();
        return {
          id: user.id,
          displayName: user.displayName,
          cleanName: cleanName || user.displayName // Fallback to original if cleaning fails
        };
      });

      console.log(`Found ${vehicleUsers.length} vehicle users for department`);
      return vehicleUsers;

    } catch (error) {
      console.error('Error fetching vehicle users from Azure AD:', error);
      throw error;
    }
  }

  // Map department to vehicle prefix - customize this based on your naming conventions
  private getVehiclePrefixByDepartment(department: string): string | null {
    // Convert to lowercase for case-insensitive matching
    const dept = department.toLowerCase();
    
    // Add your company-specific mappings here
    const departmentToPrefix: { [key: string]: string } = {
      'tts': 'TTS車両-',
      'teral': 'TERAL車両-',
      'engineering': 'ENG車両-',
      'sales': 'SALES車両-',
      'admin': 'ADMIN車両-',
      // Add more departments as needed
    };

    // Try to find exact match first
    if (departmentToPrefix[dept]) {
      return departmentToPrefix[dept];
    }

    // Try partial matches
    for (const [key, prefix] of Object.entries(departmentToPrefix)) {
      if (dept.includes(key)) {
        return prefix;
      }
    }

    // Default fallback - you can customize this
    // For now, assuming TTS as default based on the user's description
    return 'TTS車両-';
  }

  // Resolve vehicle ID back to clean name for display
  async resolveVehicleIdToName(vehicleId: string): Promise<string> {
    try {
      // Handle special cases
      if (vehicleId === '0') {
        return 'レンタカー';
      }

      if (!vehicleId || vehicleId.trim() === '') {
        return '未選択';
      }

      // Query the specific user by ID
      const response = await this.graphClient
        .api(`/users/${vehicleId}`)
        .select('id,displayName')
        .get();

      if (response && response.displayName) {
        // Remove the prefix to get clean name
        const cleanName = this.removeVehiclePrefix(response.displayName);
        return cleanName;
      }

      return '不明な車両';
    } catch (error) {
      console.warn('Could not resolve vehicle ID:', vehicleId, error);
      return '不明な車両';
    }
  }

  // Helper method to remove vehicle prefix from display name
  private removeVehiclePrefix(displayName: string): string {
    // List of possible prefixes to remove
    const prefixes = ['TTS車両-', 'TERAL車両-', 'ENG車両-', 'SALES車両-', 'ADMIN車両-'];
    
    for (const prefix of prefixes) {
      if (displayName.startsWith(prefix)) {
        return displayName.replace(prefix, '').trim();
      }
    }
    
    // If no prefix found, return original
    return displayName;
  }

  // Bulk resolve vehicle IDs to names (for efficiency when displaying multiple submissions)
  async resolveVehicleIds(vehicleIds: string[]): Promise<{[key: string]: string}> {
    const results: {[key: string]: string} = {};
    
    // Handle special cases first
    vehicleIds.forEach(id => {
      if (id === '0') {
        results[id] = 'レンタカー';
      } else if (!id || id.trim() === '') {
        results[id] = '未選択';
      }
    });

    // Get unique IDs that need to be resolved
    const idsToResolve = vehicleIds.filter(id => !results[id] && id && id !== '0');
    
    if (idsToResolve.length === 0) {
      return results;
    }

    try {
      // Batch request for multiple users
      // Note: Microsoft Graph API has limitations on batch requests, so we'll do individual requests
      // In a production environment, you might want to implement a more efficient batching strategy
      const promises = idsToResolve.map(async (id) => {
        try {
          const response = await this.graphClient
            .api(`/users/${id}`)
            .select('id,displayName')
            .get();
          
          return {
            id,
            cleanName: response.displayName ? this.removeVehiclePrefix(response.displayName) : '不明な車両'
          };
        } catch (error) {
          console.warn('Could not resolve vehicle ID:', id, error);
          return { id, cleanName: '不明な車両' };
        }
      });

      const resolvedVehicles = await Promise.all(promises);
      
      // Map results
      resolvedVehicles.forEach(({ id, cleanName }) => {
        results[id] = cleanName;
      });

    } catch (error) {
      console.error('Error in bulk vehicle ID resolution:', error);
      // Fill remaining IDs with fallback
      idsToResolve.forEach(id => {
        if (!results[id]) {
          results[id] = '不明な車両';
        }
      });
    }

    return results;
  }
} 