import type { Handler } from 'aws-lambda';

// In-memory rate limiting store (for simple rate limiting)
// In production, you'd use DynamoDB or ElastiCache for distributed rate limiting
const rateLimitStore = new Map<string, { count: number; resetTime: number }>();

// Configuration constants
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 10; // 10 uploads per minute per user (higher limit for uploads)
const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY_MS = 1000; // 1 second
const MAX_RETRY_DELAY_MS = 30000; // 30 seconds
const MAX_FILE_SIZE_MB = 10; // 10MB limit

export const handler: Handler = async (event) => {
  console.log('DirectCloud upload Lambda function started');
  console.log('Received event:', JSON.stringify(event, null, 2));
  
  // Extract rate limiting identifier
  const rateLimitKey = event.userId || event.fileName || 'unknown';
  
  try {
    // Rate limiting check
    const rateLimitResult = checkRateLimit(rateLimitKey);
    if (!rateLimitResult.allowed) {
      console.warn(`Rate limit exceeded for ${rateLimitKey}. Requests: ${rateLimitResult.currentCount}, Limit: ${RATE_LIMIT_MAX_REQUESTS}`);
      return {
        statusCode: 429,
        body: JSON.stringify({ 
          success: false,
          error: 'Rate limit exceeded', 
          details: `Too many upload requests. Try again in ${Math.ceil((rateLimitResult.resetTime - Date.now()) / 1000)} seconds.`,
          retryAfter: Math.ceil((rateLimitResult.resetTime - Date.now()) / 1000)
        }),
      };
    }

    const {
      fileName,
      fileData,
      contentType
    } = event;
    
    console.log('Parsed input:', { fileName, contentType, fileDataLength: fileData?.length });
    
    // Validate required parameters to prevent infinite loops with invalid data
    if (!fileName || !fileData) {
      console.error('Missing required parameters:', { fileName: !!fileName, fileData: !!fileData });
      return {
        statusCode: 400,
        body: JSON.stringify({ 
          success: false,
          error: 'Missing required parameters', 
          details: 'fileName and fileData are required'
        }),
      };
    }

    // Validate file size to prevent memory issues and loops
    const fileSizeBytes = Buffer.from(fileData, 'base64').length;
    const fileSizeMB = fileSizeBytes / (1024 * 1024);
    
    if (fileSizeMB > MAX_FILE_SIZE_MB) {
      console.error(`File too large: ${fileSizeMB}MB, max allowed: ${MAX_FILE_SIZE_MB}MB`);
      return {
        statusCode: 400,
        body: JSON.stringify({ 
          success: false,
          error: 'File too large', 
          details: `File size ${fileSizeMB.toFixed(2)}MB exceeds maximum allowed size of ${MAX_FILE_SIZE_MB}MB`
        }),
      };
    }

    // Validate filename to prevent path traversal and other issues
    if (!isValidFileName(fileName)) {
      console.error('Invalid filename:', fileName);
      return {
        statusCode: 400,
        body: JSON.stringify({ 
          success: false,
          error: 'Invalid filename', 
          details: 'Filename contains invalid characters or patterns'
        }),
      };
    }
    
    // Check environment variables
    console.log('Environment variables check:');
    console.log('DIRECTCLOUD_BASE_URL:', process.env.DIRECTCLOUD_BASE_URL ? 'SET' : 'MISSING');
    console.log('DIRECTCLOUD_SERVICE:', process.env.DIRECTCLOUD_SERVICE ? 'SET' : 'MISSING');
    
    const requiredEnvVars = [
      'DIRECTCLOUD_BASE_URL',
      'DIRECTCLOUD_SERVICE',
      'DIRECTCLOUD_SERVICE_KEY',
      'DIRECTCLOUD_CODE',
      'DIRECTCLOUD_ID',
      'DIRECTCLOUD_PASSWORD',
      'DIRECTCLOUD_UPLOAD_FOLDER'
    ];
    
    for (const envVar of requiredEnvVars) {
      if (!process.env[envVar]) {
        throw new Error(`Missing required environment variable: ${envVar}`);
      }
    }
    
    // Step 1: Get access token from DirectCloud with retry logic
    console.log('Getting access token from DirectCloud...');
    const tokenResponse = await getAccessTokenWithRetry();
    
    if (!tokenResponse.success) {
      throw new Error('Failed to get access token: ' + tokenResponse.error);
    }
    
    const accessToken = tokenResponse.token!;
    
    // Validate token without exposing sensitive information
    if (!accessToken || accessToken.length < 10 || accessToken.length > 1024) {
      throw new Error('Invalid access token format received from DirectCloud');
    }
    
    console.log('Access token obtained and validated successfully');
    
    // Step 2: Upload file to DirectCloud with retry logic
    console.log('Uploading file to DirectCloud...');
    const uploadResponse = await uploadToDirectCloudWithRetry(
      accessToken,
      fileName,
      fileData,
      contentType || 'image/jpeg'
    );
    
    console.log('DirectCloud upload result:', uploadResponse);
    
    // Check if upload was successful
    if (uploadResponse.result === 'success') {
      return {
        statusCode: 200,
        body: JSON.stringify({
          success: true,
          fileName: fileName,
          fileId: uploadResponse.file_seq,
          message: 'File uploaded successfully to DirectCloud',
          fileSize: `${fileSizeMB.toFixed(2)}MB`,
          response: uploadResponse
        }),
      };
    } else {
      throw new Error(`DirectCloud upload failed: ${uploadResponse.message || 'Unknown error'}`);
    }

  } catch (error) {
    console.error('Error in DirectCloud upload Lambda function:', error);
    
    // Log the error but don't retry on certain error types to prevent loops
    const isRetryableError = isErrorRetryable(error);
    console.log('Error is retryable:', isRetryableError);
    
    return {
      statusCode: isRetryableError ? 500 : 400,
      body: JSON.stringify({ 
        success: false,
        error: 'Failed to upload to DirectCloud', 
        details: error instanceof Error ? error.message : 'Unknown error',
        retryable: isRetryableError
      }),
    };
  }
};

