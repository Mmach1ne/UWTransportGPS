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
exports.GeofenceStack = void 0;
const cdk = __importStar(require("aws-cdk-lib"));
const ecs = __importStar(require("aws-cdk-lib/aws-ecs"));
const ec2 = __importStar(require("aws-cdk-lib/aws-ec2"));
const elbv2 = __importStar(require("aws-cdk-lib/aws-elasticloadbalancingv2"));
const dynamodb = __importStar(require("aws-cdk-lib/aws-dynamodb"));
const sns = __importStar(require("aws-cdk-lib/aws-sns"));
const snsSubscriptions = __importStar(require("aws-cdk-lib/aws-sns-subscriptions"));
const iam = __importStar(require("aws-cdk-lib/aws-iam"));
const logs = __importStar(require("aws-cdk-lib/aws-logs"));
const cloudwatch = __importStar(require("aws-cdk-lib/aws-cloudwatch"));
class GeofenceStack extends cdk.Stack {
    constructor(scope, id, props) {
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
            highPriorityTopic.addSubscription(new snsSubscriptions.EmailSubscription(process.env.ALERT_EMAIL));
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
                MAPBOX_API_KEY: process.env.MAPBOX_API_KEY || '',
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
            metric: httpTargetGroup.metricHttpCodeTarget(elbv2.HttpCodeTarget.TARGET_5XX_COUNT, { period: cdk.Duration.minutes(5) }),
            threshold: 10,
            evaluationPeriods: 2,
            treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
        });
        new cloudwatch.Alarm(this, 'HighResponseTime', {
            alarmName: `geofence-service-response-time-${environment}`,
            metric: httpTargetGroup.metricTargetResponseTime(),
            threshold: 2,
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
exports.GeofenceStack = GeofenceStack;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZ2VvZmVuY2Utc3RhY2suanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJnZW9mZW5jZS1zdGFjay50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUFBLGlEQUFtQztBQUNuQyx5REFBMkM7QUFDM0MseURBQTJDO0FBQzNDLDhFQUFnRTtBQUNoRSxtRUFBcUQ7QUFDckQseURBQTJDO0FBQzNDLG9GQUFzRTtBQUN0RSx5REFBMkM7QUFDM0MsMkRBQTZDO0FBQzdDLHVFQUF5RDtBQVN6RCxNQUFhLGFBQWMsU0FBUSxHQUFHLENBQUMsS0FBSztJQU0xQyxZQUFZLEtBQWdCLEVBQUUsRUFBVSxFQUFFLEtBQXlCO1FBQ2pFLEtBQUssQ0FBQyxLQUFLLEVBQUUsRUFBRSxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBRXhCLE1BQU0sRUFBRSxXQUFXLEVBQUUsR0FBRyxLQUFLLENBQUM7UUFFOUIsNkJBQTZCO1FBQzdCLE1BQU0sR0FBRyxHQUFHLEtBQUssQ0FBQyxHQUFHLElBQUksSUFBSSxHQUFHLENBQUMsR0FBRyxDQUFDLElBQUksRUFBRSxhQUFhLEVBQUU7WUFDeEQsT0FBTyxFQUFFLGdCQUFnQixXQUFXLEVBQUU7WUFDdEMsTUFBTSxFQUFFLENBQUM7WUFDVCxXQUFXLEVBQUUsV0FBVyxLQUFLLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1NBQzVDLENBQUMsQ0FBQztRQUVILHFDQUFxQztRQUNyQyxNQUFNLE9BQU8sR0FBRyxLQUFLLENBQUMsT0FBTyxJQUFJLElBQUksR0FBRyxDQUFDLE9BQU8sQ0FBQyxJQUFJLEVBQUUsaUJBQWlCLEVBQUU7WUFDeEUsV0FBVyxFQUFFLG9CQUFvQixXQUFXLEVBQUU7WUFDOUMsR0FBRztZQUNILGlCQUFpQixFQUFFLElBQUk7U0FDeEIsQ0FBQyxDQUFDO1FBRUgsK0JBQStCO1FBQy9CLElBQUksQ0FBQyxhQUFhLEdBQUcsSUFBSSxRQUFR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Q0FBQztRQUVILElBQUksR0FBRyxDQUFDLFNBQVMsQ0FBQyxJQUFJLEVBQUUsaUJBQWlCLEVBQUU7WUFDekMsS0FBSyxFQUFFLElBQUksQ0FBQyxXQUFXLENBQUMsU0FBUztZQUNqQyxXQUFXLEVBQUUsNEJBQTRCO1NBQzFDLENBQUMsQ0FBQztRQUVILElBQUksR0FBRyxDQUFDLFNBQVMsQ0FBQyxJQUFJLEVBQUUsc0JBQXNCLEVBQUU7WUFDOUMsS0FBSyxFQUFFLGlCQUFpQixDQUFDLFFBQVE7WUFDakMsV0FBVyxFQUFFLHdDQUF3QztTQUN0RCxDQUFDLENBQUM7UUFFSCxPQUFPO1FBQ1AsR0FBRyxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFDLENBQUMsR0FBRyxDQUFDLFNBQVMsRUFBRSxnQkFBZ0IsQ0FBQyxDQUFDO1FBQ25ELEdBQUcsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLElBQUksQ0FBQyxDQUFDLEdBQUcsQ0FBQyxhQUFhLEVBQUUsV0FBVyxDQUFDLENBQUM7SUFDcEQsQ0FBQztDQUNGO0FBalNELHNDQWlTQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCAqIGFzIGNkayBmcm9tICdhd3MtY2RrLWxpYic7XHJcbmltcG9ydCAqIGFzIGVjcyBmcm9tICdhd3MtY2RrLWxpYi9hd3MtZWNzJztcclxuaW1wb3J0ICogYXMgZWMyIGZyb20gJ2F3cy1jZGstbGliL2F3cy1lYzInO1xyXG5pbXBvcnQgKiBhcyBlbGJ2MiBmcm9tICdhd3MtY2RrLWxpYi9hd3MtZWxhc3RpY2xvYWRiYWxhbmNpbmd2Mic7XHJcbmltcG9ydCAqIGFzIGR5bmFtb2RiIGZyb20gJ2F3cy1jZGstbGliL2F3cy1keW5hbW9kYic7XHJcbmltcG9ydCAqIGFzIHNucyBmcm9tICdhd3MtY2RrLWxpYi9hd3Mtc25zJztcclxuaW1wb3J0ICogYXMgc25zU3Vic2NyaXB0aW9ucyBmcm9tICdhd3MtY2RrLWxpYi9hd3Mtc25zLXN1YnNjcmlwdGlvbnMnO1xyXG5pbXBvcnQgKiBhcyBpYW0gZnJvbSAnYXdzLWNkay1saWIvYXdzLWlhbSc7XHJcbmltcG9ydCAqIGFzIGxvZ3MgZnJvbSAnYXdzLWNkay1saWIvYXdzLWxvZ3MnO1xyXG5pbXBvcnQgKiBhcyBjbG91ZHdhdGNoIGZyb20gJ2F3cy1jZGstbGliL2F3cy1jbG91ZHdhdGNoJztcclxuaW1wb3J0IHsgQ29uc3RydWN0IH0gZnJvbSAnY29uc3RydWN0cyc7XHJcblxyXG5pbnRlcmZhY2UgR2VvZmVuY2VTdGFja1Byb3BzIGV4dGVuZHMgY2RrLlN0YWNrUHJvcHMge1xyXG4gIGVudmlyb25tZW50OiBzdHJpbmc7XHJcbiAgdnBjPzogZWMyLklWcGM7XHJcbiAgY2x1c3Rlcj86IGVjcy5JQ2x1c3RlcjtcclxufVxyXG5cclxuZXhwb3J0IGNsYXNzIEdlb2ZlbmNlU3RhY2sgZXh0ZW5kcyBjZGsuU3RhY2sge1xyXG4gIHB1YmxpYyByZWFkb25seSBzZXJ2aWNlOiBlY3MuRmFyZ2F0ZVNlcnZpY2U7XHJcbiAgcHVibGljIHJlYWRvbmx5IGxvYWRCYWxhbmNlcjogZWxidjIuQXBwbGljYXRpb25Mb2FkQmFsYW5jZXI7XHJcbiAgcHVibGljIHJlYWRvbmx5IGdlb2ZlbmNlVGFibGU6IGR5bmFtb2RiLlRhYmxlO1xyXG4gIHB1YmxpYyByZWFkb25seSBhbGVydHNUYWJsZTogZHluYW1vZGIuVGFibGU7XHJcblxyXG4gIGNvbnN0cnVjdG9yKHNjb3BlOiBDb25zdHJ1Y3QsIGlkOiBzdHJpbmcsIHByb3BzOiBHZW9mZW5jZVN0YWNrUHJvcHMpIHtcclxuICAgIHN1cGVyKHNjb3BlLCBpZCwgcHJvcHMpO1xyXG5cclxuICAgIGNvbnN0IHsgZW52aXJvbm1lbnQgfSA9IHByb3BzO1xyXG5cclxuICAgIC8vIENyZWF0ZSBvciB1c2UgZXhpc3RpbmcgVlBDXHJcbiAgICBjb25zdCB2cGMgPSBwcm9wcy52cGMgfHwgbmV3IGVjMi5WcGModGhpcywgJ0dlb2ZlbmNlVlBDJywge1xyXG4gICAgICB2cGNOYW1lOiBgZ2VvZmVuY2UtdnBjLSR7ZW52aXJvbm1lbnR9YCxcclxuICAgICAgbWF4QXpzOiAyLFxyXG4gICAgICBuYXRHYXRld2F5czogZW52aXJvbm1lbnQgPT09ICdwcm9kJyA/IDIgOiAxLFxyXG4gICAgfSk7XHJcblxyXG4gICAgLy8gQ3JlYXRlIG9yIHVzZSBleGlzdGluZyBFQ1MgY2x1c3RlclxyXG4gICAgY29uc3QgY2x1c3RlciA9IHByb3BzLmNsdXN0ZXIgfHwgbmV3IGVjcy5DbHVzdGVyKHRoaXMsICdHZW9mZW5jZUNsdXN0ZXInLCB7XHJcbiAgICAgIGNsdXN0ZXJOYW1lOiBgZ2VvZmVuY2UtY2x1c3Rlci0ke2Vudmlyb25tZW50fWAsXHJcbiAgICAgIHZwYyxcclxuICAgICAgY29udGFpbmVySW5zaWdodHM6IHRydWUsXHJcbiAgICB9KTtcclxuXHJcbiAgICAvLyBEeW5hbW9EQiB0YWJsZSBmb3IgZ2VvZmVuY2VzXHJcbiAgICB0aGlzLmdlb2ZlbmNlVGFibGUgPSBuZXcgZHluYW1vZGIuVGFibGUodGhpcywgJ0dlb2ZlbmNlVGFibGUnLCB7XHJcbiAgICAgIHRhYmxlTmFtZTogYHRyYW5zcG9ydC1nZW9mZW5jZXMtJHtlbnZpcm9ubWVudH1gLFxyXG4gICAgICBwYXJ0aXRpb25LZXk6IHsgbmFtZTogJ2lkJywgdHlwZTogZHluYW1vZGIuQXR0cmlidXRlVHlwZS5TVFJJTkcgfSxcclxuICAgICAgYmlsbGluZ01vZGU6IGR5bmFtb2RiLkJpbGxpbmdNb2RlLlBBWV9QRVJfUkVRVUVTVCxcclxuICAgICAgZW5jcnlwdGlvbjogZHluYW1vZGIuVGFibGVFbmNyeXB0aW9uLkFXU19NQU5BR0VELFxyXG4gICAgICBwb2ludEluVGltZVJlY292ZXJ5OiBlbnZpcm9ubWVudCA9PT0gJ3Byb2QnLFxyXG4gICAgICByZW1vdmFsUG9saWN5OiBlbnZpcm9ubWVudCA9PT0gJ3Byb2QnIFxyXG4gICAgICAgID8gY2RrLlJlbW92YWxQb2xpY3kuUkVUQUlOIFxyXG4gICAgICAgIDogY2RrLlJlbW92YWxQb2xpY3kuREVTVFJPWSxcclxuICAgIH0pO1xyXG5cclxuICAgIC8vIEFkZCBHU0kgZm9yIHF1ZXJ5aW5nIGFjdGl2ZSBnZW9mZW5jZXNcclxuICAgIHRoaXMuZ2VvZmVuY2VUYWJsZS5hZGRHbG9iYWxTZWNvbmRhcnlJbmRleCh7XHJcbiAgICAgIGluZGV4TmFtZTogJ0FjdGl2ZUdlb2ZlbmNlc0luZGV4JyxcclxuICAgICAgcGFydGl0aW9uS2V5OiB7IG5hbWU6ICdpc0FjdGl2ZScsIHR5cGU6IGR5bmFtb2RiLkF0dHJpYnV0ZVR5cGUuU1RSSU5HIH0sXHJcbiAgICAgIHNvcnRLZXk6IHsgbmFtZTogJ2NyZWF0ZWRBdCcsIHR5cGU6IGR5bmFtb2RiLkF0dHJpYnV0ZVR5cGUuU1RSSU5HIH0sXHJcbiAgICB9KTtcclxuXHJcbiAgICAvLyBEeW5hbW9EQiB0YWJsZSBmb3IgYWxlcnRzXHJcbiAgICB0aGlzLmFsZXJ0c1RhYmxlID0gbmV3IGR5bmFtb2RiLlRhYmxlKHRoaXMsICdBbGVydHNUYWJsZScsIHtcclxuICAgICAgdGFibGVOYW1lOiBgdHJhbnNwb3J0LWFsZXJ0cy0ke2Vudmlyb25tZW50fWAsXHJcbiAgICAgIHBhcnRpdGlvbktleTogeyBuYW1lOiAnaWQnLCB0eXBlOiBkeW5hbW9kYi5BdHRyaWJ1dGVUeXBlLlNUUklORyB9LFxyXG4gICAgICBiaWxsaW5nTW9kZTogZHluYW1vZGIuQmlsbGluZ01vZGUuUEFZX1BFUl9SRVFVRVNULFxyXG4gICAgICBlbmNyeXB0aW9uOiBkeW5hbW9kYi5UYWJsZUVuY3J5cHRpb24uQVdTX01BTkFHRUQsXHJcbiAgICAgIHRpbWVUb0xpdmVBdHRyaWJ1dGU6ICd0dGwnLFxyXG4gICAgICByZW1vdmFsUG9saWN5OiBlbnZpcm9ubWVudCA9PT0gJ3Byb2QnIFxyXG4gICAgICAgID8gY2RrLlJlbW92YWxQb2xpY3kuUkVUQUlOIFxyXG4gICAgICAgIDogY2RrLlJlbW92YWxQb2xpY3kuREVTVFJPWSxcclxuICAgIH0pO1xyXG5cclxuICAgIC8vIEFkZCBHU0kgZm9yIHF1ZXJ5aW5nIGFsZXJ0cyBieSB2ZWhpY2xlXHJcbiAgICB0aGlzLmFsZXJ0c1RhYmxlLmFkZEdsb2JhbFNlY29uZGFyeUluZGV4KHtcclxuICAgICAgaW5kZXhOYW1lOiAnVmVoaWNsZUFsZXJ0c0luZGV4JyxcclxuICAgICAgcGFydGl0aW9uS2V5OiB7IG5hbWU6ICd2ZWhpY2xlSWQnLCB0eXBlOiBkeW5hbW9kYi5BdHRyaWJ1dGVUeXBlLlNUUklORyB9LFxyXG4gICAgICBzb3J0S2V5OiB7IG5hbWU6ICd0aW1lc3RhbXAnLCB0eXBlOiBkeW5hbW9kYi5BdHRyaWJ1dGVUeXBlLlNUUklORyB9LFxyXG4gICAgfSk7XHJcblxyXG4gICAgLy8gQWRkIEdTSSBmb3IgcXVlcnlpbmcgYWxlcnRzIGJ5IHByaW9yaXR5XHJcbiAgICB0aGlzLmFsZXJ0c1RhYmxlLmFkZEdsb2JhbFNlY29uZGFyeUluZGV4KHtcclxuICAgICAgaW5kZXhOYW1lOiAnUHJpb3JpdHlBbGVydHNJbmRleCcsXHJcbiAgICAgIHBhcnRpdGlvbktleTogeyBuYW1lOiAncHJpb3JpdHknLCB0eXBlOiBkeW5hbW9kYi5BdHRyaWJ1dGVUeXBlLlNUUklORyB9LFxyXG4gICAgICBzb3J0S2V5OiB7IG5hbWU6ICd0aW1lc3RhbXAnLCB0eXBlOiBkeW5hbW9kYi5BdHRyaWJ1dGVUeXBlLlNUUklORyB9LFxyXG4gICAgfSk7XHJcblxyXG4gICAgLy8gU05TIHRvcGljIGZvciBoaWdoIHByaW9yaXR5IGFsZXJ0c1xyXG4gICAgY29uc3QgaGlnaFByaW9yaXR5VG9waWMgPSBuZXcgc25zLlRvcGljKHRoaXMsICdIaWdoUHJpb3JpdHlBbGVydHMnLCB7XHJcbiAgICAgIHRvcGljTmFtZTogYHRyYW5zcG9ydC1oaWdoLXByaW9yaXR5LWFsZXJ0cy0ke2Vudmlyb25tZW50fWAsXHJcbiAgICAgIGRpc3BsYXlOYW1lOiAnVHJhbnNwb3J0IEhpZ2ggUHJpb3JpdHkgQWxlcnRzJyxcclxuICAgIH0pO1xyXG5cclxuICAgIC8vIEFkZCBlbWFpbCBzdWJzY3JpcHRpb24gZm9yIGhpZ2ggcHJpb3JpdHkgYWxlcnRzXHJcbiAgICBpZiAocHJvY2Vzcy5lbnYuQUxFUlRfRU1BSUwpIHtcclxuICAgICAgaGlnaFByaW9yaXR5VG9waWMuYWRkU3Vic2NyaXB0aW9uKFxyXG4gICAgICAgIG5ldyBzbnNTdWJzY3JpcHRpb25zLkVtYWlsU3Vic2NyaXB0aW9uKHByb2Nlc3MuZW52LkFMRVJUX0VNQUlMKVxyXG4gICAgICApO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIENyZWF0ZSB0YXNrIGRlZmluaXRpb25cclxuICAgIGNvbnN0IHRhc2tEZWZpbml0aW9uID0gbmV3IGVjcy5GYXJnYXRlVGFza0RlZmluaXRpb24odGhpcywgJ0dlb2ZlbmNlVGFza0RlZicsIHtcclxuICAgICAgZmFtaWx5OiBgZ2VvZmVuY2Utc2VydmljZS0ke2Vudmlyb25tZW50fWAsXHJcbiAgICAgIG1lbW9yeUxpbWl0TWlCOiBlbnZpcm9ubWVudCA9PT0gJ3Byb2QnID8gMTAyNCA6IDUxMixcclxuICAgICAgY3B1OiBlbnZpcm9ubWVudCA9PT0gJ3Byb2QnID8gNTEyIDogMjU2LFxyXG4gICAgfSk7XHJcblxyXG4gICAgLy8gQWRkIGNvbnRhaW5lclxyXG4gICAgY29uc3QgY29udGFpbmVyID0gdGFza0RlZmluaXRpb24uYWRkQ29udGFpbmVyKCdnZW9mZW5jZS1zZXJ2aWNlJywge1xyXG4gICAgICBpbWFnZTogZWNzLkNvbnRhaW5lckltYWdlLmZyb21Bc3NldCgnLi4vc2VydmljZXMvZ2VvZmVuY2UtYWxlcnRzJyksXHJcbiAgICAgIGxvZ2dpbmc6IGVjcy5Mb2dEcml2ZXJzLmF3c0xvZ3Moe1xyXG4gICAgICAgIHN0cmVhbVByZWZpeDogJ2dlb2ZlbmNlLXNlcnZpY2UnLFxyXG4gICAgICAgIGxvZ0dyb3VwOiBuZXcgbG9ncy5Mb2dHcm91cCh0aGlzLCAnR2VvZmVuY2VMb2dHcm91cCcsIHtcclxuICAgICAgICAgIGxvZ0dyb3VwTmFtZTogYC9lY3MvZ2VvZmVuY2Utc2VydmljZS0ke2Vudmlyb25tZW50fWAsXHJcbiAgICAgICAgICByZXRlbnRpb246IGxvZ3MuUmV0ZW50aW9uRGF5cy5PTkVfV0VFSyxcclxuICAgICAgICAgIHJlbW92YWxQb2xpY3k6IGNkay5SZW1vdmFsUG9saWN5LkRFU1RST1ksXHJcbiAgICAgICAgfSksXHJcbiAgICAgIH0pLFxyXG4gICAgICBlbnZpcm9ubWVudDoge1xyXG4gICAgICAgIE5PREVfRU5WOiBlbnZpcm9ubWVudCxcclxuICAgICAgICBBV1NfUkVHSU9OOiB0aGlzLnJlZ2lvbixcclxuICAgICAgICBHRU9GRU5DRV9UQUJMRV9OQU1FOiB0aGlzLmdlb2ZlbmNlVGFibGUudGFibGVOYW1lLFxyXG4gICAgICAgIEFMRVJUU19UQUJMRV9OQU1FOiB0aGlzLmFsZXJ0c1RhYmxlLnRhYmxlTmFtZSxcclxuICAgICAgICBMT0NBVElPTl9UQUJMRV9OQU1FOiBgdHJhbnNwb3J0LWxvY2F0aW9ucy0ke2Vudmlyb25tZW50fWAsXHJcbiAgICAgICAgSElHSF9QUklPUklUWV9TTlNfVE9QSUM6IGhpZ2hQcmlvcml0eVRvcGljLnRvcGljQXJuLFxyXG4gICAgICAgIE1BUEJPWF9BUElfS0VZOiBwcm9jZXNzLmVudi5NQVBCT1hfQVBJX0tFWSB8fCAnJyxcclxuICAgICAgICBQT1JUOiAnMzAwMSdcclxuICAgICAgfSxcclxuICAgICAgaGVhbHRoQ2hlY2s6IHtcclxuICAgICAgICBjb21tYW5kOiBbJ0NNRC1TSEVMTCcsICdjdXJsIC1mIGh0dHA6Ly9sb2NhbGhvc3Q6MzAwMS9oZWFsdGggfHwgZXhpdCAxJ10sXHJcbiAgICAgICAgaW50ZXJ2YWw6IGNkay5EdXJhdGlvbi5zZWNvbmRzKDMwKSxcclxuICAgICAgICB0aW1lb3V0OiBjZGsuRHVyYXRpb24uc2Vjb25kcygxMCksXHJcbiAgICAgICAgcmV0cmllczogMyxcclxuICAgICAgICBzdGFydFBlcmlvZDogY2RrLkR1cmF0aW9uLnNlY29uZHMoNjApLFxyXG4gICAgICB9LFxyXG4gICAgfSk7XHJcblxyXG4gICAgLy8gQWRkIHBvcnQgbWFwcGluZ3NcclxuICAgIGNvbnRhaW5lci5hZGRQb3J0TWFwcGluZ3Moe1xyXG4gICAgICBjb250YWluZXJQb3J0OiAzMDAxLFxyXG4gICAgICBwcm90b2NvbDogZWNzLlByb3RvY29sLlRDUCxcclxuICAgIH0pO1xyXG5cclxuICAgIC8vIEdyYW50IHBlcm1pc3Npb25zIHRvIER5bmFtb0RCIHRhYmxlc1xyXG4gICAgdGhpcy5nZW9mZW5jZVRhYmxlLmdyYW50UmVhZFdyaXRlRGF0YSh0YXNrRGVmaW5pdGlvbi50YXNrUm9sZSk7XHJcbiAgICB0aGlzLmFsZXJ0c1RhYmxlLmdyYW50UmVhZFdyaXRlRGF0YSh0YXNrRGVmaW5pdGlvbi50YXNrUm9sZSk7XHJcblxyXG4gICAgLy8gR3JhbnQgcGVybWlzc2lvbiB0byByZWFkIGZyb20gbG9jYXRpb24gdGFibGUgKGFzc3VtaW5nIGl0IGV4aXN0cylcclxuICAgIHRhc2tEZWZpbml0aW9uLmFkZFRvVGFza1JvbGVQb2xpY3kobmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xyXG4gICAgICBhY3Rpb25zOiBbXHJcbiAgICAgICAgJ2R5bmFtb2RiOlF1ZXJ5JyxcclxuICAgICAgICAnZHluYW1vZGI6R2V0SXRlbScsXHJcbiAgICAgICAgJ2R5bmFtb2RiOlNjYW4nXHJcbiAgICAgIF0sXHJcbiAgICAgIHJlc291cmNlczogW1xyXG4gICAgICAgIGBhcm46YXdzOmR5bmFtb2RiOiR7dGhpcy5yZWdpb259OiR7dGhpcy5hY2NvdW50fTp0YWJsZS90cmFuc3BvcnQtbG9jYXRpb25zLSR7ZW52aXJvbm1lbnR9YCxcclxuICAgICAgICBgYXJuOmF3czpkeW5hbW9kYjoke3RoaXMucmVnaW9ufToke3RoaXMuYWNjb3VudH06dGFibGUvdHJhbnNwb3J0LWxvY2F0aW9ucy0ke2Vudmlyb25tZW50fS9pbmRleC8qYFxyXG4gICAgICBdLFxyXG4gICAgfSkpO1xyXG5cclxuICAgIC8vIEdyYW50IFNOUyBwZXJtaXNzaW9uc1xyXG4gICAgaGlnaFByaW9yaXR5VG9waWMuZ3JhbnRQdWJsaXNoKHRhc2tEZWZpbml0aW9uLnRhc2tSb2xlKTtcclxuXHJcbiAgICAvLyBBZGQgQ2xvdWRXYXRjaCBwZXJtaXNzaW9uc1xyXG4gICAgdGFza0RlZmluaXRpb24uYWRkVG9UYXNrUm9sZVBvbGljeShuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XHJcbiAgICAgIGFjdGlvbnM6IFtcclxuICAgICAgICAnY2xvdWR3YXRjaDpQdXRNZXRyaWNEYXRhJ1xyXG4gICAgICBdLFxyXG4gICAgICByZXNvdXJjZXM6IFsnKiddLFxyXG4gICAgfSkpO1xyXG5cclxuICAgIC8vIENyZWF0ZSBBTEJcclxuICAgIHRoaXMubG9hZEJhbGFuY2VyID0gbmV3IGVsYnYyLkFwcGxpY2F0aW9uTG9hZEJhbGFuY2VyKHRoaXMsICdHZW9mZW5jZUFMQicsIHtcclxuICAgICAgbG9hZEJhbGFuY2VyTmFtZTogYGdlb2ZlbmNlLWFsYi0ke2Vudmlyb25tZW50fWAsXHJcbiAgICAgIHZwYyxcclxuICAgICAgaW50ZXJuZXRGYWNpbmc6IHRydWUsXHJcbiAgICB9KTtcclxuXHJcbiAgICAvLyBDcmVhdGUgRmFyZ2F0ZSBzZXJ2aWNlXHJcbiAgICB0aGlzLnNlcnZpY2UgPSBuZXcgZWNzLkZhcmdhdGVTZXJ2aWNlKHRoaXMsICdHZW9mZW5jZVNlcnZpY2UnLCB7XHJcbiAgICAgIHNlcnZpY2VOYW1lOiBgZ2VvZmVuY2Utc2VydmljZS0ke2Vudmlyb25tZW50fWAsXHJcbiAgICAgIGNsdXN0ZXIsXHJcbiAgICAgIHRhc2tEZWZpbml0aW9uLFxyXG4gICAgICBkZXNpcmVkQ291bnQ6IGVudmlyb25tZW50ID09PSAncHJvZCcgPyAyIDogMSxcclxuICAgICAgYXNzaWduUHVibGljSXA6IHRydWUsXHJcbiAgICAgIGhlYWx0aENoZWNrR3JhY2VQZXJpb2Q6IGNkay5EdXJhdGlvbi5zZWNvbmRzKDEyMCksXHJcbiAgICB9KTtcclxuXHJcbiAgICAvLyBDb25maWd1cmUgYXV0by1zY2FsaW5nXHJcbiAgICBjb25zdCBzY2FsaW5nID0gdGhpcy5zZXJ2aWNlLmF1dG9TY2FsZVRhc2tDb3VudCh7XHJcbiAgICAgIG1pbkNhcGFjaXR5OiBlbnZpcm9ubWVudCA9PT0gJ3Byb2QnID8gMiA6IDEsXHJcbiAgICAgIG1heENhcGFjaXR5OiBlbnZpcm9ubWVudCA9PT0gJ3Byb2QnID8gNiA6IDMsXHJcbiAgICB9KTtcclxuXHJcbiAgICBzY2FsaW5nLnNjYWxlT25DcHVVdGlsaXphdGlvbignQ3B1U2NhbGluZycsIHtcclxuICAgICAgdGFyZ2V0VXRpbGl6YXRpb25QZXJjZW50OiA3MCxcclxuICAgICAgc2NhbGVJbkNvb2xkb3duOiBjZGsuRHVyYXRpb24uc2Vjb25kcygzMDApLFxyXG4gICAgICBzY2FsZU91dENvb2xkb3duOiBjZGsuRHVyYXRpb24uc2Vjb25kcygzMDApLFxyXG4gICAgfSk7XHJcblxyXG4gICAgLy8gU2NhbGUgb24gbWVtb3J5IHV0aWxpemF0aW9uXHJcbiAgICBzY2FsaW5nLnNjYWxlT25NZW1vcnlVdGlsaXphdGlvbignTWVtb3J5U2NhbGluZycsIHtcclxuICAgICAgdGFyZ2V0VXRpbGl6YXRpb25QZXJjZW50OiA4MCxcclxuICAgIH0pO1xyXG5cclxuICAgIC8vIENyZWF0ZSB0YXJnZXQgZ3JvdXAgZm9yIEhUVFAgdHJhZmZpY1xyXG4gICAgY29uc3QgaHR0cFRhcmdldEdyb3VwID0gbmV3IGVsYnYyLkFwcGxpY2F0aW9uVGFyZ2V0R3JvdXAodGhpcywgJ0dlb2ZlbmNlSHR0cFRhcmdldEdyb3VwJywge1xyXG4gICAgICB2cGMsXHJcbiAgICAgIHBvcnQ6IDMwMDEsXHJcbiAgICAgIHByb3RvY29sOiBlbGJ2Mi5BcHBsaWNhdGlvblByb3RvY29sLkhUVFAsXHJcbiAgICAgIHRhcmdldHM6IFt0aGlzLnNlcnZpY2VdLFxyXG4gICAgICBoZWFsdGhDaGVjazoge1xyXG4gICAgICAgIHBhdGg6ICcvaGVhbHRoJyxcclxuICAgICAgICBpbnRlcnZhbDogY2RrLkR1cmF0aW9uLnNlY29uZHMoNjApLFxyXG4gICAgICAgIHRpbWVvdXQ6IGNkay5EdXJhdGlvbi5zZWNvbmRzKDEwKSxcclxuICAgICAgICBoZWFsdGh5VGhyZXNob2xkQ291bnQ6IDIsXHJcbiAgICAgICAgdW5oZWFsdGh5VGhyZXNob2xkQ291bnQ6IDUsXHJcbiAgICAgICAgaGVhbHRoeUh0dHBDb2RlczogJzIwMCcsXHJcbiAgICAgIH0sXHJcbiAgICB9KTtcclxuXHJcbiAgICAvLyBBZGQgSFRUUCBsaXN0ZW5lclxyXG4gICAgY29uc3QgaHR0cExpc3RlbmVyID0gdGhpcy5sb2FkQmFsYW5jZXIuYWRkTGlzdGVuZXIoJ0dlb2ZlbmNlSHR0cExpc3RlbmVyJywge1xyXG4gICAgICBwb3J0OiA4MCxcclxuICAgICAgcHJvdG9jb2w6IGVsYnYyLkFwcGxpY2F0aW9uUHJvdG9jb2wuSFRUUCxcclxuICAgICAgZGVmYXVsdFRhcmdldEdyb3VwczogW2h0dHBUYXJnZXRHcm91cF0sXHJcbiAgICB9KTtcclxuXHJcbiAgICAvLyBDcmVhdGUgdGFyZ2V0IGdyb3VwIGZvciBXZWJTb2NrZXQgdHJhZmZpYyAoZGlmZmVyZW50IHBhdGgpXHJcbiAgICBjb25zdCB3c1RhcmdldEdyb3VwID0gbmV3IGVsYnYyLkFwcGxpY2F0aW9uVGFyZ2V0R3JvdXAodGhpcywgJ0dlb2ZlbmNlV3NUYXJnZXRHcm91cCcsIHtcclxuICAgICAgdnBjLFxyXG4gICAgICBwb3J0OiAzMDAxLFxyXG4gICAgICBwcm90b2NvbDogZWxidjIuQXBwbGljYXRpb25Qcm90b2NvbC5IVFRQLFxyXG4gICAgICB0YXJnZXRzOiBbdGhpcy5zZXJ2aWNlXSxcclxuICAgICAgaGVhbHRoQ2hlY2s6IHtcclxuICAgICAgICBwYXRoOiAnL2hlYWx0aCcsXHJcbiAgICAgICAgaW50ZXJ2YWw6IGNkay5EdXJhdGlvbi5zZWNvbmRzKDYwKSxcclxuICAgICAgICB0aW1lb3V0OiBjZGsuRHVyYXRpb24uc2Vjb25kcygxMCksXHJcbiAgICAgICAgaGVhbHRoeVRocmVzaG9sZENvdW50OiAyLFxyXG4gICAgICAgIHVuaGVhbHRoeVRocmVzaG9sZENvdW50OiA1LFxyXG4gICAgICB9LFxyXG4gICAgfSk7XHJcblxyXG4gICAgLy8gQWRkIGxpc3RlbmVyIHJ1bGUgZm9yIFdlYlNvY2tldCB1cGdyYWRlIHJlcXVlc3RzXHJcbiAgICBodHRwTGlzdGVuZXIuYWRkVGFyZ2V0R3JvdXBzKCdXZWJTb2NrZXRSdWxlJywge1xyXG4gICAgICB0YXJnZXRHcm91cHM6IFt3c1RhcmdldEdyb3VwXSxcclxuICAgICAgcHJpb3JpdHk6IDEwMCxcclxuICAgICAgY29uZGl0aW9uczogW1xyXG4gICAgICAgIGVsYnYyLkxpc3RlbmVyQ29uZGl0aW9uLmh0dHBIZWFkZXIoJ1VwZ3JhZGUnLCBbJ3dlYnNvY2tldCddKSxcclxuICAgICAgXSxcclxuICAgIH0pO1xyXG5cclxuICAgIC8vIENsb3VkV2F0Y2ggYWxhcm1zXHJcbiAgICBuZXcgY2xvdWR3YXRjaC5BbGFybSh0aGlzLCAnSGlnaEVycm9yUmF0ZScsIHtcclxuICAgICAgYWxhcm1OYW1lOiBgZ2VvZmVuY2Utc2VydmljZS1lcnJvci1yYXRlLSR7ZW52aXJvbm1lbnR9YCxcclxuICAgICAgbWV0cmljOiBodHRwVGFyZ2V0R3JvdXAubWV0cmljSHR0cENvZGVUYXJnZXQoXHJcbiAgICAgICAgZWxidjIuSHR0cENvZGVUYXJnZXQuVEFSR0VUXzVYWF9DT1VOVCxcclxuICAgICAgICB7IHBlcmlvZDogY2RrLkR1cmF0aW9uLm1pbnV0ZXMoNSkgfVxyXG4gICAgICApLFxyXG4gICAgICB0aHJlc2hvbGQ6IDEwLFxyXG4gICAgICBldmFsdWF0aW9uUGVyaW9kczogMixcclxuICAgICAgdHJlYXRNaXNzaW5nRGF0YTogY2xvdWR3YXRjaC5UcmVhdE1pc3NpbmdEYXRhLk5PVF9CUkVBQ0hJTkcsXHJcbiAgICB9KTtcclxuXHJcbiAgICBuZXcgY2xvdWR3YXRjaC5BbGFybSh0aGlzLCAnSGlnaFJlc3BvbnNlVGltZScsIHtcclxuICAgICAgYWxhcm1OYW1lOiBgZ2VvZmVuY2Utc2VydmljZS1yZXNwb25zZS10aW1lLSR7ZW52aXJvbm1lbnR9YCxcclxuICAgICAgbWV0cmljOiBodHRwVGFyZ2V0R3JvdXAubWV0cmljVGFyZ2V0UmVzcG9uc2VUaW1lKCksXHJcbiAgICAgIHRocmVzaG9sZDogMiwgLy8gMiBzZWNvbmRzXHJcbiAgICAgIGV2YWx1YXRpb25QZXJpb2RzOiAzLFxyXG4gICAgfSk7XHJcblxyXG4gICAgLy8gT3V0cHV0c1xyXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ0xvYWRCYWxhbmNlckROUycsIHtcclxuICAgICAgdmFsdWU6IHRoaXMubG9hZEJhbGFuY2VyLmxvYWRCYWxhbmNlckRuc05hbWUsXHJcbiAgICAgIGRlc2NyaXB0aW9uOiAnR2VvZmVuY2UgU2VydmljZSBMb2FkIEJhbGFuY2VyIEROUycsXHJcbiAgICB9KTtcclxuXHJcbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnU2VydmljZVVSTCcsIHtcclxuICAgICAgdmFsdWU6IGBodHRwOi8vJHt0aGlzLmxvYWRCYWxhbmNlci5sb2FkQmFsYW5jZXJEbnNOYW1lfWAsXHJcbiAgICAgIGRlc2NyaXB0aW9uOiAnR2VvZmVuY2UgU2VydmljZSBVUkwnLFxyXG4gICAgfSk7XHJcblxyXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ1dlYlNvY2tldFVSTCcsIHtcclxuICAgICAgdmFsdWU6IGB3czovLyR7dGhpcy5sb2FkQmFsYW5jZXIubG9hZEJhbGFuY2VyRG5zTmFtZX1gLFxyXG4gICAgICBkZXNjcmlwdGlvbjogJ0dlb2ZlbmNlIFdlYlNvY2tldCBVUkwnLFxyXG4gICAgfSk7XHJcblxyXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ0dlb2ZlbmNlVGFibGVOYW1lJywge1xyXG4gICAgICB2YWx1ZTogdGhpcy5nZW9mZW5jZVRhYmxlLnRhYmxlTmFtZSxcclxuICAgICAgZGVzY3JpcHRpb246ICdEeW5hbW9EQiBHZW9mZW5jZSBUYWJsZSBOYW1lJyxcclxuICAgIH0pO1xyXG5cclxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdBbGVydHNUYWJsZU5hbWUnLCB7XHJcbiAgICAgIHZhbHVlOiB0aGlzLmFsZXJ0c1RhYmxlLnRhYmxlTmFtZSxcclxuICAgICAgZGVzY3JpcHRpb246ICdEeW5hbW9EQiBBbGVydHMgVGFibGUgTmFtZScsXHJcbiAgICB9KTtcclxuXHJcbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnSGlnaFByaW9yaXR5VG9waWNBcm4nLCB7XHJcbiAgICAgIHZhbHVlOiBoaWdoUHJpb3JpdHlUb3BpYy50b3BpY0FybixcclxuICAgICAgZGVzY3JpcHRpb246ICdTTlMgVG9waWMgQVJOIGZvciBIaWdoIFByaW9yaXR5IEFsZXJ0cycsXHJcbiAgICB9KTtcclxuXHJcbiAgICAvLyBUYWdzXHJcbiAgICBjZGsuVGFncy5vZih0aGlzKS5hZGQoJ1NlcnZpY2UnLCAnR2VvZmVuY2VBbGVydHMnKTtcclxuICAgIGNkay5UYWdzLm9mKHRoaXMpLmFkZCgnRW52aXJvbm1lbnQnLCBlbnZpcm9ubWVudCk7XHJcbiAgfVxyXG59Il19