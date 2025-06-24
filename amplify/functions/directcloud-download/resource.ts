import { defineFunction } from '@aws-amplify/backend';

export const directcloudDownload = defineFunction({
  name: 'directcloud-download',
  entry: './handler.ts',
  timeoutSeconds: 30,
  memoryMB: 256,
  environment: {
    // Environment variables - VALUES SHOULD BE SET IN AMPLIFY CONSOLE FOR PRODUCTION
    // Using safe placeholder values for development/sandbox mode
    DIRECTCLOUD_BASE_URL: process.env.DIRECTCLOUD_BASE_URL || 'https://api.directcloud.jp',
    DIRECTCLOUD_SERVICE: process.env.DIRECTCLOUD_SERVICE || 'dev-placeholder-service',
    DIRECTCLOUD_SERVICE_KEY: process.env.DIRECTCLOUD_SERVICE_KEY || 'dev-placeholder-key',
    DIRECTCLOUD_CODE: process.env.DIRECTCLOUD_CODE || 'dev-placeholder-code',
    DIRECTCLOUD_ID: process.env.DIRECTCLOUD_ID || 'dev-placeholder-id',
    DIRECTCLOUD_PASSWORD: process.env.DIRECTCLOUD_PASSWORD || 'dev-placeholder-password',
    DIRECTCLOUD_UPLOAD_FOLDER: process.env.DIRECTCLOUD_UPLOAD_FOLDER || 'dev-placeholder-folder',
  }
}); 