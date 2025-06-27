import type { Handler } from 'aws-lambda';

// In-memory rate limiting store (for simple rate limiting)
// In production, you'd use DynamoDB or ElastiCache for distributed rate limiting
const rateLimitStore = new Map<string, { count: number; resetTime: number }>();

// Configuration constants
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 15; // 15 downloads per minute per user (higher limit for downloads)
const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY_MS = 1000; // 1 second
const MAX_RETRY_DELAY_MS = 30000; // 30 seconds

export const handler: Handler = async (event) => {
  console.log('DirectCloud download Lambda function started');
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
          details: `Too many download requests. Try again in ${Math.ceil((rateLimitResult.resetTime - Date.now()) / 1000)} seconds.`,
          retryAfter: Math.ceil((rateLimitResult.resetTime - Date.now()) / 1000)
        }),
      };
    }

    const { fileName } = event;
    
    console.log('Parsed input - fileName provided:', !!fileName);
    
    // Validate required parameters to prevent infinite loops with invalid data
    if (!fileName) {
      console.error('Missing required parameter: fileName');
      return {
        statusCode: 400,
        body: JSON.stringify({ 
          success: false,
          error: 'Missing required parameter', 
          details: 'fileName is required'
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
    
    // Step 2: Find the file in DirectCloud with retry logic
    console.log('Searching for file in DirectCloud...');
    const fileInfo = await findFileByNameWithRetry(accessToken, fileName);
    
    if (!fileInfo) {
      throw new Error(`File not found: ${fileName}`);
    }
    
    console.log('File found:', fileInfo);
    
    // Step 3: Download file from DirectCloud with retry logic
    console.log('Downloading file from DirectCloud...');
    const downloadResponse = await downloadFromDirectCloudWithRetry(accessToken, parseInt(fileInfo.file_seq));
    
    if (downloadResponse.success) {
      return {
        statusCode: 200,
        body: JSON.stringify({
          success: true,
          fileName: fileName,
          data: downloadResponse.data,
          contentType: downloadResponse.contentType,
          message: 'File downloaded successfully from DirectCloud'
        }),
      };
    } else {
      throw new Error(`DirectCloud download failed: ${downloadResponse.error}`);
    }

  } catch (error) {
    console.error('Error in DirectCloud download Lambda function:', error);
    
    // Log the error but don't retry on certain error types to prevent loops
    const isRetryableError = isErrorRetryable(error);
    console.log('Error is retryable:', isRetryableError);
    
    return {
      statusCode: isRetryableError ? 500 : 400,
      body: JSON.stringify({ 
        success: false,
        error: 'Failed to download from DirectCloud', 
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
    'missing required parameter',
    'missing required environment variable',
    'invalid filename',
    'file not found',
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

// Find file with retry logic
async function findFileByNameWithRetry(accessToken: string, fileName: string, attempt = 1): Promise<any> {
  try {
    const result = await findFileByName(accessToken, fileName);
    return result;
  } catch (error) {
    console.error(`Find file attempt ${attempt} failed:`, error);
    
    if (attempt < MAX_RETRIES && isErrorRetryable(error)) {
      const delay = Math.min(INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt - 1), MAX_RETRY_DELAY_MS);
      console.log(`Retrying find file in ${delay}ms (attempt ${attempt}/${MAX_RETRIES})`);
      
      await new Promise(resolve => setTimeout(resolve, delay));
      return findFileByNameWithRetry(accessToken, fileName, attempt + 1);
    }
    
    throw error;
  }
}

// Download with retry logic
async function downloadFromDirectCloudWithRetry(accessToken: string, fileSeq: number, attempt = 1): Promise<{ success: boolean; data?: string; contentType?: string; error?: string }> {
  try {
    const result = await downloadFromDirectCloud(accessToken, fileSeq);
    return result;
  } catch (error) {
    console.error(`Download attempt ${attempt} failed:`, error);
    
    if (attempt < MAX_RETRIES && isErrorRetryable(error)) {
      const delay = Math.min(INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt - 1), MAX_RETRY_DELAY_MS);
      console.log(`Retrying download in ${delay}ms (attempt ${attempt}/${MAX_RETRIES})`);
      
      await new Promise(resolve => setTimeout(resolve, delay));
      return downloadFromDirectCloudWithRetry(accessToken, fileSeq, attempt + 1);
    }
    
    return { success: false, error: error instanceof Error ? error.message : 'Download failed' };
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

async function findFileByName(accessToken: string, fileName: string): Promise<any> {
  try {
    console.log('Searching for file:', fileName);
    console.log('Using folder path:', process.env.DIRECTCLOUD_UPLOAD_FOLDER);
    
    // First try: Use the correct folders/lists API with GET method
    let response = await fetch(`${process.env.DIRECTCLOUD_BASE_URL}/openapi/v2/folders/lists?node=${encodeURIComponent(process.env.DIRECTCLOUD_UPLOAD_FOLDER!)}&offset=0&limit=1000`, {
      method: 'GET',
      headers: {
        'access_token': accessToken,
        'lang': 'ja'
      }
    });
    
    console.log('File list response status:', response.status);
    let responseText = await response.text();
    console.log('File list response:', responseText);
    
    // Log the exact request we made
    console.log('Request details:');
    console.log('- URL:', `${process.env.DIRECTCLOUD_BASE_URL}/openapi/v2/folders/lists?node=${encodeURIComponent(process.env.DIRECTCLOUD_UPLOAD_FOLDER!)}&offset=0&limit=1000`);
    console.log('- Method: GET');
    console.log('- Headers: access_token (validated), lang');
    console.log('- Folder node:', process.env.DIRECTCLOUD_UPLOAD_FOLDER);
    
    if (response.ok) {
      const result = JSON.parse(responseText);
      
      if (result.result === 'success' && result.data && result.data.files) {
        console.log('Found', result.data.files.length, 'files in folder');
        
        // Log what we're searching for and what's available
        console.log('Searching for:', fileName);
        console.log('Available files:', result.data.files.map((f: any) => f.name));
        
        // Find the file by name in the files array with normalized comparison
        const file = result.data.files.find((file: any) => 
          file.name.trim().toLowerCase() === fileName.trim().toLowerCase()
        );
        
        if (file) {
          console.log('File found:', file);
          return file;
        } else {
          console.log('File not found after normalized search');
          // Try exact match as backup
          const exactFile = result.data.files.find((file: any) => file.name === fileName);
          if (exactFile) {
            console.log('File found with exact match:', exactFile);
            return exactFile;
          }
        }
      } else {
        console.log('Unexpected response format or failure. Result:', result);
        console.log('Looking for result.data.files, got:', typeof result.data?.files);
      }
    }
    
    // If the first attempt didn't work, let's try comprehensive debugging (but limit to prevent loops)
    if (!response.ok) {
      console.log('First attempt failed, trying alternative approaches...');
      
      // Try 1: List all files at root level using correct API
      console.log('Attempting to list all files at root level...');
      try {
        const rootResponse = await fetch(`${process.env.DIRECTCLOUD_BASE_URL}/openapi/v2/folders/lists?offset=0&limit=100`, {
          method: 'GET',
          headers: {
            'access_token': accessToken,
            'lang': 'ja'
          }
        });
        
        console.log('Root files response status:', rootResponse.status);
        const rootResponseText = await rootResponse.text();
        console.log('Root files response:', rootResponseText);
        
        if (rootResponse.ok) {
          const rootResult = JSON.parse(rootResponseText);
          if (rootResult.result === 'success' && rootResult.data) {
            const files = rootResult.data.files || [];
            const folders = rootResult.data.folders || [];
            
            console.log('Found', files.length, 'files and', folders.length, 'folders at root level');
            
            // Look for our file in root
            const file = files.find((file: any) => 
              file.name.trim().toLowerCase() === fileName.trim().toLowerCase()
            );
            
            if (file) {
              console.log('Found file at root level!', file);
              return file;
            }
            
            // Log some folder information
            console.log('Available folders at root:', folders.map((f: any) => ({ name: f.name, seq: f.seq })));
          }
        }
      } catch (rootError) {
        console.log('Root listing failed:', rootError);
      }
      
      // Try 2: Search recent files using different API (limited to prevent loops)
      console.log('Trying recent files API...');
      try {
        const recentResponse = await fetch(`${process.env.DIRECTCLOUD_BASE_URL}/openapi/v2/files/recent`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Access-Token': accessToken,
            'Lang': 'ja'
          },
          body: JSON.stringify({
            limit: 100
          })
        });
        
        console.log('Recent files response status:', recentResponse.status);
        const recentResponseText = await recentResponse.text();
        console.log('Recent files response:', recentResponseText);
        
        if (recentResponse.ok) {
          const recentResult = JSON.parse(recentResponseText);
          if (recentResult.result === 'success' && recentResult.data) {
            const files = Array.isArray(recentResult.data) ? recentResult.data : recentResult.data.children || [];
            console.log('Found', files.length, 'recent files');
            
            const file = files.find((child: any) => child.name === fileName);
            if (file) {
              console.log('Found file in recent files!', file);
              return file;
            }
          }
        }
      } catch (recentError) {
        console.log('Recent files API failed:', recentError);
      }
    }
    
    console.log('File not found in any location');
    return null;
    
  } catch (error) {
    console.error('Find file error:', error);
    throw error;
  }
}

async function downloadFromDirectCloud(accessToken: string, fileSeq: number): Promise<{ success: boolean; data?: string; contentType?: string; error?: string }> {
  try {
    console.log('Downloading file with seq:', fileSeq);
    
    // Step 1: Get the file binary data directly from DirectCloud API
    const downloadResponse = await fetch(`${process.env.DIRECTCLOUD_BASE_URL}/openapi/v2/files/download`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'access_token': accessToken,
        'lang': 'ja'
      },
      body: JSON.stringify({
        file_seq: fileSeq,
        flag_direct: 'Y'  // Get binary data directly instead of download URL
      })
    });
    
    console.log('Download API response status:', downloadResponse.status);
    const contentType = downloadResponse.headers.get('content-type') || 'image/jpeg';
    console.log('Download API response content-type:', contentType);
    
    if (!downloadResponse.ok) {
      const downloadResponseText = await downloadResponse.text();
      console.log('Download API error response:', downloadResponseText);
      
      // Check if this is a retryable HTTP status
      const isRetryableStatus = [408, 429, 500, 502, 503, 504].includes(downloadResponse.status);
      
      if (isRetryableStatus) {
        throw new Error(`Retryable download error: ${downloadResponse.status} - ${downloadResponseText}`);
      } else {
        return { success: false, error: `Download API failed: ${downloadResponse.status} - ${downloadResponseText}` };
      }
    }
    
    // Check if we got JSON instead of binary data
    if (contentType.includes('application/json')) {
      const jsonResponse = await downloadResponse.text();
      console.log('Got JSON response instead of binary data:', jsonResponse);
      return { success: false, error: `Expected binary data but got JSON: ${jsonResponse}` };
    }
    
    // Step 2: Convert binary response to base64
    const arrayBuffer = await downloadResponse.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const base64Data = buffer.toString('base64');
    
    console.log('File downloaded successfully, size:', buffer.length, 'content-type:', contentType);
    
    return {
      success: true,
      data: base64Data,
      contentType: contentType
    };
    
  } catch (error) {
    console.error('Download error:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Download failed' };
  }
} 