import { defineFunction } from '@aws-amplify/backend';

export const sendTeamsNotification = defineFunction({
  name: 'send-teams-notification',
  entry: './handler.ts',
  environment: {
    // Environment variables - VALUES SHOULD BE SET IN AMPLIFY CONSOLE FOR PRODUCTION
    // Using safe placeholder values for development/sandbox mode
    TEAMS_TEAM_ID: process.env.TEAMS_TEAM_ID || 'f7a9ca47-4ac5-4031-925c-87eccfc09916',
    TEAMS_CHANNEL_ID: process.env.TEAMS_CHANNEL_ID || '19%3Af0a14eebd4284f95985b2a7e8ac2d4a4%40thread.tacv2',
    APP_URL: process.env.APP_URL || 'http://localhost:5173',
    AMPLIFY_DATA_GRAPHQL_ENDPOINT: process.env.AMPLIFY_DATA_GRAPHQL_ENDPOINT || 'https://v246zz7fgrb5bdopcexkcbiliq.appsync-api.ap-northeast-1.amazonaws.com/graphql',
    AMPLIFY_DATA_GRAPHQL_API_KEY: process.env.AMPLIFY_DATA_GRAPHQL_API_KEY || 'da2-jl5vjp7apzambdebfgvnuzytxa',
  }
}); 

