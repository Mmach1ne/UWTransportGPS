#!/usr/bin/env node
"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
require("source-map-support/register");
const cdk = __importStar(require("aws-cdk-lib"));
const transport_infra_stack_1 = require("../lib/transport-infra-stack");
const budget_stack_1 = require("../lib/budget-stack");
const ingestion_lambda_stack_1 = require("../lib/ingestion-lambda-stack");
const trackstore_stack_1 = require("../lib/trackstore-stack");
const app = new cdk.App();
// Get environment from context
const env = app.node.tryGetContext('env') || 'dev';
// Define account IDs (replace with your actual account IDs)
const accounts = {
    dev: process.env.AWS_DEV_ACCOUNT_ID || process.env.CDK_DEFAULT_ACCOUNT,
    prod: process.env.AWS_PROD_ACCOUNT_ID || process.env.CDK_DEFAULT_ACCOUNT
};
// Define the AWS environment
const awsEnv = {
    account: accounts[env],
    region: process.env.CDK_DEFAULT_REGION || 'us-east-1',
};
// Create budget alerts stack (only in the main account)
new budget_stack_1.BudgetStack(app, `TransportBudget-${env}`, {
    env: awsEnv,
    environment: env,
    budgetAmount: env === 'prod' ? 50 : 20,
    emailAddress: process.env.BUDGET_EMAIL || 'your-email@example.com',
});
// Create main infrastructure stack
const infraStack = new transport_infra_stack_1.TransportInfraStack(app, `TransportInfra-${env}`, {
    env: awsEnv,
    environment: env,
    stackName: `transport-gps-${env}`,
    description: `Transport GPS Infrastructure for ${env} environment`,
});
// Create ingestion Lambda stack (depends on infra stack for Kinesis stream)
new ingestion_lambda_stack_1.IngestionLambdaStack(app, `TransportIngestion-${env}`, {
    env: awsEnv,
    environment: env,
    kinesisStream: infraStack.gpsDataStream,
    stackName: `transport-ingestion-${env}`,
    description: `Transport GPS Ingestion Lambda for ${env} environment`,
});
// Create TrackStore service stack
new trackstore_stack_1.TrackStoreStack(app, `TrackStore-${env}`, {
    env: awsEnv,
    environment: env,
    kinesisStream: infraStack.gpsDataStream,
    deviceTable: infraStack.deviceTable,
    locationTable: infraStack.locationTable,
    stackName: `trackstore-${env}`,
    description: `TrackStore service for ${env} environment`,
});
app.synth();
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidHJhbnNwb3J0LWluZnJhLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsidHJhbnNwb3J0LWluZnJhLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQ0EsdUNBQXFDO0FBQ3JDLGlEQUFtQztBQUNuQyx3RUFBbUU7QUFDbkUsc0RBQWtEO0FBQ2xELDBFQUFxRTtBQUNyRSw4REFBMEQ7QUFFMUQsTUFBTSxHQUFHLEdBQUcsSUFBSSxHQUFHLENBQUMsR0FBRyxFQUFFLENBQUM7QUFFMUIsK0JBQStCO0FBQy9CLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxJQUFJLENBQUMsYUFBYSxDQUFDLEtBQUssQ0FBQyxJQUFJLEtBQUssQ0FBQztBQUVuRCw0REFBNEQ7QUFDNUQsTUFBTSxRQUFRLEdBQUc7SUFDZixHQUFHLEVBQUUsT0FBTyxDQUFDLEdBQUcsQ0FBQyxrQkFBa0IsSUFBSSxPQUFPLENBQUMsR0FBRyxDQUFDLG1CQUFtQjtJQUN0RSxJQUFJLEVBQUUsT0FBTyxDQUFDLEdBQUcsQ0FBQyxtQkFBbUIsSUFBSSxPQUFPLENBQUMsR0FBRyxDQUFDLG1CQUFtQjtDQUN6RSxDQUFDO0FBRUYsNkJBQTZCO0FBQzdCLE1BQU0sTUFBTSxHQUFHO0lBQ2IsT0FBTyxFQUFFLFFBQVEsQ0FBQyxHQUE0QixDQUFDO0lBQy9DLE1BQU0sRUFBRSxPQUFPLENBQUMsR0FBRyxDQUFDLGtCQUFrQixJQUFJLFdBQVc7Q0FDdEQsQ0FBQztBQUVGLHdEQUF3RDtBQUN4RCxJQUFJLDBCQUFXLENBQUMsR0FBRyxFQUFFLG1CQUFtQixHQUFHLEVBQUUsRUFBRTtJQUM3QyxHQUFHLEVBQUUsTUFBTTtJQUNYLFdBQVcsRUFBRSxHQUFHO0lBQ2hCLFlBQVksRUFBRSxHQUFHLEtBQUssTUFBTSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLEVBQUU7SUFDdEMsWUFBWSxFQUFFLE9BQU8sQ0FBQyxHQUFHLENBQUMsWUFBWSxJQUFJLHdCQUF3QjtDQUNuRSxDQUFDLENBQUM7QUFFSCxtQ0FBbUM7QUFDbkMsTUFBTSxVQUFVLEdBQUcsSUFBSSwyQ0FBbUIsQ0FBQyxHQUFHLEVBQUUsa0JBQWtCLEdBQUcsRUFBRSxFQUFFO0lBQ3ZFLEdBQUcsRUFBRSxNQUFNO0lBQ1gsV0FBVyxFQUFFLEdBQUc7SUFDaEIsU0FBUyxFQUFFLGlCQUFpQixHQUFHLEVBQUU7SUFDakMsV0FBVyxFQUFFLG9DQUFvQyxHQUFHLGNBQWM7Q0FDbkUsQ0FBQyxDQUFDO0FBRUgsNEVBQTRFO0FBQzVFLElBQUksNkNBQW9CLENBQUMsR0FBRyxFQUFFLHNCQUFzQixHQUFHLEVBQUUsRUFBRTtJQUN6RCxHQUFHLEVBQUUsTUFBTTtJQUNYLFdBQVcsRUFBRSxHQUFHO0lBQ2hCLGFBQWEsRUFBRSxVQUFVLENBQUMsYUFBYTtJQUN2QyxTQUFTLEVBQUUsdUJBQXVCLEdBQUcsRUFBRTtJQUN2QyxXQUFXLEVBQUUsc0NBQXNDLEdBQUcsY0FBYztDQUNyRSxDQUFDLENBQUM7QUFFSCxrQ0FBa0M7QUFDbEMsSUFBSSxrQ0FBZSxDQUFDLEdBQUcsRUFBRSxjQUFjLEdBQUcsRUFBRSxFQUFFO0lBQzVDLEdBQUcsRUFBRSxNQUFNO0lBQ1gsV0FBVyxFQUFFLEdBQUc7SUFDaEIsYUFBYSxFQUFFLFVBQVUsQ0FBQyxhQUFhO0lBQ3ZDLFdBQVcsRUFBRSxVQUFVLENBQUMsV0FBVztJQUNuQyxhQUFhLEVBQUUsVUFBVSxDQUFDLGFBQWE7SUFDdkMsU0FBUyxFQUFFLGNBQWMsR0FBRyxFQUFFO0lBQzlCLFdBQVcsRUFBRSwwQkFBMEIsR0FBRyxjQUFjO0NBQ3pELENBQUMsQ0FBQztBQUVILEdBQUcsQ0FBQyxLQUFLLEVBQUUsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbIiMhL3Vzci9iaW4vZW52IG5vZGVcclxuaW1wb3J0ICdzb3VyY2UtbWFwLXN1cHBvcnQvcmVnaXN0ZXInO1xyXG5pbXBvcnQgKiBhcyBjZGsgZnJvbSAnYXdzLWNkay1saWInO1xyXG5pbXBvcnQgeyBUcmFuc3BvcnRJbmZyYVN0YWNrIH0gZnJvbSAnLi4vbGliL3RyYW5zcG9ydC1pbmZyYS1zdGFjayc7XHJcbmltcG9ydCB7IEJ1ZGdldFN0YWNrIH0gZnJvbSAnLi4vbGliL2J1ZGdldC1zdGFjayc7XHJcbmltcG9ydCB7IEluZ2VzdGlvbkxhbWJkYVN0YWNrIH0gZnJvbSAnLi4vbGliL2luZ2VzdGlvbi1sYW1iZGEtc3RhY2snO1xyXG5pbXBvcnQgeyBUcmFja1N0b3JlU3RhY2sgfSBmcm9tICcuLi9saWIvdHJhY2tzdG9yZS1zdGFjayc7XHJcblxyXG5jb25zdCBhcHAgPSBuZXcgY2RrLkFwcCgpO1xyXG5cclxuLy8gR2V0IGVudmlyb25tZW50IGZyb20gY29udGV4dFxyXG5jb25zdCBlbnYgPSBhcHAubm9kZS50cnlHZXRDb250ZXh0KCdlbnYnKSB8fCAnZGV2JztcclxuXHJcbi8vIERlZmluZSBhY2NvdW50IElEcyAocmVwbGFjZSB3aXRoIHlvdXIgYWN0dWFsIGFjY291bnQgSURzKVxyXG5jb25zdCBhY2NvdW50cyA9IHtcclxuICBkZXY6IHByb2Nlc3MuZW52LkFXU19ERVZfQUNDT1VOVF9JRCB8fCBwcm9jZXNzLmVudi5DREtfREVGQVVMVF9BQ0NPVU5ULFxyXG4gIHByb2Q6IHByb2Nlc3MuZW52LkFXU19QUk9EX0FDQ09VTlRfSUQgfHwgcHJvY2Vzcy5lbnYuQ0RLX0RFRkFVTFRfQUNDT1VOVFxyXG59O1xyXG5cclxuLy8gRGVmaW5lIHRoZSBBV1MgZW52aXJvbm1lbnRcclxuY29uc3QgYXdzRW52ID0ge1xyXG4gIGFjY291bnQ6IGFjY291bnRzW2VudiBhcyBrZXlvZiB0eXBlb2YgYWNjb3VudHNdLFxyXG4gIHJlZ2lvbjogcHJvY2Vzcy5lbnYuQ0RLX0RFRkFVTFRfUkVHSU9OIHx8ICd1cy1lYXN0LTEnLFxyXG59O1xyXG5cclxuLy8gQ3JlYXRlIGJ1ZGdldCBhbGVydHMgc3RhY2sgKG9ubHkgaW4gdGhlIG1haW4gYWNjb3VudClcclxubmV3IEJ1ZGdldFN0YWNrKGFwcCwgYFRyYW5zcG9ydEJ1ZGdldC0ke2Vudn1gLCB7XHJcbiAgZW52OiBhd3NFbnYsXHJcbiAgZW52aXJvbm1lbnQ6IGVudixcclxuICBidWRnZXRBbW91bnQ6IGVudiA9PT0gJ3Byb2QnID8gNTAgOiAyMCwgLy8gQ2hhbmdlZCBkZXYgYnVkZ2V0IHRvICQyMFxyXG4gIGVtYWlsQWRkcmVzczogcHJvY2Vzcy5lbnYuQlVER0VUX0VNQUlMIHx8ICd5b3VyLWVtYWlsQGV4YW1wbGUuY29tJyxcclxufSk7XHJcblxyXG4vLyBDcmVhdGUgbWFpbiBpbmZyYXN0cnVjdHVyZSBzdGFja1xyXG5jb25zdCBpbmZyYVN0YWNrID0gbmV3IFRyYW5zcG9ydEluZnJhU3RhY2soYXBwLCBgVHJhbnNwb3J0SW5mcmEtJHtlbnZ9YCwge1xyXG4gIGVudjogYXdzRW52LFxyXG4gIGVudmlyb25tZW50OiBlbnYsXHJcbiAgc3RhY2tOYW1lOiBgdHJhbnNwb3J0LWdwcy0ke2Vudn1gLFxyXG4gIGRlc2NyaXB0aW9uOiBgVHJhbnNwb3J0IEdQUyBJbmZyYXN0cnVjdHVyZSBmb3IgJHtlbnZ9IGVudmlyb25tZW50YCxcclxufSk7XHJcblxyXG4vLyBDcmVhdGUgaW5nZXN0aW9uIExhbWJkYSBzdGFjayAoZGVwZW5kcyBvbiBpbmZyYSBzdGFjayBmb3IgS2luZXNpcyBzdHJlYW0pXHJcbm5ldyBJbmdlc3Rpb25MYW1iZGFTdGFjayhhcHAsIGBUcmFuc3BvcnRJbmdlc3Rpb24tJHtlbnZ9YCwge1xyXG4gIGVudjogYXdzRW52LFxyXG4gIGVudmlyb25tZW50OiBlbnYsXHJcbiAga2luZXNpc1N0cmVhbTogaW5mcmFTdGFjay5ncHNEYXRhU3RyZWFtLFxyXG4gIHN0YWNrTmFtZTogYHRyYW5zcG9ydC1pbmdlc3Rpb24tJHtlbnZ9YCxcclxuICBkZXNjcmlwdGlvbjogYFRyYW5zcG9ydCBHUFMgSW5nZXN0aW9uIExhbWJkYSBmb3IgJHtlbnZ9IGVudmlyb25tZW50YCxcclxufSk7XHJcblxyXG4vLyBDcmVhdGUgVHJhY2tTdG9yZSBzZXJ2aWNlIHN0YWNrXHJcbm5ldyBUcmFja1N0b3JlU3RhY2soYXBwLCBgVHJhY2tTdG9yZS0ke2Vudn1gLCB7XHJcbiAgZW52OiBhd3NFbnYsXHJcbiAgZW52aXJvbm1lbnQ6IGVudixcclxuICBraW5lc2lzU3RyZWFtOiBpbmZyYVN0YWNrLmdwc0RhdGFTdHJlYW0sXHJcbiAgZGV2aWNlVGFibGU6IGluZnJhU3RhY2suZGV2aWNlVGFibGUsXHJcbiAgbG9jYXRpb25UYWJsZTogaW5mcmFTdGFjay5sb2NhdGlvblRhYmxlLFxyXG4gIHN0YWNrTmFtZTogYHRyYWNrc3RvcmUtJHtlbnZ9YCxcclxuICBkZXNjcmlwdGlvbjogYFRyYWNrU3RvcmUgc2VydmljZSBmb3IgJHtlbnZ9IGVudmlyb25tZW50YCxcclxufSk7XHJcblxyXG5hcHAuc3ludGgoKTsiXX0=