#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { TransportInfraStack } from '../lib/transport-infra-stack';
import { BudgetStack } from '../lib/budget-stack';

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
  account: accounts[env as keyof typeof accounts],
  region: process.env.CDK_DEFAULT_REGION || 'us-east-1',
};

// Create budget alerts stack (only in the prod  account)
new BudgetStack(app, `TransportBudget-${env}`, {
  env: awsEnv,
  environment: env,
  budgetAmount: env === 'prod' ? 50 : 20, 
  emailAddress: process.env.BUDGET_EMAIL || 'your-email@example.com',
});

// Create main infrastructure stack
new TransportInfraStack(app, `TransportInfra-${env}`, {
  env: awsEnv,
  environment: env,
  stackName: `transport-gps-${env}`,
  description: `Transport GPS Infrastructure for ${env} environment`,
});

app.synth();