#!/bin/bash

set -e

ENVIRONMENT=${1:-dev}
REGION=${2:-us-east-1}

echo "Deploying Geofence Alerts Service to $ENVIRONMENT environment..."

# Build the Docker image
echo "Building Docker image..."
docker build -t geofence-alerts:latest .

# Tag for ECR
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
ECR_REPO="$ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com/geofence-alerts"

echo "Tagging image for ECR..."
docker tag geofence-alerts:latest $ECR_REPO:latest
docker tag geofence-alerts:latest $ECR_REPO:$ENVIRONMENT

# Login to ECR
echo "Logging into ECR..."
aws ecr get-login-password --region $REGION | docker login --username AWS --password-stdin $ECR_REPO

# Create ECR repository if it doesn't exist
aws ecr describe-repositories --repository-names geofence-alerts --region $REGION 2>/dev/null || {
    echo "Creating ECR repository..."
    aws ecr create-repository --repository-name geofence-alerts --region $REGION
}

# Push to ECR
echo "Pushing image to ECR..."
docker push $ECR_REPO:latest
docker push $ECR_REPO:$ENVIRONMENT

# Deploy infrastructure
echo "Deploying CDK stack..."
cd ../../infra
npm run deploy:$ENVIRONMENT -- --exclusively GeofenceAlerts-$ENVIRONMENT

echo "Deployment complete!"
echo "Service URL will be available in CDK outputs"