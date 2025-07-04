import { defineFunction } from '@aws-amplify/backend';

export const logApprovalIssue = defineFunction({
  entry: './handler.ts',
  name: 'log-approval-issue',
  timeoutSeconds: 10,
  environment: {},
}); 