// Rate limiting function
function checkRateLimit(key: string): { allowed: boolean; currentCount: number; resetTime: number } {
  const now = Date.now();
  const record = rateLimitStore.get(key);
  
  if (!record || now > record.resetTime) {
    // First request or window has reset
    const newRecord = {
      count: 1,
      resetTime: now + RATE_LIMIT_WINDOW_MS
    };
    rateLimitStore.set(key, newRecord);
    return { allowed: true, currentCount: 1, resetTime: newRecord.resetTime };
  }
  
  // Increment count
  record.count++;
  rateLimitStore.set(key, record);
  
  const allowed = record.count <= RATE_LIMIT_MAX_REQUESTS;
  return { allowed, currentCount: record.count, resetTime: record.resetTime };
}

// Helper function to validate filename
function isValidFileName(fileName: string): boolean {
  // Check for null, empty, or whitespace-only names
  if (!fileName || fileName.trim().length === 0) return false;
  
  // Check for path traversal attempts
  if (fileName.includes('..') || fileName.includes('/') || fileName.includes('\\')) return false;
  
  // Check for reserved characters in Windows/Unix filenames
  const invalidChars = /[<>:"|?*\x00-\x1f]/;
  if (invalidChars.test(fileName)) return false;
  
  // Check filename length (most filesystems have limits)
  if (fileName.length > 255) return false;
  
  return true;
}

// Helper function to determine if an error is retryable
function isErrorRetryable(error: any): boolean {
  if (!(error instanceof Error)) return false;
  
  const message = error.message.toLowerCase();
  
  // Don't retry on these errors (they indicate permanent failures)
  const nonRetryableErrors = [
    'missing required parameters',
    'missing required environment variable',
    'invalid filename',
    'file too large',
    'authentication failed',
    'unauthorized',
    'forbidden',
    'bad request'
  ];
  
  return !nonRetryableErrors.some(nonRetryableError => message.includes(nonRetryableError));
}

// Get access token with retry logic
async function getAccessTokenWithRetry(attempt = 1): Promise<{ success: boolean; token?: string; error?: string }> {
  try {
    const result = await getAccessToken();
    return result;
  } catch (error) {
    console.error(`Auth attempt ${attempt} failed:`, error);
    
    if (attempt < MAX_RETRIES && isErrorRetryable(error)) {
      const delay = Math.min(INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt - 1), MAX_RETRY_DELAY_MS);
      console.log(`Retrying auth in ${delay}ms (attempt ${attempt}/${MAX_RETRIES})`);
      
      await new Promise(resolve => setTimeout(resolve, delay));
      return getAccessTokenWithRetry(attempt + 1);
    }
    
    return { success: false, error: error instanceof Error ? error.message : 'Auth failed' };
  }
}

