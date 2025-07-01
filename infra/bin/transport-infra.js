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
// Create budget alerts stack (only in the prod  account)
new budget_stack_1.BudgetStack(app, `TransportBudget-${env}`, {
    env: awsEnv,
    environment: env,
    budgetAmount: env === 'prod' ? 50 : 20,
    emailAddress: process.env.BUDGET_EMAIL || 'your-email@example.com',
});
// Create main infrastructure stack
new transport_infra_stack_1.TransportInfraStack(app, `TransportInfra-${env}`, {
    env: awsEnv,
    environment: env,
    stackName: `transport-gps-${env}`,
    description: `Transport GPS Infrastructure for ${env} environment`,
});
app.synth();
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidHJhbnNwb3J0LWluZnJhLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsidHJhbnNwb3J0LWluZnJhLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQ0EsdUNBQXFDO0FBQ3JDLGlEQUFtQztBQUNuQyx3RUFBbUU7QUFDbkUsc0RBQWtEO0FBRWxELE1BQU0sR0FBRyxHQUFHLElBQUksR0FBRyxDQUFDLEdBQUcsRUFBRSxDQUFDO0FBRTFCLCtCQUErQjtBQUMvQixNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsSUFBSSxDQUFDLGFBQWEsQ0FBQyxLQUFLLENBQUMsSUFBSSxLQUFLLENBQUM7QUFFbkQscUJBQXFCO0FBQ3JCLE1BQU0sUUFBUSxHQUFHO0lBQ2YsR0FBRyxFQUFFLE9BQU8sQ0FBQyxHQUFHLENBQUMsa0JBQWtCLElBQUksT0FBTyxDQUFDLEdBQUcsQ0FBQyxtQkFBbUI7SUFDdEUsSUFBSSxFQUFFLE9BQU8sQ0FBQyxHQUFHLENBQUMsbUJBQW1CLElBQUksT0FBTyxDQUFDLEdBQUcsQ0FBQyxtQkFBbUI7Q0FDekUsQ0FBQztBQUVGLDZCQUE2QjtBQUM3QixNQUFNLE1BQU0sR0FBRztJQUNiLE9BQU8sRUFBRSxRQUFRLENBQUMsR0FBNEIsQ0FBQztJQUMvQyxNQUFNLEVBQUUsT0FBTyxDQUFDLEdBQUcsQ0FBQyxrQkFBa0IsSUFBSSxXQUFXO0NBQ3RELENBQUM7QUFFRix5REFBeUQ7QUFDekQsSUFBSSwwQkFBVyxDQUFDLEdBQUcsRUFBRSxtQkFBbUIsR0FBRyxFQUFFLEVBQUU7SUFDN0MsR0FBRyxFQUFFLE1BQU07SUFDWCxXQUFXLEVBQUUsR0FBRztJQUNoQixZQUFZLEVBQUUsR0FBRyxLQUFLLE1BQU0sQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxFQUFFO0lBQ3RDLFlBQVksRUFBRSxPQUFPLENBQUMsR0FBRyxDQUFDLFlBQVksSUFBSSx3QkFBd0I7Q0FDbkUsQ0FBQyxDQUFDO0FBRUgsbUNBQW1DO0FBQ25DLElBQUksMkNBQW1CLENBQUMsR0FBRyxFQUFFLGtCQUFrQixHQUFHLEVBQUUsRUFBRTtJQUNwRCxHQUFHLEVBQUUsTUFBTTtJQUNYLFdBQVcsRUFBRSxHQUFHO0lBQ2hCLFNBQVMsRUFBRSxpQkFBaUIsR0FBRyxFQUFFO0lBQ2pDLFdBQVcsRUFBRSxvQ0FBb0MsR0FBRyxjQUFjO0NBQ25FLENBQUMsQ0FBQztBQUVILEdBQUcsQ0FBQyxLQUFLLEVBQUUsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbIiMhL3Vzci9iaW4vZW52IG5vZGVcclxuaW1wb3J0ICdzb3VyY2UtbWFwLXN1cHBvcnQvcmVnaXN0ZXInO1xyXG5pbXBvcnQgKiBhcyBjZGsgZnJvbSAnYXdzLWNkay1saWInO1xyXG5pbXBvcnQgeyBUcmFuc3BvcnRJbmZyYVN0YWNrIH0gZnJvbSAnLi4vbGliL3RyYW5zcG9ydC1pbmZyYS1zdGFjayc7XHJcbmltcG9ydCB7IEJ1ZGdldFN0YWNrIH0gZnJvbSAnLi4vbGliL2J1ZGdldC1zdGFjayc7XHJcblxyXG5jb25zdCBhcHAgPSBuZXcgY2RrLkFwcCgpO1xyXG5cclxuLy8gR2V0IGVudmlyb25tZW50IGZyb20gY29udGV4dFxyXG5jb25zdCBlbnYgPSBhcHAubm9kZS50cnlHZXRDb250ZXh0KCdlbnYnKSB8fCAnZGV2JztcclxuXHJcbi8vIERlZmluZSBhY2NvdW50IElEc1xyXG5jb25zdCBhY2NvdW50cyA9IHtcclxuICBkZXY6IHByb2Nlc3MuZW52LkFXU19ERVZfQUNDT1VOVF9JRCB8fCBwcm9jZXNzLmVudi5DREtfREVGQVVMVF9BQ0NPVU5ULFxyXG4gIHByb2Q6IHByb2Nlc3MuZW52LkFXU19QUk9EX0FDQ09VTlRfSUQgfHwgcHJvY2Vzcy5lbnYuQ0RLX0RFRkFVTFRfQUNDT1VOVFxyXG59O1xyXG5cclxuLy8gRGVmaW5lIHRoZSBBV1MgZW52aXJvbm1lbnRcclxuY29uc3QgYXdzRW52ID0ge1xyXG4gIGFjY291bnQ6IGFjY291bnRzW2VudiBhcyBrZXlvZiB0eXBlb2YgYWNjb3VudHNdLFxyXG4gIHJlZ2lvbjogcHJvY2Vzcy5lbnYuQ0RLX0RFRkFVTFRfUkVHSU9OIHx8ICd1cy1lYXN0LTEnLFxyXG59O1xyXG5cclxuLy8gQ3JlYXRlIGJ1ZGdldCBhbGVydHMgc3RhY2sgKG9ubHkgaW4gdGhlIHByb2QgIGFjY291bnQpXHJcbm5ldyBCdWRnZXRTdGFjayhhcHAsIGBUcmFuc3BvcnRCdWRnZXQtJHtlbnZ9YCwge1xyXG4gIGVudjogYXdzRW52LFxyXG4gIGVudmlyb25tZW50OiBlbnYsXHJcbiAgYnVkZ2V0QW1vdW50OiBlbnYgPT09ICdwcm9kJyA/IDUwIDogMjAsIFxyXG4gIGVtYWlsQWRkcmVzczogcHJvY2Vzcy5lbnYuQlVER0VUX0VNQUlMIHx8ICd5b3VyLWVtYWlsQGV4YW1wbGUuY29tJyxcclxufSk7XHJcblxyXG4vLyBDcmVhdGUgbWFpbiBpbmZyYXN0cnVjdHVyZSBzdGFja1xyXG5uZXcgVHJhbnNwb3J0SW5mcmFTdGFjayhhcHAsIGBUcmFuc3BvcnRJbmZyYS0ke2Vudn1gLCB7XHJcbiAgZW52OiBhd3NFbnYsXHJcbiAgZW52aXJvbm1lbnQ6IGVudixcclxuICBzdGFja05hbWU6IGB0cmFuc3BvcnQtZ3BzLSR7ZW52fWAsXHJcbiAgZGVzY3JpcHRpb246IGBUcmFuc3BvcnQgR1BTIEluZnJhc3RydWN0dXJlIGZvciAke2Vudn0gZW52aXJvbm1lbnRgLFxyXG59KTtcclxuXHJcbmFwcC5zeW50aCgpOyJdfQ==