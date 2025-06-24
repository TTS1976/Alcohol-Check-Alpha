import { defineFunction } from '@aws-amplify/backend';

export const sendTeamsNotification = defineFunction({
  name: 'send-teams-notification',
  entry: './handler.ts',
  environment: {
    // Environment variables - VALUES MUST BE SET IN AMPLIFY CONSOLE
    // No default values in code - forces proper environment variable usage
    TEAMS_TEAM_ID: process.env.TEAMS_TEAM_ID!,
    TEAMS_CHANNEL_ID: process.env.TEAMS_CHANNEL_ID!,
    APP_URL: process.env.APP_URL!,
    AMPLIFY_DATA_GRAPHQL_ENDPOINT: process.env.AMPLIFY_DATA_GRAPHQL_ENDPOINT!,
    AMPLIFY_DATA_GRAPHQL_API_KEY: process.env.AMPLIFY_DATA_GRAPHQL_API_KEY!,
  }
}); 

