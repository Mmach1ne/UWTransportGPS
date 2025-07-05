import * as cdk from 'aws-cdk-lib';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as snsSubscriptions from 'aws-cdk-lib/aws-sns-subscriptions';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import { Construct } from 'constructs';

interface GeofenceStackProps extends cdk.StackProps {
  environment: string;
  vpc?: ec2.IVpc;
  cluster?: ecs.ICluster;
}

export class GeofenceStack extends cdk.Stack {
  public readonly service: ecs.FargateService;
  public readonly loadBalancer: elbv2.ApplicationLoadBalancer;
  public readonly geofenceTable: dynamodb.Table;
  public readonly alertsTable: dynamodb.Table;

  constructor(scope: Construct, id: string, props: GeofenceStackProps) {
    super(scope, id, props);

    const { environment } = props;

    // Create or use existing VPC
    const vpc = props.vpc || new ec2.Vpc(this, 'GeofenceVPC', {
      vpcName: `geofence-vpc-${environment}`,
      maxAzs: 2,
      natGateways: environment === 'prod' ? 2 : 1,
    });

    // Create or use existing ECS cluster
    const cluster = props.cluster || new ecs.Cluster(this, 'GeofenceCluster', {
      clusterName: `geofence-cluster-${environment}`,
      vpc,
      containerInsights: true,
    });

    // DynamoDB table for geofences
    this.geofenceTable = new dynamodb.Table(this, 'GeofenceTable', {
      tableName: `transport-geofences-${environment}`,
      partitionKey: { name: 'id', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
      pointInTimeRecovery: environment === 'prod',
      removalPolicy: environment === 'prod' 
        ? cdk.RemovalPolicy.RETAIN 
        : cdk.RemovalPolicy.DESTROY,
    });

    // Add GSI for querying active geofences
    this.geofenceTable.addGlobalSecondaryIndex({
      indexName: 'ActiveGeofencesIndex',
      partitionKey: { name: 'isActive', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'createdAt', type: dynamodb.AttributeType.STRING },
    });

    // DynamoDB table for alerts
    this.alertsTable = new dynamodb.Table(this, 'AlertsTable', {
      tableName: `transport-alerts-${environment}`,
      partitionKey: { name: 'id', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
      timeToLiveAttribute: 'ttl',
      removalPolicy: environment === 'prod' 
        ? cdk.RemovalPolicy.RETAIN 
        : cdk.RemovalPolicy.DESTROY,
    });

    // Add GSI for querying alerts by vehicle
    this.alertsTable.addGlobalSecondaryIndex({
      indexName: 'VehicleAlertsIndex',
      partitionKey: { name: 'vehicleId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'timestamp', type: dynamodb.AttributeType.STRING },
    });

    // Add GSI for querying alerts by priority
    this.alertsTable.addGlobalSecondaryIndex({
      indexName: 'PriorityAlertsIndex',
      partitionKey: { name: 'priority', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'timestamp', type: dynamodb.AttributeType.STRING },
    });

    // SNS topic for high priority alerts
    const highPriorityTopic = new sns.Topic(this, 'HighPriorityAlerts', {
      topicName: `transport-high-priority-alerts-${environment}`,
      displayName: 'Transport High Priority Alerts',
    });

    // Add email subscription for high priority alerts
    if (process.env.ALERT_EMAIL) {
      highPriorityTopic.addSubscription(
        new snsSubscriptions.EmailSubscription(process.env.ALERT_EMAIL)
      );
    }

    // Create task definition
    const taskDefinition = new ecs.FargateTaskDefinition(this, 'GeofenceTaskDef', {
      family: `geofence-service-${environment}`,
      memoryLimitMiB: environment === 'prod' ? 1024 : 512,
      cpu: environment === 'prod' ? 512 : 256,
    });

    // Add container
    const container = taskDefinition.addContainer('geofence-service', {
      image: ecs.ContainerImage.fromAsset('../services/geofence-alerts'),
      logging: ecs.LogDrivers.awsLogs({
        streamPrefix: 'geofence-service',
        logGroup: new logs.LogGroup(this, 'GeofenceLogGroup', {
          logGroupName: `/ecs/geofence-service-${environment}`,
          retention: logs.RetentionDays.ONE_WEEK,
          removalPolicy: cdk.RemovalPolicy.DESTROY,
        }),
      }),
      environment: {
        NODE_ENV: environment,
        AWS_REGION: this.region,
        GEOFENCE_TABLE_NAME: this.geofenceTable.tableName,
        ALERTS_TABLE_NAME: this.alertsTable.tableName,
        LOCATION_TABLE_NAME: `transport-locations-${environment}`,
        HIGH_PRIORITY_SNS_TOPIC: highPriorityTopic.topicArn,
        PORT: '3001'
      },
      healthCheck: {
        command: ['CMD-SHELL', 'curl -f http://localhost:3001/health || exit 1'],
        interval: cdk.Duration.seconds(30),
        timeout: cdk.Duration.seconds(10),
        retries: 3,
        startPeriod: cdk.Duration.seconds(60),
      },
    });

    // Add port mappings
    container.addPortMappings({
      containerPort: 3001,
      protocol: ecs.Protocol.TCP,
    });

    // Grant permissions to DynamoDB tables
    this.geofenceTable.grantReadWriteData(taskDefinition.taskRole);
    this.alertsTable.grantReadWriteData(taskDefinition.taskRole);

    // Grant permission to read from location table (assuming it exists)
    taskDefinition.addToTaskRolePolicy(new iam.PolicyStatement({
      actions: [
        'dynamodb:Query',
        'dynamodb:GetItem',
        'dynamodb:Scan'
      ],
      resources: [
        `arn:aws:dynamodb:${this.region}:${this.account}:table/transport-locations-${environment}`,
        `arn:aws:dynamodb:${this.region}:${this.account}:table/transport-locations-${environment}/index/*`
      ],
    }));

    // Grant SNS permissions
    highPriorityTopic.grantPublish(taskDefinition.taskRole);

    // Add CloudWatch permissions
    taskDefinition.addToTaskRolePolicy(new iam.PolicyStatement({
      actions: [
        'cloudwatch:PutMetricData'
      ],
      resources: ['*'],
    }));

    // Create ALB
    this.loadBalancer = new elbv2.ApplicationLoadBalancer(this, 'GeofenceALB', {
      loadBalancerName: `geofence-alb-${environment}`,
      vpc,
      internetFacing: true,
    });

    // Create Fargate service
    this.service = new ecs.FargateService(this, 'GeofenceService', {
      serviceName: `geofence-service-${environment}`,
      cluster,
      taskDefinition,
      desiredCount: environment === 'prod' ? 2 : 1,
      assignPublicIp: true,
      healthCheckGracePeriod: cdk.Duration.seconds(120),
    });

    // Configure auto-scaling
    const scaling = this.service.autoScaleTaskCount({
      minCapacity: environment === 'prod' ? 2 : 1,
      maxCapacity: environment === 'prod' ? 6 : 3,
    });

    scaling.scaleOnCpuUtilization('CpuScaling', {
      targetUtilizationPercent: 70,
      scaleInCooldown: cdk.Duration.seconds(300),
      scaleOutCooldown: cdk.Duration.seconds(300),
    });

    // Scale on memory utilization
    scaling.scaleOnMemoryUtilization('MemoryScaling', {
      targetUtilizationPercent: 80,
    });

    // Create target group for HTTP traffic
    const httpTargetGroup = new elbv2.ApplicationTargetGroup(this, 'GeofenceHttpTargetGroup', {
      vpc,
      port: 3001,
      protocol: elbv2.ApplicationProtocol.HTTP,
      targets: [this.service],
      healthCheck: {
        path: '/health',
        interval: cdk.Duration.seconds(60),
        timeout: cdk.Duration.seconds(10),
        healthyThresholdCount: 2,
        unhealthyThresholdCount: 5,
        healthyHttpCodes: '200',
      },
    });

    // Add HTTP listener
    const httpListener = this.loadBalancer.addListener('GeofenceHttpListener', {
      port: 80,
      protocol: elbv2.ApplicationProtocol.HTTP,
      defaultTargetGroups: [httpTargetGroup],
    });

    // Create target group for WebSocket traffic (different path)
    const wsTargetGroup = new elbv2.ApplicationTargetGroup(this, 'GeofenceWsTargetGroup', {
      vpc,
      port: 3001,
      protocol: elbv2.ApplicationProtocol.HTTP,
      targets: [this.service],
      healthCheck: {
        path: '/health',
        interval: cdk.Duration.seconds(60),
        timeout: cdk.Duration.seconds(10),
        healthyThresholdCount: 2,
        unhealthyThresholdCount: 5,
      },
    });

    // Add listener rule for WebSocket upgrade requests
    httpListener.addTargetGroups('WebSocketRule', {
      targetGroups: [wsTargetGroup],
      priority: 100,
      conditions: [
        elbv2.ListenerCondition.httpHeader('Upgrade', ['websocket']),
      ],
    });

    // CloudWatch alarms
    new cloudwatch.Alarm(this, 'HighErrorRate', {
      alarmName: `geofence-service-error-rate-${environment}`,
      metric: httpTargetGroup.metricHttpCodeTarget(
        elbv2.HttpCodeTarget.TARGET_5XX_COUNT,
        { period: cdk.Duration.minutes(5) }
      ),
      threshold: 10,
      evaluationPeriods: 2,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    new cloudwatch.Alarm(this, 'HighResponseTime', {
      alarmName: `geofence-service-response-time-${environment}`,
      metric: httpTargetGroup.metricTargetResponseTime(),
      threshold: 2, // 2 seconds
      evaluationPeriods: 3,
    });

    // Outputs
    new cdk.CfnOutput(this, 'LoadBalancerDNS', {
      value: this.loadBalancer.loadBalancerDnsName,
      description: 'Geofence Service Load Balancer DNS',
    });

    new cdk.CfnOutput(this, 'ServiceURL', {
      value: `http://${this.loadBalancer.loadBalancerDnsName}`,
      description: 'Geofence Service URL',
    });

    new cdk.CfnOutput(this, 'WebSocketURL', {
      value: `ws://${this.loadBalancer.loadBalancerDnsName}`,
      description: 'Geofence WebSocket URL',
    });

    new cdk.CfnOutput(this, 'GeofenceTableName', {
      value: this.geofenceTable.tableName,
      description: 'DynamoDB Geofence Table Name',
    });

    new cdk.CfnOutput(this, 'AlertsTableName', {
      value: this.alertsTable.tableName,
      description: 'DynamoDB Alerts Table Name',
    });

    new cdk.CfnOutput(this, 'HighPriorityTopicArn', {
      value: highPriorityTopic.topicArn,
      description: 'SNS Topic ARN for High Priority Alerts',
    });

    // Tags
    cdk.Tags.of(this).add('Service', 'GeofenceAlerts');
    cdk.Tags.of(this).add('Environment', environment);
  }
}