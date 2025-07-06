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
const geofence_stack_1 = require("../lib/geofence-stack");
const app = new cdk.App();
// Get environment from context
const env = app.node.tryGetContext('env') || 'dev';
// Define account IDs
const accounts = {
    dev: process.env.AWS_DEV_ACCOUNT_ID || process.env.CDK_DEFAULT_ACCOUNT,
    prod: process.env.AWS_PROD_ACCOUNT_ID || process.env.CDK_DEFAULT_ACCOUNT
};
// Define the AWS environment
const awsEnv = {
    account: accounts[env],
    region: process.env.CDK_DEFAULT_REGION || 'us-east-1',
};
// Create budget alerts stack
new budget_stack_1.BudgetStack(app, `TransportBudget-${env}`, {
    env: awsEnv,
    environment: env,
    budgetAmount: env === 'prod' ? 50 : 25,
    emailAddress: process.env.BUDGET_EMAIL || 'your-email@example.com',
});
// Create main infrastructure stack
const infraStack = new transport_infra_stack_1.TransportInfraStack(app, `TransportInfra-${env}`, {
    env: awsEnv,
    environment: env,
    stackName: `transport-gps-${env}`,
    description: `Transport GPS Infrastructure for ${env} environment`,
});
// Create ingestion Lambda stack
new ingestion_lambda_stack_1.IngestionLambdaStack(app, `TransportIngestion-${env}`, {
    env: awsEnv,
    environment: env,
    kinesisStream: infraStack.gpsDataStream,
    stackName: `transport-ingestion-${env}`,
    description: `Transport GPS Ingestion Lambda for ${env} environment`,
});
// Create TrackStore service stack
const trackStoreStack = new trackstore_stack_1.TrackStoreStack(app, `TrackStore-${env}`, {
    env: awsEnv,
    environment: env,
    kinesisStream: infraStack.gpsDataStream,
    deviceTable: infraStack.deviceTable,
    locationTable: infraStack.locationTable,
    stackName: `trackstore-${env}`,
    description: `TrackStore service for ${env} environment`,
});
// Create Geofence Alerts service stack
// Reuse VPC and cluster from TrackStore to save costs
new geofence_stack_1.GeofenceStack(app, `GeofenceAlerts-${env}`, {
    env: awsEnv,
    environment: env,
    vpc: trackStoreStack.vpc,
    cluster: trackStoreStack.cluster,
    stackName: `geofence-alerts-${env}`,
    description: `Geofence Alerts service for ${env} environment`,
});
app.synth();
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidHJhbnNwb3J0LWluZnJhLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsidHJhbnNwb3J0LWluZnJhLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQ0EsdUNBQXFDO0FBQ3JDLGlEQUFtQztBQUNuQyx3RUFBbUU7QUFDbkUsc0RBQWtEO0FBQ2xELDBFQUFxRTtBQUNyRSw4REFBMEQ7QUFDMUQsMERBQXNEO0FBRXRELE1BQU0sR0FBRyxHQUFHLElBQUksR0FBRyxDQUFDLEdBQUcsRUFBRSxDQUFDO0FBRTFCLCtCQUErQjtBQUMvQixNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsSUFBSSxDQUFDLGFBQWEsQ0FBQyxLQUFLLENBQUMsSUFBSSxLQUFLLENBQUM7QUFFbkQscUJBQXFCO0FBQ3JCLE1BQU0sUUFBUSxHQUFHO0lBQ2YsR0FBRyxFQUFFLE9BQU8sQ0FBQyxHQUFHLENBQUMsa0JBQWtCLElBQUksT0FBTyxDQUFDLEdBQUcsQ0FBQyxtQkFBbUI7SUFDdEUsSUFBSSxFQUFFLE9BQU8sQ0FBQyxHQUFHLENBQUMsbUJBQW1CLElBQUksT0FBTyxDQUFDLEdBQUcsQ0FBQyxtQkFBbUI7Q0FDekUsQ0FBQztBQUVGLDZCQUE2QjtBQUM3QixNQUFNLE1BQU0sR0FBRztJQUNiLE9BQU8sRUFBRSxRQUFRLENBQUMsR0FBNEIsQ0FBQztJQUMvQyxNQUFNLEVBQUUsT0FBTyxDQUFDLEdBQUcsQ0FBQyxrQkFBa0IsSUFBSSxXQUFXO0NBQ3RELENBQUM7QUFFRiw2QkFBNkI7QUFDN0IsSUFBSSwwQkFBVyxDQUFDLEdBQUcsRUFBRSxtQkFBbUIsR0FBRyxFQUFFLEVBQUU7SUFDN0MsR0FBRyxFQUFFLE1BQU07SUFDWCxXQUFXLEVBQUUsR0FBRztJQUNoQixZQUFZLEVBQUUsR0FBRyxLQUFLLE1BQU0sQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxFQUFFO0lBQ3RDLFlBQVksRUFBRSxPQUFPLENBQUMsR0FBRyxDQUFDLFlBQVksSUFBSSx3QkFBd0I7Q0FDbkUsQ0FBQyxDQUFDO0FBRUgsbUNBQW1DO0FBQ25DLE1BQU0sVUFBVSxHQUFHLElBQUksMkNBQW1CLENBQUMsR0FBRyxFQUFFLGtCQUFrQixHQUFHLEVBQUUsRUFBRTtJQUN2RSxHQUFHLEVBQUUsTUFBTTtJQUNYLFdBQVcsRUFBRSxHQUFHO0lBQ2hCLFNBQVMsRUFBRSxpQkFBaUIsR0FBRyxFQUFFO0lBQ2pDLFdBQVcsRUFBRSxvQ0FBb0MsR0FBRyxjQUFjO0NBQ25FLENBQUMsQ0FBQztBQUVILGdDQUFnQztBQUNoQyxJQUFJLDZDQUFvQixDQUFDLEdBQUcsRUFBRSxzQkFBc0IsR0FBRyxFQUFFLEVBQUU7SUFDekQsR0FBRyxFQUFFLE1BQU07SUFDWCxXQUFXLEVBQUUsR0FBRztJQUNoQixhQUFhLEVBQUUsVUFBVSxDQUFDLGFBQWE7SUFDdkMsU0FBUyxFQUFFLHVCQUF1QixHQUFHLEVBQUU7SUFDdkMsV0FBVyxFQUFFLHNDQUFzQyxHQUFHLGNBQWM7Q0FDckUsQ0FBQyxDQUFDO0FBRUgsa0NBQWtDO0FBQ2xDLE1BQU0sZUFBZSxHQUFHLElBQUksa0NBQWUsQ0FBQyxHQUFHLEVBQUUsY0FBYyxHQUFHLEVBQUUsRUFBRTtJQUNwRSxHQUFHLEVBQUUsTUFBTTtJQUNYLFdBQVcsRUFBRSxHQUFHO0lBQ2hCLGFBQWEsRUFBRSxVQUFVLENBQUMsYUFBYTtJQUN2QyxXQUFXLEVBQUUsVUFBVSxDQUFDLFdBQVc7SUFDbkMsYUFBYSxFQUFFLFVBQVUsQ0FBQyxhQUFhO0lBQ3ZDLFNBQVMsRUFBRSxjQUFjLEdBQUcsRUFBRTtJQUM5QixXQUFXLEVBQUUsMEJBQTBCLEdBQUcsY0FBYztDQUN6RCxDQUFDLENBQUM7QUFFSCx1Q0FBdUM7QUFDdkMsc0RBQXNEO0FBQ3RELElBQUksOEJBQWEsQ0FBQyxHQUFHLEVBQUUsa0JBQWtCLEdBQUcsRUFBRSxFQUFFO0lBQzlDLEdBQUcsRUFBRSxNQUFNO0lBQ1gsV0FBVyxFQUFFLEdBQUc7SUFDaEIsR0FBRyxFQUFFLGVBQWUsQ0FBQyxHQUFHO0lBQ3hCLE9BQU8sRUFBRSxlQUFlLENBQUMsT0FBTztJQUNoQyxTQUFTLEVBQUUsbUJBQW1CLEdBQUcsRUFBRTtJQUNuQyxXQUFXLEVBQUUsK0JBQStCLEdBQUcsY0FBYztDQUM5RCxDQUFDLENBQUM7QUFFSCxHQUFHLENBQUMsS0FBSyxFQUFFLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyIjIS91c3IvYmluL2VudiBub2RlXHJcbmltcG9ydCAnc291cmNlLW1hcC1zdXBwb3J0L3JlZ2lzdGVyJztcclxuaW1wb3J0ICogYXMgY2RrIGZyb20gJ2F3cy1jZGstbGliJztcclxuaW1wb3J0IHsgVHJhbnNwb3J0SW5mcmFTdGFjayB9IGZyb20gJy4uL2xpYi90cmFuc3BvcnQtaW5mcmEtc3RhY2snO1xyXG5pbXBvcnQgeyBCdWRnZXRTdGFjayB9IGZyb20gJy4uL2xpYi9idWRnZXQtc3RhY2snO1xyXG5pbXBvcnQgeyBJbmdlc3Rpb25MYW1iZGFTdGFjayB9IGZyb20gJy4uL2xpYi9pbmdlc3Rpb24tbGFtYmRhLXN0YWNrJztcclxuaW1wb3J0IHsgVHJhY2tTdG9yZVN0YWNrIH0gZnJvbSAnLi4vbGliL3RyYWNrc3RvcmUtc3RhY2snO1xyXG5pbXBvcnQgeyBHZW9mZW5jZVN0YWNrIH0gZnJvbSAnLi4vbGliL2dlb2ZlbmNlLXN0YWNrJztcclxuXHJcbmNvbnN0IGFwcCA9IG5ldyBjZGsuQXBwKCk7XHJcblxyXG4vLyBHZXQgZW52aXJvbm1lbnQgZnJvbSBjb250ZXh0XHJcbmNvbnN0IGVudiA9IGFwcC5ub2RlLnRyeUdldENvbnRleHQoJ2VudicpIHx8ICdkZXYnO1xyXG5cclxuLy8gRGVmaW5lIGFjY291bnQgSURzXHJcbmNvbnN0IGFjY291bnRzID0ge1xyXG4gIGRldjogcHJvY2Vzcy5lbnYuQVdTX0RFVl9BQ0NPVU5UX0lEIHx8IHByb2Nlc3MuZW52LkNES19ERUZBVUxUX0FDQ09VTlQsXHJcbiAgcHJvZDogcHJvY2Vzcy5lbnYuQVdTX1BST0RfQUNDT1VOVF9JRCB8fCBwcm9jZXNzLmVudi5DREtfREVGQVVMVF9BQ0NPVU5UXHJcbn07XHJcblxyXG4vLyBEZWZpbmUgdGhlIEFXUyBlbnZpcm9ubWVudFxyXG5jb25zdCBhd3NFbnYgPSB7XHJcbiAgYWNjb3VudDogYWNjb3VudHNbZW52IGFzIGtleW9mIHR5cGVvZiBhY2NvdW50c10sXHJcbiAgcmVnaW9uOiBwcm9jZXNzLmVudi5DREtfREVGQVVMVF9SRUdJT04gfHwgJ3VzLWVhc3QtMScsXHJcbn07XHJcblxyXG4vLyBDcmVhdGUgYnVkZ2V0IGFsZXJ0cyBzdGFja1xyXG5uZXcgQnVkZ2V0U3RhY2soYXBwLCBgVHJhbnNwb3J0QnVkZ2V0LSR7ZW52fWAsIHtcclxuICBlbnY6IGF3c0VudixcclxuICBlbnZpcm9ubWVudDogZW52LFxyXG4gIGJ1ZGdldEFtb3VudDogZW52ID09PSAncHJvZCcgPyA1MCA6IDI1LCAvLyBJbmNyZWFzZWQgZGV2IGJ1ZGdldCBmb3IgbmV3IHNlcnZpY2VcclxuICBlbWFpbEFkZHJlc3M6IHByb2Nlc3MuZW52LkJVREdFVF9FTUFJTCB8fCAneW91ci1lbWFpbEBleGFtcGxlLmNvbScsXHJcbn0pO1xyXG5cclxuLy8gQ3JlYXRlIG1haW4gaW5mcmFzdHJ1Y3R1cmUgc3RhY2tcclxuY29uc3QgaW5mcmFTdGFjayA9IG5ldyBUcmFuc3BvcnRJbmZyYVN0YWNrKGFwcCwgYFRyYW5zcG9ydEluZnJhLSR7ZW52fWAsIHtcclxuICBlbnY6IGF3c0VudixcclxuICBlbnZpcm9ubWVudDogZW52LFxyXG4gIHN0YWNrTmFtZTogYHRyYW5zcG9ydC1ncHMtJHtlbnZ9YCxcclxuICBkZXNjcmlwdGlvbjogYFRyYW5zcG9ydCBHUFMgSW5mcmFzdHJ1Y3R1cmUgZm9yICR7ZW52fSBlbnZpcm9ubWVudGAsXHJcbn0pO1xyXG5cclxuLy8gQ3JlYXRlIGluZ2VzdGlvbiBMYW1iZGEgc3RhY2tcclxubmV3IEluZ2VzdGlvbkxhbWJkYVN0YWNrKGFwcCwgYFRyYW5zcG9ydEluZ2VzdGlvbi0ke2Vudn1gLCB7XHJcbiAgZW52OiBhd3NFbnYsXHJcbiAgZW52aXJvbm1lbnQ6IGVudixcclxuICBraW5lc2lzU3RyZWFtOiBpbmZyYVN0YWNrLmdwc0RhdGFTdHJlYW0sXHJcbiAgc3RhY2tOYW1lOiBgdHJhbnNwb3J0LWluZ2VzdGlvbi0ke2Vudn1gLFxyXG4gIGRlc2NyaXB0aW9uOiBgVHJhbnNwb3J0IEdQUyBJbmdlc3Rpb24gTGFtYmRhIGZvciAke2Vudn0gZW52aXJvbm1lbnRgLFxyXG59KTtcclxuXHJcbi8vIENyZWF0ZSBUcmFja1N0b3JlIHNlcnZpY2Ugc3RhY2tcclxuY29uc3QgdHJhY2tTdG9yZVN0YWNrID0gbmV3IFRyYWNrU3RvcmVTdGFjayhhcHAsIGBUcmFja1N0b3JlLSR7ZW52fWAsIHtcclxuICBlbnY6IGF3c0VudixcclxuICBlbnZpcm9ubWVudDogZW52LFxyXG4gIGtpbmVzaXNTdHJlYW06IGluZnJhU3RhY2suZ3BzRGF0YVN0cmVhbSxcclxuICBkZXZpY2VUYWJsZTogaW5mcmFTdGFjay5kZXZpY2VUYWJsZSxcclxuICBsb2NhdGlvblRhYmxlOiBpbmZyYVN0YWNrLmxvY2F0aW9uVGFibGUsXHJcbiAgc3RhY2tOYW1lOiBgdHJhY2tzdG9yZS0ke2Vudn1gLFxyXG4gIGRlc2NyaXB0aW9uOiBgVHJhY2tTdG9yZSBzZXJ2aWNlIGZvciAke2Vudn0gZW52aXJvbm1lbnRgLFxyXG59KTtcclxuXHJcbi8vIENyZWF0ZSBHZW9mZW5jZSBBbGVydHMgc2VydmljZSBzdGFja1xyXG4vLyBSZXVzZSBWUEMgYW5kIGNsdXN0ZXIgZnJvbSBUcmFja1N0b3JlIHRvIHNhdmUgY29zdHNcclxubmV3IEdlb2ZlbmNlU3RhY2soYXBwLCBgR2VvZmVuY2VBbGVydHMtJHtlbnZ9YCwge1xyXG4gIGVudjogYXdzRW52LFxyXG4gIGVudmlyb25tZW50OiBlbnYsXHJcbiAgdnBjOiB0cmFja1N0b3JlU3RhY2sudnBjLFxyXG4gIGNsdXN0ZXI6IHRyYWNrU3RvcmVTdGFjay5jbHVzdGVyLFxyXG4gIHN0YWNrTmFtZTogYGdlb2ZlbmNlLWFsZXJ0cy0ke2Vudn1gLFxyXG4gIGRlc2NyaXB0aW9uOiBgR2VvZmVuY2UgQWxlcnRzIHNlcnZpY2UgZm9yICR7ZW52fSBlbnZpcm9ubWVudGAsXHJcbn0pO1xyXG5cclxuYXBwLnN5bnRoKCk7Il19