import { Context } from 'aws-lambda';

export const handler = async (event: any, context: Context) => {
  // Log all received data for debugging
  console.log('Approval Issue Log:', JSON.stringify(event, null, 2));
  return { statusCode: 200, body: 'Logged' };
}; 