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
app.synth();
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidHJhbnNwb3J0LWluZnJhLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsidHJhbnNwb3J0LWluZnJhLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQ0EsdUNBQXFDO0FBQ3JDLGlEQUFtQztBQUNuQyx3RUFBbUU7QUFDbkUsc0RBQWtEO0FBQ2xELDBFQUFxRTtBQUVyRSxNQUFNLEdBQUcsR0FBRyxJQUFJLEdBQUcsQ0FBQyxHQUFHLEVBQUUsQ0FBQztBQUUxQiwrQkFBK0I7QUFDL0IsTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUMsS0FBSyxDQUFDLElBQUksS0FBSyxDQUFDO0FBRW5ELDREQUE0RDtBQUM1RCxNQUFNLFFBQVEsR0FBRztJQUNmLEdBQUcsRUFBRSxPQUFPLENBQUMsR0FBRyxDQUFDLGtCQUFrQixJQUFJLE9BQU8sQ0FBQyxHQUFHLENBQUMsbUJBQW1CO0lBQ3RFLElBQUksRUFBRSxPQUFPLENBQUMsR0FBRyxDQUFDLG1CQUFtQixJQUFJLE9BQU8sQ0FBQyxHQUFHLENBQUMsbUJBQW1CO0NBQ3pFLENBQUM7QUFFRiw2QkFBNkI7QUFDN0IsTUFBTSxNQUFNLEdBQUc7SUFDYixPQUFPLEVBQUUsUUFBUSxDQUFDLEdBQTRCLENBQUM7SUFDL0MsTUFBTSxFQUFFLE9BQU8sQ0FBQyxHQUFHLENBQUMsa0JBQWtCLElBQUksV0FBVztDQUN0RCxDQUFDO0FBRUYsd0RBQXdEO0FBQ3hELElBQUksMEJBQVcsQ0FBQyxHQUFHLEVBQUUsbUJBQW1CLEdBQUcsRUFBRSxFQUFFO0lBQzdDLEdBQUcsRUFBRSxNQUFNO0lBQ1gsV0FBVyxFQUFFLEdBQUc7SUFDaEIsWUFBWSxFQUFFLEdBQUcsS0FBSyxNQUFNLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsRUFBRTtJQUN0QyxZQUFZLEVBQUUsT0FBTyxDQUFDLEdBQUcsQ0FBQyxZQUFZLElBQUksd0JBQXdCO0NBQ25FLENBQUMsQ0FBQztBQUVILG1DQUFtQztBQUNuQyxNQUFNLFVBQVUsR0FBRyxJQUFJLDJDQUFtQixDQUFDLEdBQUcsRUFBRSxrQkFBa0IsR0FBRyxFQUFFLEVBQUU7SUFDdkUsR0FBRyxFQUFFLE1BQU07SUFDWCxXQUFXLEVBQUUsR0FBRztJQUNoQixTQUFTLEVBQUUsaUJBQWlCLEdBQUcsRUFBRTtJQUNqQyxXQUFXLEVBQUUsb0NBQW9DLEdBQUcsY0FBYztDQUNuRSxDQUFDLENBQUM7QUFFSCw0RUFBNEU7QUFDNUUsSUFBSSw2Q0FBb0IsQ0FBQyxHQUFHLEVBQUUsc0JBQXNCLEdBQUcsRUFBRSxFQUFFO0lBQ3pELEdBQUcsRUFBRSxNQUFNO0lBQ1gsV0FBVyxFQUFFLEdBQUc7SUFDaEIsYUFBYSxFQUFFLFVBQVUsQ0FBQyxhQUFhO0lBQ3ZDLFNBQVMsRUFBRSx1QkFBdUIsR0FBRyxFQUFFO0lBQ3ZDLFdBQVcsRUFBRSxzQ0FBc0MsR0FBRyxjQUFjO0NBQ3JFLENBQUMsQ0FBQztBQUVILEdBQUcsQ0FBQyxLQUFLLEVBQUUsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbIiMhL3Vzci9iaW4vZW52IG5vZGVcclxuaW1wb3J0ICdzb3VyY2UtbWFwLXN1cHBvcnQvcmVnaXN0ZXInO1xyXG5pbXBvcnQgKiBhcyBjZGsgZnJvbSAnYXdzLWNkay1saWInO1xyXG5pbXBvcnQgeyBUcmFuc3BvcnRJbmZyYVN0YWNrIH0gZnJvbSAnLi4vbGliL3RyYW5zcG9ydC1pbmZyYS1zdGFjayc7XHJcbmltcG9ydCB7IEJ1ZGdldFN0YWNrIH0gZnJvbSAnLi4vbGliL2J1ZGdldC1zdGFjayc7XHJcbmltcG9ydCB7IEluZ2VzdGlvbkxhbWJkYVN0YWNrIH0gZnJvbSAnLi4vbGliL2luZ2VzdGlvbi1sYW1iZGEtc3RhY2snO1xyXG5cclxuY29uc3QgYXBwID0gbmV3IGNkay5BcHAoKTtcclxuXHJcbi8vIEdldCBlbnZpcm9ubWVudCBmcm9tIGNvbnRleHRcclxuY29uc3QgZW52ID0gYXBwLm5vZGUudHJ5R2V0Q29udGV4dCgnZW52JykgfHwgJ2Rldic7XHJcblxyXG4vLyBEZWZpbmUgYWNjb3VudCBJRHMgKHJlcGxhY2Ugd2l0aCB5b3VyIGFjdHVhbCBhY2NvdW50IElEcylcclxuY29uc3QgYWNjb3VudHMgPSB7XHJcbiAgZGV2OiBwcm9jZXNzLmVudi5BV1NfREVWX0FDQ09VTlRfSUQgfHwgcHJvY2Vzcy5lbnYuQ0RLX0RFRkFVTFRfQUNDT1VOVCxcclxuICBwcm9kOiBwcm9jZXNzLmVudi5BV1NfUFJPRF9BQ0NPVU5UX0lEIHx8IHByb2Nlc3MuZW52LkNES19ERUZBVUxUX0FDQ09VTlRcclxufTtcclxuXHJcbi8vIERlZmluZSB0aGUgQVdTIGVudmlyb25tZW50XHJcbmNvbnN0IGF3c0VudiA9IHtcclxuICBhY2NvdW50OiBhY2NvdW50c1tlbnYgYXMga2V5b2YgdHlwZW9mIGFjY291bnRzXSxcclxuICByZWdpb246IHByb2Nlc3MuZW52LkNES19ERUZBVUxUX1JFR0lPTiB8fCAndXMtZWFzdC0xJyxcclxufTtcclxuXHJcbi8vIENyZWF0ZSBidWRnZXQgYWxlcnRzIHN0YWNrIChvbmx5IGluIHRoZSBtYWluIGFjY291bnQpXHJcbm5ldyBCdWRnZXRTdGFjayhhcHAsIGBUcmFuc3BvcnRCdWRnZXQtJHtlbnZ9YCwge1xyXG4gIGVudjogYXdzRW52LFxyXG4gIGVudmlyb25tZW50OiBlbnYsXHJcbiAgYnVkZ2V0QW1vdW50OiBlbnYgPT09ICdwcm9kJyA/IDUwIDogMjAsIC8vIENoYW5nZWQgZGV2IGJ1ZGdldCB0byAkMjBcclxuICBlbWFpbEFkZHJlc3M6IHByb2Nlc3MuZW52LkJVREdFVF9FTUFJTCB8fCAneW91ci1lbWFpbEBleGFtcGxlLmNvbScsXHJcbn0pO1xyXG5cclxuLy8gQ3JlYXRlIG1haW4gaW5mcmFzdHJ1Y3R1cmUgc3RhY2tcclxuY29uc3QgaW5mcmFTdGFjayA9IG5ldyBUcmFuc3BvcnRJbmZyYVN0YWNrKGFwcCwgYFRyYW5zcG9ydEluZnJhLSR7ZW52fWAsIHtcclxuICBlbnY6IGF3c0VudixcclxuICBlbnZpcm9ubWVudDogZW52LFxyXG4gIHN0YWNrTmFtZTogYHRyYW5zcG9ydC1ncHMtJHtlbnZ9YCxcclxuICBkZXNjcmlwdGlvbjogYFRyYW5zcG9ydCBHUFMgSW5mcmFzdHJ1Y3R1cmUgZm9yICR7ZW52fSBlbnZpcm9ubWVudGAsXHJcbn0pO1xyXG5cclxuLy8gQ3JlYXRlIGluZ2VzdGlvbiBMYW1iZGEgc3RhY2sgKGRlcGVuZHMgb24gaW5mcmEgc3RhY2sgZm9yIEtpbmVzaXMgc3RyZWFtKVxyXG5uZXcgSW5nZXN0aW9uTGFtYmRhU3RhY2soYXBwLCBgVHJhbnNwb3J0SW5nZXN0aW9uLSR7ZW52fWAsIHtcclxuICBlbnY6IGF3c0VudixcclxuICBlbnZpcm9ubWVudDogZW52LFxyXG4gIGtpbmVzaXNTdHJlYW06IGluZnJhU3RhY2suZ3BzRGF0YVN0cmVhbSxcclxuICBzdGFja05hbWU6IGB0cmFuc3BvcnQtaW5nZXN0aW9uLSR7ZW52fWAsXHJcbiAgZGVzY3JpcHRpb246IGBUcmFuc3BvcnQgR1BTIEluZ2VzdGlvbiBMYW1iZGEgZm9yICR7ZW52fSBlbnZpcm9ubWVudGAsXHJcbn0pO1xyXG5cclxuYXBwLnN5bnRoKCk7Il19