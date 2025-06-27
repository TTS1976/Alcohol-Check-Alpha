/**
 * Pagination utility for AWS Amplify DataStore queries
 * Handles automatic pagination to retrieve all items regardless of dataset size
 */

import { generateClient } from "aws-amplify/data";
import type { Schema } from "../../amplify/data/resource";

const client = generateClient<Schema>({
  authMode: 'apiKey'
});

export interface PaginatedListOptions {
  filter?: any;
  limit?: number;
  maxItems?: number; // Optional limit on total items to prevent runaway queries
}

/**
 * Generic paginated list function that retrieves ALL items from a model
 * @param modelName - The name of the model to query (e.g., 'Driver', 'AlcoholCheckSubmission')
 * @param options - Query options including filters
 * @returns Promise<Array> - All items matching the criteria
 */
export async function getAllItems<T>(
  modelName: keyof Schema,
  options: PaginatedListOptions = {}
): Promise<T[]> {
  const { filter, limit = 1000, maxItems = 50000 } = options;
  
  console.log(`📄 Starting paginated query for ${String(modelName)}...`);
  
  let allItems: T[] = [];
  let nextToken: string | undefined = undefined;
  let pageCount = 0;
  let totalFetched = 0;

  try {
    do {
      pageCount++;
      console.log(`📄 Loading page ${pageCount} for ${String(modelName)}...`);
      
      const queryOptions: any = {
        limit: Math.min(limit, maxItems - totalFetched), // Respect maxItems limit
      };
      
      if (filter) {
        queryOptions.filter = filter;
      }
      
      if (nextToken) {
        queryOptions.nextToken = nextToken;
      }
      
      // Use dynamic model access
      const result = await (client.models as any)[modelName].list(queryOptions);
      
      if (!result.data) {
        console.warn(`No data returned for ${String(modelName)} page ${pageCount}`);
        break;
      }

      const pageItems = result.data as T[];
      allItems = allItems.concat(pageItems);
      totalFetched += pageItems.length;
      nextToken = result.nextToken || undefined;
      
      console.log(`✅ Page ${pageCount}: Loaded ${pageItems.length} ${String(modelName)} items (Total so far: ${allItems.length})`);
      
      // Safety check to prevent runaway queries
      if (totalFetched >= maxItems) {
        console.warn(`🛑 Reached maximum items limit (${maxItems}) for ${String(modelName)}`);
        break;
      }
      
      // Another safety check for reasonable page limits
      if (pageCount > 500) {
        console.error(`🛑 Excessive pagination detected for ${String(modelName)} (${pageCount} pages). Stopping to prevent runaway query.`);
        break;
      }
      
    } while (nextToken);

    console.log(`🎯 Finished loading all ${String(modelName)} items. Total: ${allItems.length} items across ${pageCount} pages`);
    return allItems;
    
  } catch (error) {
    console.error(`❌ Error in paginated query for ${String(modelName)}:`, error);
    throw new Error(`Failed to load ${String(modelName)} items: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Specialized function for AlcoholCheckSubmission queries with common filters
 */
export async function getAllSubmissions(options: {
  submittedBy?: string;
  registrationType?: string;
  approvalStatus?: string;
  relatedSubmissionId?: string;
  excludeRejected?: boolean;
  maxItems?: number;
} = {}): Promise<Schema["AlcoholCheckSubmission"]["type"][]> {
  const { submittedBy, registrationType, approvalStatus, relatedSubmissionId, excludeRejected, maxItems } = options;
  
  let filter: any = {};
  
  if (submittedBy) {
    filter.submittedBy = { eq: submittedBy };
  }
  
  if (registrationType) {
    filter.registrationType = { eq: registrationType };
  }
  
  if (approvalStatus) {
    filter.approvalStatus = { eq: approvalStatus };
  }
  
  if (relatedSubmissionId) {
    filter.relatedSubmissionId = { eq: relatedSubmissionId };
  }
  
  if (excludeRejected) {
    filter.approvalStatus = { ne: 'REJECTED' };
  }
  
  return getAllItems<Schema["AlcoholCheckSubmission"]["type"]>('AlcoholCheckSubmission', {
    filter: Object.keys(filter).length > 0 ? filter : undefined,
    maxItems
  });
}

/**
 * Specialized function for Driver queries
 */
export async function getAllDrivers(options: {
  excludeDeleted?: boolean;
  maxItems?: number;
} = {}): Promise<Schema["Driver"]["type"][]> {
  const { excludeDeleted = true, maxItems } = options;
  
  const filter = excludeDeleted ? { isDeleted: { eq: false } } : undefined;
  
  return getAllItems<Schema["Driver"]["type"]>('Driver', {
    filter,
    maxItems
  });
}

/**
 * Get submissions with safe pagination and sorting
 */
export async function getSubmissionsSorted(options: {
  submittedBy?: string;
  sortBy?: 'submittedAt' | 'approvedAt';
  sortOrder?: 'asc' | 'desc';
  maxItems?: number;
} = {}): Promise<Schema["AlcoholCheckSubmission"]["type"][]> {
  const { submittedBy, sortBy = 'submittedAt', sortOrder = 'desc', maxItems } = options;
  
  const submissions = await getAllSubmissions({ submittedBy, maxItems });
  
  // Sort in memory after fetching all items
  return submissions.sort((a, b) => {
    const aValue = sortBy === 'submittedAt' ? a.submittedAt : a.approvedAt;
    const bValue = sortBy === 'submittedAt' ? b.submittedAt : b.approvedAt;
    
    if (!aValue || !bValue) return 0;
    
    const comparison = new Date(aValue).getTime() - new Date(bValue).getTime();
    return sortOrder === 'desc' ? -comparison : comparison;
  });
} 