async function getAccessToken(): Promise<{ success: boolean; token?: string; error?: string }> {
  try {
    // Create URL-encoded form data (not JSON!)
    const formData = new URLSearchParams();
    formData.append('service', process.env.DIRECTCLOUD_SERVICE!);
    formData.append('service_key', process.env.DIRECTCLOUD_SERVICE_KEY!);
    formData.append('code', process.env.DIRECTCLOUD_CODE!);
    formData.append('id', process.env.DIRECTCLOUD_ID!);
    formData.append('password', process.env.DIRECTCLOUD_PASSWORD!);
    
    console.log('Auth request to:', `${process.env.DIRECTCLOUD_BASE_URL}/openapi/jauth/token`);
    console.log('Auth payload prepared with service credentials');
    
    const response = await fetch(`${process.env.DIRECTCLOUD_BASE_URL}/openapi/jauth/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formData.toString()
    });
    
    console.log('Auth response status:', response.status);
    const responseText = await response.text();
    
    if (!response.ok) {
      console.log('Auth failed with response:', responseText);
    } else {
      console.log('Auth response received successfully');
    }
    
    if (!response.ok) {
      return { success: false, error: `Auth failed: ${response.status} - ${responseText}` };
    }
    
    const authResult = JSON.parse(responseText);
    
    if (authResult.success && authResult.access_token) {
      return { success: true, token: authResult.access_token };
    } else {
      return { success: false, error: 'Auth failed: ' + responseText };
    }
    
  } catch (error) {
    console.error('Auth error:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Auth request failed' };
  }
}

// Upload with retry logic
async function uploadToDirectCloudWithRetry(accessToken: string, fileName: string, fileData: string, contentType: string, attempt = 1): Promise<any> {
  try {
    const result = await uploadToDirectCloud(accessToken, fileName, fileData, contentType);
    return result;
  } catch (error) {
    console.error(`Upload attempt ${attempt} failed:`, error);
    
    if (attempt < MAX_RETRIES && isErrorRetryable(error)) {
      const delay = Math.min(INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt - 1), MAX_RETRY_DELAY_MS);
      console.log(`Retrying upload in ${delay}ms (attempt ${attempt}/${MAX_RETRIES})`);
      
      await new Promise(resolve => setTimeout(resolve, delay));
      return uploadToDirectCloudWithRetry(accessToken, fileName, fileData, contentType, attempt + 1);
    }
    
    throw error;
  }
}

async function uploadToDirectCloud(accessToken: string, fileName: string, fileData: string, contentType: string): Promise<any> {
  try {
    // Convert base64 to buffer
    const fileBuffer = Buffer.from(fileData, 'base64');
    
    // Create boundary for multipart/form-data
    const boundary = '----formdata-' + Math.random().toString(36);
    
    // Build multipart form data with correct field names per API documentation
    const formData = [
      `--${boundary}`,
      `Content-Disposition: form-data; name="node"`,  // Changed from "folder_id" to "node"
      '',
      process.env.DIRECTCLOUD_UPLOAD_FOLDER,
      `--${boundary}`,
      `Content-Disposition: form-data; name="name"`,  // Add filename field
      '',
      fileName,
      `--${boundary}`,
      `Content-Disposition: form-data; name="file"; filename="${fileName}"`,
      `Content-Type: ${contentType}`,
      '',
      ''
    ].join('\r\n');
    
    const header = Buffer.from(formData, 'utf8');
    const footer = Buffer.from(`\r\n--${boundary}--\r\n`, 'utf8');
    
    const totalBody = Buffer.concat([header, fileBuffer, footer]);
    
    console.log('Upload request details:');
    console.log('- URL:', `${process.env.DIRECTCLOUD_BASE_URL}/openapi/v2/files/upload/sync`);
    console.log('- Content-Type:', `multipart/form-data; boundary=${boundary}`);
    console.log('- Content-Length:', totalBody.length);
    console.log('- Access token: VALIDATED');
    
    const response = await fetch(`${process.env.DIRECTCLOUD_BASE_URL}/openapi/v2/files/upload/sync`, {
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Access-Token': accessToken,  // Changed from 'access_token' to 'Access-Token'
        'Lang': 'ja'  // Add language header
      },
      body: totalBody
    });
    
    console.log('Upload response status:', response.status);
    const responseText = await response.text();
    
    if (!response.ok) {
      console.log('Upload failed with response:', responseText);
    } else {
      console.log('Upload response received successfully');
    }
    
    if (!response.ok) {
      // Check if this is a retryable HTTP status
      const isRetryableStatus = [408, 429, 500, 502, 503, 504].includes(response.status);
      
      if (isRetryableStatus) {
        throw new Error(`Retryable upload error: ${response.status} - ${responseText}`);
      } else {
        throw new Error(`Upload failed: ${response.status} - ${responseText}`);
      }
    }
    
    return JSON.parse(responseText);
    
  } catch (error) {
    console.error('Upload error:', error);
    throw error;
  }
} 