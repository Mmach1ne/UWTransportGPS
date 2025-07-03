#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { TransportInfraStack } from '../lib/transport-infra-stack';
import { BudgetStack } from '../lib/budget-stack';
import { IngestionLambdaStack } from '../lib/ingestion-lambda-stack';
import { TrackStoreStack } from '../lib/trackstore-stack';

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
  account: accounts[env as keyof typeof accounts],
  region: process.env.CDK_DEFAULT_REGION || 'us-east-1',
};

// Create budget alerts stack (only in the main account)
new BudgetStack(app, `TransportBudget-${env}`, {
  env: awsEnv,
  environment: env,
  budgetAmount: env === 'prod' ? 50 : 20, // Changed dev budget to $20
  emailAddress: process.env.BUDGET_EMAIL || 'your-email@example.com',
});

// Create main infrastructure stack
const infraStack = new TransportInfraStack(app, `TransportInfra-${env}`, {
  env: awsEnv,
  environment: env,
  stackName: `transport-gps-${env}`,
  description: `Transport GPS Infrastructure for ${env} environment`,
});

// Create ingestion Lambda stack (depends on infra stack for Kinesis stream)
new IngestionLambdaStack(app, `TransportIngestion-${env}`, {
  env: awsEnv,
  environment: env,
  kinesisStream: infraStack.gpsDataStream,
  stackName: `transport-ingestion-${env}`,
  description: `Transport GPS Ingestion Lambda for ${env} environment`,
});

// Create TrackStore service stack
new TrackStoreStack(app, `TrackStore-${env}`, {
  env: awsEnv,
  environment: env,
  kinesisStream: infraStack.gpsDataStream,
  deviceTable: infraStack.deviceTable,
  locationTable: infraStack.locationTable,
  stackName: `trackstore-${env}`,
  description: `TrackStore service for ${env} environment`,
});

app.synth();