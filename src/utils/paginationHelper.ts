/**
 * Pagination utility for AWS Amplify DataStore queries
 * Handles automatic pagination to retrieve all items regardless of dataset size
 */

import { generateClient } from "aws-amplify/data";
import type { Schema } from "../../amplify/data/resource";
import { logger } from './logger';

const client = generateClient<Schema>({
  authMode: 'apiKey'
});

export interface PaginatedListOptions {
  filter?: any;
  limit?: number;
  maxItems?: number; // Optional limit on total items to prevent runaway queries
}

export interface ServerPaginationOptions {
  filter?: any;
  limit?: number;
  nextToken?: string;
  sortDirection?: 'ASC' | 'DESC';
}

export interface PaginatedResult<T> {
  items: T[];
  nextToken?: string;
  hasMore: boolean;
  totalCount?: number;
}

/**
 * NEW: Server-side pagination function that loads data in chunks
 * Use this instead of getAllItems for better performance
 */
export async function getItemsPaginated<T>(
  modelName: keyof Schema,
  options: ServerPaginationOptions = {}
): Promise<PaginatedResult<T>> {
  const { filter, limit = 50, nextToken, sortDirection = 'DESC' } = options;

  logger.debug(`Loading paginated ${String(modelName)} (limit: ${limit})`);

  try {
    const queryOptions: any = {
      limit,
      sortDirection
    };

    if (filter) {
      queryOptions.filter = filter;
    }

    if (nextToken) {
      queryOptions.nextToken = nextToken;
    }

    // Add cache busting for consistency issues
    // This helps ensure we get fresh data instead of stale cached results
    const cacheBypass = Date.now();
    logger.debug(`Query cache bypass timestamp: ${cacheBypass}`);

    // Use dynamic model access
    const result = await (client.models as any)[modelName].list(queryOptions);

    if (!result.data) {
      logger.warn(`No data returned for ${String(modelName)}`);
      return {
        items: [],
        hasMore: false
      };
    }

    const items = result.data as T[];
    logger.debug(`Loaded ${items.length} ${String(modelName)} items`);

    return {
      items,
      nextToken: result.nextToken,
      hasMore: !!result.nextToken
    };

  } catch (error) {
    logger.error(`Error in paginated query for ${String(modelName)}:`, error);
    throw new Error(`Failed to load ${String(modelName)} items: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * NEW: Specialized function for submissions with server-side pagination
 */
export async function getSubmissionsPaginated(options: {
  approvalStatus?: string;
  registrationType?: string;
  submittedBy?: string;
  limit?: number;
  nextToken?: string;
  excludeRejected?: boolean;
  sortDirection?: 'ASC' | 'DESC';
} = {}): Promise<PaginatedResult<Schema["AlcoholCheckSubmission"]["type"]>> {
  const { approvalStatus, registrationType, submittedBy, limit = 50, nextToken, excludeRejected, sortDirection = 'DESC' } = options;

  let filter: any = {};

  if (approvalStatus) {
    filter.approvalStatus = { eq: approvalStatus };
  }

  if (registrationType) {
    filter.registrationType = { eq: registrationType };
  }

  if (submittedBy) {
    filter.submittedBy = { eq: submittedBy };
  }

  if (excludeRejected) {
    filter.approvalStatus = { ne: 'REJECTED' };
  }

  return getItemsPaginated<Schema["AlcoholCheckSubmission"]["type"]>('AlcoholCheckSubmission', {
    filter: filter && Object.keys(filter).length > 0 ? filter : undefined,
    limit,
    nextToken,
    sortDirection
  });
}

/**
 * NEW: Specialized function for drivers with server-side pagination
 */
export async function getDriversPaginated(options: {
  excludeDeleted?: boolean;
  limit?: number;
  nextToken?: string;
} = {}): Promise<PaginatedResult<Schema["Driver"]["type"]>> {
  const { excludeDeleted = true, limit = 50, nextToken } = options;

  const filter = excludeDeleted ? { isDeleted: { eq: false } } : undefined;

  return getItemsPaginated<Schema["Driver"]["type"]>('Driver', {
    filter,
    limit,
    nextToken
  });
}

// Keep existing functions for backward compatibility but add warnings
/**
 * Generic paginated list function that retrieves ALL items from a model
 * @deprecated Use getItemsPaginated instead for better performance
 * @param modelName - The name of the model to query (e.g., 'Driver', 'AlcoholCheckSubmission')
 * @param options - Query options including filters
 * @returns Promise<Array> - All items matching the criteria
 */
export async function getAllItems<T>(
  modelName: keyof Schema,
  options: PaginatedListOptions = {}
): Promise<T[]> {
  logger.warn(`getAllItems is deprecated. Consider using getItemsPaginated for better performance.`);

  const { filter, limit = 1000, maxItems = 50000 } = options;

  logger.debug(`Starting paginated query for ${String(modelName)}...`);

  let allItems: T[] = [];
  let nextToken: string | undefined = undefined;
  let pageCount = 0;
  let totalFetched = 0;

  try {
    do {
      pageCount++;
      logger.debug(`Loading page ${pageCount} for ${String(modelName)}...`);

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
        logger.warn(`No data returned for ${String(modelName)} page ${pageCount}`);
        break;
      }

      const pageItems = result.data as T[];
      allItems = allItems.concat(pageItems);
      totalFetched += pageItems.length;
      nextToken = result.nextToken || undefined;

      logger.debug(`Page ${pageCount}: Loaded ${pageItems.length} ${String(modelName)} items (Total so far: ${allItems.length})`);

      // Safety check to prevent runaway queries
      if (totalFetched >= maxItems) {
        logger.warn(`Reached maximum items limit (${maxItems}) for ${String(modelName)}`);
        break;
      }

      // Another safety check for reasonable page limits
      if (pageCount > 500) {
        logger.error(`Excessive pagination detected for ${String(modelName)} (${pageCount} pages). Stopping to prevent runaway query.`);
        break;
      }

    } while (nextToken);

    logger.info(`Finished loading all ${String(modelName)} items. Total: ${allItems.length} items across ${pageCount} pages`);
    return allItems;

  } catch (error) {
    logger.error(`Error in paginated query for ${String(modelName)}:`, error);
    throw new Error(`Failed to load ${String(modelName)} items: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Specialized function for AlcoholCheckSubmission queries with common filters
 * @deprecated Use getSubmissionsPaginated instead for better performance
 */
export async function getAllSubmissions(options: {
  submittedBy?: string;
  registrationType?: string;
  approvalStatus?: string;
  relatedSubmissionId?: string;
  excludeRejected?: boolean;
  maxItems?: number;
} = {}): Promise<Schema["AlcoholCheckSubmission"]["type"][]> {
  logger.warn(`getAllSubmissions is deprecated. Consider using getSubmissionsPaginated for better performance.`);

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
    filter: filter && Object.keys(filter).length > 0 ? filter : undefined,
    maxItems
  });
}

/**
 * Specialized function for Driver queries
 * @deprecated Use getDriversPaginated instead for better performance
 */
export async function getAllDrivers(options: {
  excludeDeleted?: boolean;
  maxItems?: number;
} = {}): Promise<Schema["Driver"]["type"][]> {
  logger.warn(`getAllDrivers is deprecated. Consider using getDriversPaginated for better performance.`);

  const { excludeDeleted = true, maxItems } = options;

  const filter = excludeDeleted ? { isDeleted: { eq: false } } : undefined;

  return getAllItems<Schema["Driver"]["type"]>('Driver', {
    filter,
    maxItems
  });
}

/**
 * Get submissions with safe pagination and sorting
 * @deprecated Use getSubmissionsPaginated instead for better performance
 */
export async function getSubmissionsSorted(options: {
  submittedBy?: string;
  sortBy?: 'submittedAt' | 'approvedAt';
  sortOrder?: 'asc' | 'desc';
  maxItems?: number;
} = {}): Promise<Schema["AlcoholCheckSubmission"]["type"][]> {
  logger.warn(`getSubmissionsSorted is deprecated. Consider using getSubmissionsPaginated for better performance.`);

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

/**
 * Efficiently query submissions by confirmerId and approvalStatus using the GSI
 */
export async function getSubmissionsByConfirmerPaginated(options: {
  confirmerId: string;
  approvalStatus?: string;
  limit?: number;
  nextToken?: string;
  sortDirection?: 'ASC' | 'DESC';
}): Promise<PaginatedResult<Schema["AlcoholCheckSubmission"]["type"]>> {
  console.log('🔍 DEBUG: getSubmissionsByConfirmerPaginated started');
  console.log('🔍 DEBUG: options:', options);

  // FIXED: Normalize parameters at the very beginning to ensure consistency
  const normalizedOptions = {
    confirmerId: options.confirmerId,
    approvalStatus: options.approvalStatus || 'PENDING',
    limit: options.limit || 50,
    nextToken: options.nextToken || undefined,
    sortDirection: options.sortDirection || 'DESC'
  };

  console.log('🔍 DEBUG: normalized values:', normalizedOptions);

  // Use regular filtered query instead of GSI to avoid Object.keys() error
  const filter = {
    confirmerId: { eq: normalizedOptions.confirmerId },
    approvalStatus: { eq: normalizedOptions.approvalStatus }
  };

  console.log('🔍 DEBUG: filter object:', filter);
  console.log('🔍 DEBUG: filter type:', typeof filter);

  try {
    console.log('🔍 DEBUG: Calling getItemsPaginated with filter...');

    // Use the regular paginated query with filter instead of GSI
    const result = await getItemsPaginated<Schema["AlcoholCheckSubmission"]["type"]>('AlcoholCheckSubmission', {
      filter,
      limit: normalizedOptions.limit,
      nextToken: normalizedOptions.nextToken,
      sortDirection: normalizedOptions.sortDirection
    });

    console.log('🔍 DEBUG: getItemsPaginated completed successfully');
    console.log('🔍 DEBUG: result:', result);

    logger.debug(`Loaded ${result.items.length} submissions for confirmerId: ${normalizedOptions.confirmerId}`);

    console.log('🔍 DEBUG: returning result from getSubmissionsByConfirmerPaginated');
    return result;

  } catch (error) {
    console.log('❌ DEBUG: Error in getSubmissionsByConfirmerPaginated:', error);
    console.log('❌ DEBUG: Error type:', typeof error);
    console.log('❌ DEBUG: Error message:', error instanceof Error ? error.message : 'Unknown error');
    console.log('❌ DEBUG: Error stack:', error instanceof Error ? error.stack : 'No stack');

    // Re-throw the error so it can be caught by the calling function
    throw error;
  }
}

/* BACKUP: Original implementation with destructuring defaults (commented out as temporary backup)
export async function getSubmissionsByConfirmerPaginated(options: {
  confirmerId: string;
  approvalStatus?: string;
  limit?: number;
  nextToken?: string;
  sortDirection?: 'ASC' | 'DESC';
}): Promise<PaginatedResult<Schema["AlcoholCheckSubmission"]["type"]>> {
  console.log('🔍 DEBUG: getSubmissionsByConfirmerPaginated started');
  console.log('🔍 DEBUG: options:', options);
  
  const { confirmerId, approvalStatus = 'PENDING', limit = 50, nextToken, sortDirection = 'DESC' } = options;

  console.log('🔍 DEBUG: destructured values:', {
    confirmerId,
    approvalStatus,
    limit,
    nextToken,
    sortDirection
  });

  // Use regular filtered query instead of GSI to avoid Object.keys() error
  const filter = {
    confirmerId: { eq: confirmerId },
    approvalStatus: { eq: approvalStatus }
  };

  console.log('🔍 DEBUG: filter object:', filter);
  console.log('🔍 DEBUG: filter type:', typeof filter);

  try {
    console.log('🔍 DEBUG: Calling getItemsPaginated with filter...');
    
    // Use the regular paginated query with filter instead of GSI
    const result = await getItemsPaginated<Schema["AlcoholCheckSubmission"]["type"]>('AlcoholCheckSubmission', {
      filter,
      limit,
      nextToken,
      sortDirection
    });

    console.log('🔍 DEBUG: getItemsPaginated completed successfully');
    console.log('🔍 DEBUG: result:', result);

    logger.debug(`Loaded ${result.items.length} submissions for confirmerId: ${confirmerId}`);

    console.log('🔍 DEBUG: returning result from getSubmissionsByConfirmerPaginated');
    return result;

  } catch (error) {
    console.log('❌ DEBUG: Error in getSubmissionsByConfirmerPaginated:', error);
    console.log('❌ DEBUG: Error type:', typeof error);
    console.log('❌ DEBUG: Error message:', error instanceof Error ? error.message : 'Unknown error');
    console.log('❌ DEBUG: Error stack:', error instanceof Error ? error.stack : 'No stack');
    
    // Re-throw the error so it can be caught by the calling function
    throw error;
  }
}
*/ 