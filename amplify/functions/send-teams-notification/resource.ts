import { defineFunction } from '@aws-amplify/backend';

export const sendTeamsNotification = defineFunction({
  name: 'send-teams-notification',
  entry: './handler.ts',
  environment: {
    // Environment variables - VALUES SHOULD BE SET IN AMPLIFY CONSOLE FOR PRODUCTION
    // Using safe placeholder values for development/sandbox mode
    TEAMS_TEAM_ID: process.env.TEAMS_TEAM_ID || 'dev-placeholder-team-id',
    TEAMS_CHANNEL_ID: process.env.TEAMS_CHANNEL_ID || 'dev-placeholder-channel-id',
    APP_URL: process.env.APP_URL || 'http://localhost:5173',
    AMPLIFY_DATA_GRAPHQL_ENDPOINT: process.env.AMPLIFY_DATA_GRAPHQL_ENDPOINT || 'dev-placeholder-endpoint',
    AMPLIFY_DATA_GRAPHQL_API_KEY: process.env.AMPLIFY_DATA_GRAPHQL_API_KEY || 'dev-placeholder-key',
  }
}); 

