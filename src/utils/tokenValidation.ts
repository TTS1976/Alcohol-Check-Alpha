/**
 * Token validation utilities for secure handling of access tokens
 * Provides validation without exposing sensitive token information
 */

/**
 * Validates if a token appears to be a valid access token
 * @param token - The token to validate
 * @returns boolean indicating if token appears valid
 */
export const isValidAccessToken = (token: string | null | undefined): boolean => {
  if (!token || typeof token !== 'string') {
    return false;
  }
  
  // Basic validation checks without exposing token content
  if (token.length < 10) {
    return false;
  }
  
  // Check if token contains only valid characters (base64, JWT, etc.)
  const validTokenPattern = /^[A-Za-z0-9._-]+$/;
  if (!validTokenPattern.test(token)) {
    return false;
  }
  
  // Additional basic validation for JWT tokens
  if (token.includes('.')) {
    const parts = token.split('.');
    // JWT should have 3 parts (header.payload.signature)
    if (parts.length === 3) {
      // Validate each part is base64-like
      for (const part of parts) {
        if (part.length === 0) {
          return false;
        }
      }
      return true;
    }
  }
  
  // For non-JWT tokens, basic length and character validation
  return token.length >= 20 && token.length <= 4096;
};

/**
 * Validates DirectCloud access token format
 * @param token - The DirectCloud token to validate
 * @returns boolean indicating if token appears valid
 */
export const isValidDirectCloudToken = (token: string | null | undefined): boolean => {
  if (!token || typeof token !== 'string') {
    return false;
  }
  
  // DirectCloud tokens should be reasonable length
  return token.length >= 10 && token.length <= 1024;
};

/**
 * Safely logs token status without exposing sensitive information
 * @param tokenName - Name of the token for logging
 * @param token - The token to check
 * @returns string safe for logging
 */
export const getTokenStatus = (tokenName: string, token: string | null | undefined): string => {
  if (!token) {
    return `${tokenName}: MISSING`;
  }
  
  if (isValidAccessToken(token)) {
    return `${tokenName}: VALID`;
  }
  
  return `${tokenName}: INVALID_FORMAT`;
};

/**
 * Creates a safe payload for logging that excludes sensitive token information
 * @param payload - Original payload object
 * @returns Sanitized payload safe for logging
 */
export const sanitizePayloadForLogging = (payload: any): any => {
  if (!payload || typeof payload !== 'object') {
    return payload;
  }
  
  const sanitized = { ...payload };
  
  // Remove or mask sensitive fields
  const sensitiveFields = [
    'userAccessToken',
    'accessToken',
    'access_token',
    'token',
    'password',
    'secret',
    'key',
    'credential'
  ];
  
  for (const field of sensitiveFields) {
    if (field in sanitized) {
      delete sanitized[field];
    }
  }
  
  // Remove fields that might contain length information about tokens
  delete sanitized.accessTokenLength;
  delete sanitized.tokenLength;
  
  return sanitized;
}; 