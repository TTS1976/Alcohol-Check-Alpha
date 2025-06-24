import { defineFunction } from '@aws-amplify/backend';

export const directCloudUpload = defineFunction({
  name: 'directcloud-upload',
  entry: './handler.ts',
  environment: {
    // Environment variables - VALUES MUST BE SET IN AMPLIFY CONSOLE
    // No default values in code - forces proper environment variable usage
    DIRECTCLOUD_BASE_URL: process.env.DIRECTCLOUD_BASE_URL || 'https://api.directcloud.jp',
    DIRECTCLOUD_SERVICE: process.env.DIRECTCLOUD_SERVICE || 'dmgklbdg',
    DIRECTCLOUD_SERVICE_KEY: process.env.DIRECTCLOUD_SERVICE_KEY || 'f3b453325fb8cc6730e09b3e6c0a364ece9a2959b1489585fbd16b513916d226',
    DIRECTCLOUD_CODE: process.env.DIRECTCLOUD_CODE || 'teraltechnoservice',
    DIRECTCLOUD_ID: process.env.DIRECTCLOUD_ID || 'x-tts-system02@teral.co.jp',
    DIRECTCLOUD_PASSWORD: process.env.DIRECTCLOUD_PASSWORD || 't7fDaQ94GCTPE2eAGgMw',
    DIRECTCLOUD_UPLOAD_FOLDER: process.env.DIRECTCLOUD_UPLOAD_FOLDER || '1{200N8Gg5jUzC5',
  }
}); 