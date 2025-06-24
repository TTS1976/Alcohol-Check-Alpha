import { defineBackend } from '@aws-amplify/backend';
import { auth } from './auth/resource';
import { data } from './data/resource';
import { sendTeamsNotification } from './functions/send-teams-notification/resource';
import { directCloudUpload } from './functions/directcloud-upload/resource';
import { directcloudDownload } from './functions/directcloud-download/resource';
import { PolicyStatement } from 'aws-cdk-lib/aws-iam';

const backend = defineBackend({
  auth,
  data,
  sendTeamsNotification,
  directCloudUpload,
  directcloudDownload,
});

// Temporarily allow public access to Lambda functions
// Grant both authenticated and unauthenticated users permission to invoke the Lambda functions
backend.auth.resources.authenticatedUserIamRole.addToPrincipalPolicy(
  new PolicyStatement({
    actions: ['lambda:InvokeFunction'],
    resources: [
      backend.sendTeamsNotification.resources.lambda.functionArn,
      backend.directCloudUpload.resources.lambda.functionArn,
      backend.directcloudDownload.resources.lambda.functionArn,
    ],
  })
);

// Also grant permissions to unauthenticated users
backend.auth.resources.unauthenticatedUserIamRole.addToPrincipalPolicy(
  new PolicyStatement({
    actions: ['lambda:InvokeFunction'],
    resources: [
      backend.sendTeamsNotification.resources.lambda.functionArn,
      backend.directCloudUpload.resources.lambda.functionArn,
      backend.directcloudDownload.resources.lambda.functionArn,
    ],
  })
);

