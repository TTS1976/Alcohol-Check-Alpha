import type { Handler } from 'aws-lambda';
import { Client } from '@microsoft/microsoft-graph-client';
import { AuthenticationProvider } from '@microsoft/microsoft-graph-client';

// In-memory rate limiting store (for simple rate limiting)
// In production, you'd use DynamoDB or ElastiCache for distributed rate limiting
const rateLimitStore = new Map<string, { count: number; resetTime: number }>();

// Configuration constants
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 5; // 5 requests per minute per IP/user
const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY_MS = 1000; // 1 second
const MAX_RETRY_DELAY_MS = 30000; // 30 seconds

// Simple authentication provider that uses the user's access token
class UserTokenAuthenticationProvider implements AuthenticationProvider {
  private accessToken: string;

  constructor(accessToken: string) {
    this.accessToken = accessToken;
  }

  async getAccessToken(): Promise<string> {
    return this.accessToken;
  }
}

// Store user access token for automated reminders


export const handler: Handler = async (event) => {
  console.log('Lambda function started');
  console.log('Received event:', JSON.stringify(event, null, 2));
  
  // Extract rate limiting identifier (use submittedBy or a combination of fields)
  const rateLimitKey = event.submittedBy || event.submissionId || 'unknown';
  
  try {
    // Rate limiting check
    const rateLimitResult = checkRateLimit(rateLimitKey);
    if (!rateLimitResult.allowed) {
      console.warn(`Rate limit exceeded for ${rateLimitKey}. Requests: ${rateLimitResult.currentCount}, Limit: ${RATE_LIMIT_MAX_REQUESTS}`);
      return {
        statusCode: 429,
        body: JSON.stringify({ 
          error: 'Rate limit exceeded', 
          details: `Too many requests. Try again in ${Math.ceil((rateLimitResult.resetTime - Date.now()) / 1000)} seconds.`,
          retryAfter: Math.ceil((rateLimitResult.resetTime - Date.now()) / 1000)
        }),
      };
    }

    const { 
      submissionId, 
      content, 
      submittedBy, 
      confirmerName,
      supervisorDisplayName,
      supervisorEmail,
      supervisorObjectId,
      driverDisplayName,
      driverEmail,
      driverObjectId,
      userAccessToken
    } = event;
    
    console.log('Parsed input:', { 
      submissionId, 
      content, 
      submittedBy, 
      confirmerName,
      supervisorDisplayName,
      supervisorEmail,
      supervisorObjectId,
      driverDisplayName,
      driverEmail,
      driverObjectId
    });
    
    // Validate required parameters
    if (!submissionId || !content || !submittedBy) {
      console.error('Missing required parameters:', { submissionId, content, submittedBy });
      return {
        statusCode: 400,
        body: JSON.stringify({ 
          error: 'Missing required parameters', 
          details: 'submissionId, content, and submittedBy are required'
        }),
      };
    }
    
    // Check environment variables
    console.log('Environment variables check:');
    console.log('TEAMS_TEAM_ID:', process.env.TEAMS_TEAM_ID ? 'SET' : 'MISSING');
    console.log('TEAMS_CHANNEL_ID:', process.env.TEAMS_CHANNEL_ID ? 'SET' : 'MISSING');
    console.log('USER_ACCESS_TOKEN:', userAccessToken ? 'PROVIDED' : 'MISSING');
    
    const requiredEnvVars = [
      'TEAMS_TEAM_ID',
      'TEAMS_CHANNEL_ID'
    ];
    
    for (const envVar of requiredEnvVars) {
      if (!process.env[envVar]) {
        throw new Error(`Missing ${envVar} environment variable`);
      }
    }
    
    // Extract driver name and inspection result from content
    const driverNameMatch = content.match(/運転手名前:\s*(.+)/);
    const inspectionResultMatch = content.match(/検査結果:\s*(.+)/);
    
    const driverName = driverNameMatch ? driverNameMatch[1] : (driverDisplayName || 'Unknown');
    const inspectionResult = inspectionResultMatch ? inspectionResultMatch[1] : 'Unknown';
    
    // Create approval URL
    const approvalUrl = `${process.env.APP_URL || 'http://localhost:5173'}/approve/${submissionId}`;
    
    // Validate that we have a user access token
    if (!userAccessToken) {
      throw new Error('Missing user access token for delegated permissions');
    }

    // Initialize Microsoft Graph client with user's access token
    const authProvider = new UserTokenAuthenticationProvider(userAccessToken);
    const graphClient = Client.initWithMiddleware({ authProvider });
    
    // Note: Automated reminder functionality has been removed
    
    // Prepare Teams message with @mentions
    const teamsMessage = await createTeamsMessage({
      driverName,
      inspectionResult,
      approvalUrl,
      submissionId,
      submittedBy,
      confirmerName: supervisorDisplayName || confirmerName,
      supervisorObjectId,
      driverObjectId
    });

    console.log('Sending message to Teams via Microsoft Graph API...');
    console.log('Team ID:', process.env.TEAMS_TEAM_ID);
    console.log('Channel ID:', process.env.TEAMS_CHANNEL_ID);
    console.log('Message payload:', JSON.stringify(teamsMessage, null, 2));

    // Send message to Teams channel with retry logic
    const response = await sendTeamsMessageWithRetry(
      graphClient,
      process.env.TEAMS_TEAM_ID!,
      process.env.TEAMS_CHANNEL_ID!,
      teamsMessage
    );

    console.log('Teams message sent successfully via Microsoft Graph API');
    return {
      statusCode: 200,
      body: JSON.stringify({ 
        message: 'Teams notification sent successfully via Microsoft Graph API',
        submissionId: submissionId,
        messageId: response.id
      }),
    };

  } catch (error) {
    console.error('Error in Lambda function:', error);
    
    // Log the error but don't retry on certain error types to prevent loops
    const isRetryableError = isErrorRetryable(error);
    console.log('Error is retryable:', isRetryableError);
    
    return {
      statusCode: isRetryableError ? 500 : 400,
      body: JSON.stringify({ 
        error: 'Failed to send Teams notification', 
        details: error instanceof Error ? error.message : 'Unknown error',
        retryable: isRetryableError
      }),
    };
  }
};

