import { defineFunction } from '@aws-amplify/backend';

export const directcloudDownload = defineFunction({
  name: 'directcloud-download',
  entry: './handler.ts',
  timeoutSeconds: 30,
  memoryMB: 256,
  environment: {
    // Environment variables - VALUES MUST BE SET IN AMPLIFY CONSOLE
    // No default values in code - forces proper environment variable usage
    DIRECTCLOUD_BASE_URL: process.env.DIRECTCLOUD_BASE_URL!,
    DIRECTCLOUD_SERVICE: process.env.DIRECTCLOUD_SERVICE!,
    DIRECTCLOUD_SERVICE_KEY: process.env.DIRECTCLOUD_SERVICE_KEY!,
    DIRECTCLOUD_CODE: process.env.DIRECTCLOUD_CODE!,
    DIRECTCLOUD_ID: process.env.DIRECTCLOUD_ID!,
    DIRECTCLOUD_PASSWORD: process.env.DIRECTCLOUD_PASSWORD!,
    DIRECTCLOUD_UPLOAD_FOLDER: process.env.DIRECTCLOUD_UPLOAD_FOLDER!,
  }
}); 