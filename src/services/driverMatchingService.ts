import { GraphDirectReport, AppUser } from '../types/auth';

export interface DriverMatch {
  driverName: string;
  azureUser?: GraphDirectReport;
  matchConfidence: 'high' | 'medium' | 'low' | 'none';
  matchReason: string;
}

export class DriverMatchingService {
  /**
   * Match a driver name from the database with Azure AD users
   */
  static matchDriverWithAzureUsers(
    driverName: string,
    availableUsers: GraphDirectReport[]
  ): DriverMatch {
    if (!driverName || !availableUsers?.length) {
      return {
        driverName,
        matchConfidence: 'none',
        matchReason: 'No driver name or Azure users provided'
      };
    }

    // Clean and normalize the driver name
    const cleanDriverName = this.normalizeJapaneseName(driverName);

    // Try different matching strategies
    const strategies = [
      this.exactDisplayNameMatch,
      this.exactEmailPrefixMatch,
      this.partialNameMatch,
      this.kanjiHiraganaMatch,
    ];

    for (const strategy of strategies) {
      const match = strategy(cleanDriverName, availableUsers);
      if (match.azureUser) {
        return match;
      }
    }

    return {
      driverName,
      matchConfidence: 'none',
      matchReason: 'No matching Azure user found'
    };
  }

  /**
   * Check if a user can approve for a specific driver based on hierarchy
   */
  static canUserApproveForDriver(
    currentUser: AppUser,
    driverName: string,
    driverMatch: DriverMatch
  ): boolean {
    // SafeDrivingManager can approve everything
    if (currentUser.isSafeDrivingManager) {
      return true;
    }

    // If we have a strong match with Azure AD
    if (driverMatch.azureUser && driverMatch.matchConfidence === 'high') {
      // Check if the matched user is in the current user's hierarchy
      const canSelect = currentUser.canSelectConfirmers.includes(driverMatch.azureUser.id);
      if (canSelect) {
        return true;
      }

      // Check if the driver is a direct report
      const isDirectReport = currentUser.directReports.some(
        report => report.id === driverMatch.azureUser?.id
      );
      if (isDirectReport) {
        return true;
      }
    }

    // For managers without a clear Azure match, check department
    if (currentUser.role === 'Manager') {
      // Fallback: allow approval if same department (would need department matching logic)
      return true; // Temporarily allow managers to approve within department
    }

    return false;
  }

  /**
   * Get approval hierarchy explanation for a driver
   */
  static getApprovalHierarchyExplanation(
    currentUser: AppUser,
    driverName: string,
    driverMatch: DriverMatch
  ): string {
    if (currentUser.isSafeDrivingManager) {
      return `安全運転管理者として${driverName}の申請を承認できます`;
    }

    if (driverMatch.azureUser && driverMatch.matchConfidence === 'high') {
      const isDirectReport = currentUser.directReports.some(
        report => report.id === driverMatch.azureUser?.id
      );
      
      if (isDirectReport) {
        return `${driverName}（${driverMatch.azureUser.displayName}）は部下のため承認できます`;
      }

      const canSelect = currentUser.canSelectConfirmers.includes(driverMatch.azureUser.id);
      if (canSelect) {
        return `組織階層により${driverName}の申請を承認できます`;
      }
    }

    if (currentUser.role === 'Manager') {
      return `管理者として${driverName}の申請を承認できます`;
    }

    return `${driverName}の申請を承認する権限がありません`;
  }

  // Private helper methods

  private static normalizeJapaneseName(name: string): string {
    return name
      .trim()
      .replace(/\s+/g, '') // Remove all spaces
      .replace(/　/g, '') // Remove full-width spaces
      .toLowerCase();
  }

  private static exactDisplayNameMatch(
    driverName: string,
    users: GraphDirectReport[]
  ): DriverMatch {
    const normalizedDriverName = driverName.replace(/\s+/g, '').toLowerCase();
    
    for (const user of users) {
      const normalizedDisplayName = user.displayName
        .replace(/\s+/g, '')
        .toLowerCase();
      
      if (normalizedDriverName === normalizedDisplayName) {
        return {
          driverName,
          azureUser: user,
          matchConfidence: 'high',
          matchReason: `Exact display name match: ${user.displayName}`
        };
      }
    }

    return { driverName, matchConfidence: 'none', matchReason: 'No exact display name match' };
  }

  private static exactEmailPrefixMatch(
    driverName: string,
    users: GraphDirectReport[]
  ): DriverMatch {
    const normalizedDriverName = driverName.replace(/\s+/g, '').toLowerCase();
    
    for (const user of users) {
      const emailPrefix = user.mail.split('@')[0].toLowerCase();
      
      // Check if driver name matches email prefix (common in Japanese companies)
      if (normalizedDriverName.includes(emailPrefix) || emailPrefix.includes(normalizedDriverName)) {
        return {
          driverName,
          azureUser: user,
          matchConfidence: 'medium',
          matchReason: `Email prefix match: ${emailPrefix}`
        };
      }
    }

    return { driverName, matchConfidence: 'none', matchReason: 'No email prefix match' };
  }

  private static partialNameMatch(
    driverName: string,
    users: GraphDirectReport[]
  ): DriverMatch {
    const normalizedDriverName = driverName.replace(/\s+/g, '').toLowerCase();
    
    for (const user of users) {
      const normalizedDisplayName = user.displayName
        .replace(/\s+/g, '')
        .toLowerCase();
      
      // Check for partial matches (surname or given name)
      if (normalizedDriverName.length >= 2 && normalizedDisplayName.length >= 2) {
        const driverParts = this.splitJapaneseName(normalizedDriverName);
        const azureParts = this.splitJapaneseName(normalizedDisplayName);
        
        // Check if any part matches
        for (const driverPart of driverParts) {
          for (const azurePart of azureParts) {
            if (driverPart === azurePart && driverPart.length >= 2) {
              return {
                driverName,
                azureUser: user,
                matchConfidence: 'medium',
                matchReason: `Partial name match: ${driverPart} in ${user.displayName}`
              };
            }
          }
        }
      }
    }

    return { driverName, matchConfidence: 'none', matchReason: 'No partial name match' };
  }

  private static kanjiHiraganaMatch(
    driverName: string,
    users: GraphDirectReport[]
  ): DriverMatch {
    // This would implement more sophisticated Japanese name matching
    // For now, return no match as this requires more complex logic
    return { driverName, matchConfidence: 'none', matchReason: 'Kanji/Hiragana matching not implemented' };
  }

  private static splitJapaneseName(name: string): string[] {
    // Simple name splitting - in practice, this would be more sophisticated
    // for Japanese names (surname/given name detection)
    if (name.length <= 2) return [name];
    if (name.length <= 4) return [name.substring(0, 2), name.substring(2)];
    return [name.substring(0, name.length / 2), name.substring(name.length / 2)];
  }
} 