// Create Teams message with Adaptive Card and @mentions
async function createTeamsMessage(params: {
  driverName: string;
  inspectionResult: string;
  approvalUrl: string;
  submissionId: string;
  submittedBy: string;
  confirmerName: string;
  supervisorObjectId?: string;
  driverObjectId?: string;
}): Promise<any> {
  const {
    driverName,
    inspectionResult,
    approvalUrl,
    submissionId,
    submittedBy,
    confirmerName,
    supervisorObjectId,
    driverObjectId
  } = params;

  // Create mentions array for the message body
  const mentions = [];
  let bodyContent = `<h2>🧪 アルコールチェック確認依頼</h2>`;
  
  // Add supervisor mention if ObjectId is available
  if (supervisorObjectId && isValidObjectId(supervisorObjectId)) {
    mentions.push({
      id: 0,
      mentionText: confirmerName,
      mentioned: {
        user: {
          id: supervisorObjectId,
          displayName: confirmerName,
          userIdentityType: "aadUser"
        }
      }
    });
    bodyContent += `<p><at id="0">${confirmerName}</at> さんへの確認依頼です。</p>`;
  } else {
    bodyContent += `<p>${confirmerName} さんへの確認依頼です。</p>`;
  }
  
  // Add driver mention if ObjectId is available  
  let driverMentionText = driverName;
  if (driverObjectId && isValidObjectId(driverObjectId)) {
    const driverMentionId = mentions.length;
    mentions.push({
      id: driverMentionId,
      mentionText: driverName,
      mentioned: {
        user: {
          id: driverObjectId,
          displayName: driverName,
          userIdentityType: "aadUser"
        }
      }
    });
    driverMentionText = `<at id="${driverMentionId}">${driverName}</at>`;
  }

  // Add details to body
  bodyContent += `
    <p><strong>📋 詳細情報:</strong></p>
    <ul>
      <li><strong>運転手名前:</strong> ${driverMentionText}</li>
      <li><strong>検査結果:</strong> ${inspectionResult}</li>
    </ul>
    <p><a href="${approvalUrl}">🔍 確認画面を開く</a></p>
  `;

  // Create the message with proper structure
  const teamsMessage: any = {
    body: {
      contentType: "html",
      content: bodyContent
    }
  };

  // Add mentions if we have any
  if (mentions.length > 0) {
    teamsMessage.mentions = mentions;
  }

  return teamsMessage;
}

// Validate Azure AD Object ID format
function isValidObjectId(objectId: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(objectId);
}

// Send Teams message with retry logic
async function sendTeamsMessageWithRetry(
  graphClient: Client,
  teamId: string,
  channelId: string,
  message: any,
  attempt = 1
): Promise<any> {
  try {
    const response = await graphClient
      .api(`/teams/${teamId}/channels/${channelId}/messages`)
      .post(message);

    console.log(`Teams message sent successfully (attempt ${attempt}):`, response.id);
    return response;
    
  } catch (error: any) {
    console.error(`Send attempt ${attempt} failed:`, error);
    
    // Check if this is a retryable error
    const isRetryable = isGraphErrorRetryable(error);
    
    if (isRetryable && attempt < MAX_RETRIES) {
      const delay = Math.min(INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt - 1), MAX_RETRY_DELAY_MS);
      console.log(`Retrying in ${delay}ms (attempt ${attempt}/${MAX_RETRIES})`);
      
      await new Promise(resolve => setTimeout(resolve, delay));
      return sendTeamsMessageWithRetry(graphClient, teamId, channelId, message, attempt + 1);
    }
    
    throw error;
  }
}

// Check if Microsoft Graph error is retryable
function isGraphErrorRetryable(error: any): boolean {
  if (!error) return false;
  
  // Check HTTP status codes
  if (error.status || error.statusCode) {
    const status = error.status || error.statusCode;
    return [408, 429, 500, 502, 503, 504].includes(status);
  }
  
  // Check error codes
  if (error.code) {
    const retryableCodes = [
      'InternalServerError',
      'ServiceUnavailable', 
      'TooManyRequests',
      'Timeout'
    ];
    return retryableCodes.includes(error.code);
  }
  
  // Check error messages
  const message = (error.message || '').toLowerCase();
  const retryableMessages = [
    'timeout',
    'network',
    'connection',
    'service unavailable',
    'internal server error'
  ];
  
  return retryableMessages.some(msg => message.includes(msg));
}

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

// Helper function to determine if an error is retryable
function isErrorRetryable(error: any): boolean {
  if (!(error instanceof Error)) return false;
  
  const message = error.message.toLowerCase();
  
  // Don't retry on these errors (they indicate permanent failures)
  const nonRetryableErrors = [
    'missing required parameters',
    'missing azure_client_id',
    'missing azure_client_secret',
    'missing azure_tenant_id',
    'missing teams_team_id',
    'missing teams_channel_id',
    'authentication failed',
    'unauthorized',
    'forbidden',
    'bad request',
    'invalid_client',
    'invalid_request'
  ];
  
  return !nonRetryableErrors.some(nonRetryableError => message.includes(nonRetryableError));
} 

