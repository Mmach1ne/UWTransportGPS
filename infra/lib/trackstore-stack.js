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
exports.TrackStoreStack = void 0;
const cdk = __importStar(require("aws-cdk-lib"));
const ecs = __importStar(require("aws-cdk-lib/aws-ecs"));
const ec2 = __importStar(require("aws-cdk-lib/aws-ec2"));
const iam = __importStar(require("aws-cdk-lib/aws-iam"));
const logs = __importStar(require("aws-cdk-lib/aws-logs"));
const elbv2 = __importStar(require("aws-cdk-lib/aws-elasticloadbalancingv2"));
class TrackStoreStack extends cdk.Stack {
    constructor(scope, id, props) {
        super(scope, id, props);
        const { environment, kinesisStream, deviceTable, locationTable } = props;
        // Create VPC (or use existing) - expose as public property
        this.vpc = new ec2.Vpc(this, 'TrackStoreVPC', {
            vpcName: `trackstore-vpc-${environment}`,
            maxAzs: 2,
            natGateways: environment === 'prod' ? 2 : 1,
        });
        // Create ECS Cluster - expose as public property
        this.cluster = new ecs.Cluster(this, 'TrackStoreCluster', {
            clusterName: `trackstore-cluster-${environment}`,
            vpc: this.vpc,
            containerInsights: true,
        });
        // Create Task Definition
        const taskDefinition = new ecs.FargateTaskDefinition(this, 'TrackStoreTaskDef', {
            family: `trackstore-${environment}`,
            memoryLimitMiB: environment === 'prod' ? 2048 : 1024,
            cpu: environment === 'prod' ? 1024 : 512,
        });
        // Add container
        const container = taskDefinition.addContainer('trackstore', {
            image: ecs.ContainerImage.fromAsset('../services/trackstore'),
            logging: ecs.LogDrivers.awsLogs({
                streamPrefix: 'trackstore',
                logGroup: new logs.LogGroup(this, 'TrackStoreLogGroup', {
                    logGroupName: `/ecs/trackstore-${environment}`,
                    retention: logs.RetentionDays.ONE_WEEK,
                    removalPolicy: cdk.RemovalPolicy.DESTROY,
                }),
            }),
            environment: {
                AWS_REGION: this.region,
                KINESIS_STREAM_NAME: kinesisStream.streamName,
                DEVICE_TABLE_NAME: deviceTable.tableName,
                LOCATION_TABLE_NAME: locationTable.tableName,
                SERVICE_NAME: 'trackstore',
                LOG_LEVEL: 'INFO',
            },
            healthCheck: {
                command: ['CMD-SHELL', 'curl -f http://localhost:8000/health || exit 1'],
                interval: cdk.Duration.seconds(30),
                timeout: cdk.Duration.seconds(10),
                retries: 5,
                startPeriod: cdk.Duration.seconds(120),
            },
        });
        container.addPortMappings({
            containerPort: 8000,
            protocol: ecs.Protocol.TCP,
        });
        // Grant permissions
        kinesisStream.grantRead(taskDefinition.taskRole);
        deviceTable.grantReadWriteData(taskDefinition.taskRole);
        locationTable.grantReadWriteData(taskDefinition.taskRole);
        // Add X-Ray permissions
        taskDefinition.addToTaskRolePolicy(new iam.PolicyStatement({
            actions: [
                'xray:PutTraceSegments',
                'xray:PutTelemetryRecords',
            ],
            resources: ['*'],
        }));
        // Create ALB
        this.loadBalancer = new elbv2.ApplicationLoadBalancer(this, 'TrackStoreALB', {
            loadBalancerName: `trackstore-alb-${environment}`,
            vpc: this.vpc,
            internetFacing: true,
        });
        // Create Fargate Service
        this.service = new ecs.FargateService(this, 'TrackStoreService', {
            serviceName: `trackstore-${environment}`,
            cluster: this.cluster,
            taskDefinition,
            desiredCount: environment === 'prod' ? 2 : 1,
            assignPublicIp: true,
            healthCheckGracePeriod: cdk.Duration.seconds(180),
        });
        // Configure auto-scaling
        const scaling = this.service.autoScaleTaskCount({
            minCapacity: environment === 'prod' ? 2 : 1,
            maxCapacity: environment === 'prod' ? 10 : 3,
        });
        scaling.scaleOnCpuUtilization('CpuScaling', {
            targetUtilizationPercent: 70,
            scaleInCooldown: cdk.Duration.seconds(60),
            scaleOutCooldown: cdk.Duration.seconds(60),
        });
        // Create target group
        const targetGroup = new elbv2.ApplicationTargetGroup(this, 'TrackStoreTargetGroup', {
            vpc: this.vpc,
            port: 8000,
            protocol: elbv2.ApplicationProtocol.HTTP,
            targets: [this.service],
            healthCheck: {
                path: '/health',
                interval: cdk.Duration.seconds(60),
                timeout: cdk.Duration.seconds(10),
                healthyThresholdCount: 2,
                unhealthyThresholdCount: 5,
                healthyHttpCodes: '200-299',
            },
        });
        // Add listener
        this.loadBalancer.addListener('TrackStoreListener', {
            port: 80,
            protocol: elbv2.ApplicationProtocol.HTTP,
            defaultTargetGroups: [targetGroup],
        });
        // Outputs
        new cdk.CfnOutput(this, 'LoadBalancerDNS', {
            value: this.loadBalancer.loadBalancerDnsName,
            description: 'TrackStore Load Balancer DNS',
        });
        new cdk.CfnOutput(this, 'ServiceURL', {
            value: `http://${this.loadBalancer.loadBalancerDnsName}`,
            description: 'TrackStore Service URL',
        });
        new cdk.CfnOutput(this, 'VpcId', {
            value: this.vpc.vpcId,
            description: 'VPC ID for TrackStore',
            exportName: `${this.stackName}-VpcId`,
        });
        new cdk.CfnOutput(this, 'ClusterName', {
            value: this.cluster.clusterName,
            description: 'ECS Cluster name for TrackStore',
            exportName: `${this.stackName}-ClusterName`,
        });
        // Tags
        cdk.Tags.of(this).add('Service', 'TrackStore');
        cdk.Tags.of(this).add('Environment', environment);
    }
}
exports.TrackStoreStack = TrackStoreStack;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidHJhY2tzdG9yZS1zdGFjay5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbInRyYWNrc3RvcmUtc3RhY2sudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBQSxpREFBbUM7QUFDbkMseURBQTJDO0FBQzNDLHlEQUEyQztBQUMzQyx5REFBMkM7QUFDM0MsMkRBQTZDO0FBQzdDLDhFQUFnRTtBQVloRSxNQUFhLGVBQWdCLFNBQVEsR0FBRyxDQUFDLEtBQUs7SUFNNUMsWUFBWSxLQUFnQixFQUFFLEVBQVUsRUFBRSxLQUEyQjtRQUNuRSxLQUFLLENBQUMsS0FBSyxFQUFFLEVBQUUsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUV4QixNQUFNLEVBQUUsV0FBVyxFQUFFLGFBQWEsRUFBRSxXQUFXLEVBQUUsYUFBYSxFQUFFLEdBQUcsS0FBSyxDQUFDO1FBRXpFLDJEQUEyRDtRQUMzRCxJQUFJLENBQUMsR0FBRyxHQUFHLElBQUksR0FBRyxDQUFDLEdBQUcsQ0FBQyxJQUFJLEVBQUUsZUFBZSxFQUFFO1lBQzVDLE9BQU8sRUFBRSxrQkFBa0IsV0FBVyxFQUFFO1lBQ3hDLE1BQU0sRUFBRSxDQUFDO1lBQ1QsV0FBVyxFQUFFLFdBQVcsS0FBSyxNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztTQUM1QyxDQUFDLENBQUM7UUFFSCxpREFBaUQ7UUFDakQsSUFBSSxDQUFDLE9BQU8sR0FBRyxJQUFJLEdBQUcsQ0FBQyxPQUFPLENBQUMsSUFBSSxFQUFFLG1CQUFtQixFQUFFO1lBQ3hELFdBQVcsRUFBRSxzQkFBc0IsV0FBVyxFQUFFO1lBQ2hELEdBQUcsRUFBRSxJQUFJLENBQUMsR0FBRztZQUNiLGlCQUFpQixFQUFFLElBQUk7U0FDeEIsQ0FBQyxDQUFDO1FBRUgseUJBQXlCO1FBQ3pCLE1BQU0sY0FBYyxHQUFHLElBQUksR0FBRyxDQUFDLHFCQUFxQixDQUFDLElBQUksRUFBRSxtQkFB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QUFXLEVBQUUsaUNBQWlDO1lBQzlDLFVBQVUsRUFBRSxHQUFHLElBQUksQ0FBQyxTQUFTLGNBQWM7U0FDNUMsQ0FBQyxDQUFDO1FBRUgsT0FBTztRQUNQLEdBQUcsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLElBQUksQ0FBQyxDQUFDLEdBQUcsQ0FBQyxTQUFTLEVBQUUsWUFBWSxDQUFDLENBQUM7UUFDL0MsR0FBRyxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFDLENBQUMsR0FBRyxDQUFDLGFBQWEsRUFBRSxXQUFXLENBQUMsQ0FBQztJQUNwRCxDQUFDO0NBQ0Y7QUE5SkQsMENBOEpDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0ICogYXMgY2RrIGZyb20gJ2F3cy1jZGstbGliJztcclxuaW1wb3J0ICogYXMgZWNzIGZyb20gJ2F3cy1jZGstbGliL2F3cy1lY3MnO1xyXG5pbXBvcnQgKiBhcyBlYzIgZnJvbSAnYXdzLWNkay1saWIvYXdzLWVjMic7XHJcbmltcG9ydCAqIGFzIGlhbSBmcm9tICdhd3MtY2RrLWxpYi9hd3MtaWFtJztcclxuaW1wb3J0ICogYXMgbG9ncyBmcm9tICdhd3MtY2RrLWxpYi9hd3MtbG9ncyc7XHJcbmltcG9ydCAqIGFzIGVsYnYyIGZyb20gJ2F3cy1jZGstbGliL2F3cy1lbGFzdGljbG9hZGJhbGFuY2luZ3YyJztcclxuaW1wb3J0ICogYXMga2luZXNpcyBmcm9tICdhd3MtY2RrLWxpYi9hd3Mta2luZXNpcyc7XHJcbmltcG9ydCAqIGFzIGR5bmFtb2RiIGZyb20gJ2F3cy1jZGstbGliL2F3cy1keW5hbW9kYic7XHJcbmltcG9ydCB7IENvbnN0cnVjdCB9IGZyb20gJ2NvbnN0cnVjdHMnO1xyXG5cclxuaW50ZXJmYWNlIFRyYWNrU3RvcmVTdGFja1Byb3BzIGV4dGVuZHMgY2RrLlN0YWNrUHJvcHMge1xyXG4gIGVudmlyb25tZW50OiBzdHJpbmc7XHJcbiAga2luZXNpc1N0cmVhbToga2luZXNpcy5TdHJlYW07XHJcbiAgZGV2aWNlVGFibGU6IGR5bmFtb2RiLlRhYmxlO1xyXG4gIGxvY2F0aW9uVGFibGU6IGR5bmFtb2RiLlRhYmxlO1xyXG59XHJcblxyXG5leHBvcnQgY2xhc3MgVHJhY2tTdG9yZVN0YWNrIGV4dGVuZHMgY2RrLlN0YWNrIHtcclxuICBwdWJsaWMgcmVhZG9ubHkgc2VydmljZTogZWNzLkZhcmdhdGVTZXJ2aWNlO1xyXG4gIHB1YmxpYyByZWFkb25seSBsb2FkQmFsYW5jZXI6IGVsYnYyLkFwcGxpY2F0aW9uTG9hZEJhbGFuY2VyO1xyXG4gIHB1YmxpYyByZWFkb25seSB2cGM6IGVjMi5WcGM7XHJcbiAgcHVibGljIHJlYWRvbmx5IGNsdXN0ZXI6IGVjcy5DbHVzdGVyO1xyXG5cclxuICBjb25zdHJ1Y3RvcihzY29wZTogQ29uc3RydWN0LCBpZDogc3RyaW5nLCBwcm9wczogVHJhY2tTdG9yZVN0YWNrUHJvcHMpIHtcclxuICAgIHN1cGVyKHNjb3BlLCBpZCwgcHJvcHMpO1xyXG5cclxuICAgIGNvbnN0IHsgZW52aXJvbm1lbnQsIGtpbmVzaXNTdHJlYW0sIGRldmljZVRhYmxlLCBsb2NhdGlvblRhYmxlIH0gPSBwcm9wcztcclxuXHJcbiAgICAvLyBDcmVhdGUgVlBDIChvciB1c2UgZXhpc3RpbmcpIC0gZXhwb3NlIGFzIHB1YmxpYyBwcm9wZXJ0eVxyXG4gICAgdGhpcy52cGMgPSBuZXcgZWMyLlZwYyh0aGlzLCAnVHJhY2tTdG9yZVZQQycsIHtcclxuICAgICAgdnBjTmFtZTogYHRyYWNrc3RvcmUtdnBjLSR7ZW52aXJvbm1lbnR9YCxcclxuICAgICAgbWF4QXpzOiAyLFxyXG4gICAgICBuYXRHYXRld2F5czogZW52aXJvbm1lbnQgPT09ICdwcm9kJyA/IDIgOiAxLFxyXG4gICAgfSk7XHJcblxyXG4gICAgLy8gQ3JlYXRlIEVDUyBDbHVzdGVyIC0gZXhwb3NlIGFzIHB1YmxpYyBwcm9wZXJ0eVxyXG4gICAgdGhpcy5jbHVzdGVyID0gbmV3IGVjcy5DbHVzdGVyKHRoaXMsICdUcmFja1N0b3JlQ2x1c3RlcicsIHtcclxuICAgICAgY2x1c3Rlck5hbWU6IGB0cmFja3N0b3JlLWNsdXN0ZXItJHtlbnZpcm9ubWVudH1gLFxyXG4gICAgICB2cGM6IHRoaXMudnBjLFxyXG4gICAgICBjb250YWluZXJJbnNpZ2h0czogdHJ1ZSxcclxuICAgIH0pO1xyXG5cclxuICAgIC8vIENyZWF0ZSBUYXNrIERlZmluaXRpb25cclxuICAgIGNvbnN0IHRhc2tEZWZpbml0aW9uID0gbmV3IGVjcy5GYXJnYXRlVGFza0RlZmluaXRpb24odGhpcywgJ1RyYWNrU3RvcmVUYXNrRGVmJywge1xyXG4gICAgICBmYW1pbHk6IGB0cmFja3N0b3JlLSR7ZW52aXJvbm1lbnR9YCxcclxuICAgICAgbWVtb3J5TGltaXRNaUI6IGVudmlyb25tZW50ID09PSAncHJvZCcgPyAyMDQ4IDogMTAyNCxcclxuICAgICAgY3B1OiBlbnZpcm9ubWVudCA9PT0gJ3Byb2QnID8gMTAyNCA6IDUxMixcclxuICAgIH0pO1xyXG5cclxuICAgIC8vIEFkZCBjb250YWluZXJcclxuICAgIGNvbnN0IGNvbnRhaW5lciA9IHRhc2tEZWZpbml0aW9uLmFkZENvbnRhaW5lcigndHJhY2tzdG9yZScsIHtcclxuICAgICAgaW1hZ2U6IGVjcy5Db250YWluZXJJbWFnZS5mcm9tQXNzZXQoJy4uL3NlcnZpY2VzL3RyYWNrc3RvcmUnKSxcclxuICAgICAgbG9nZ2luZzogZWNzLkxvZ0RyaXZlcnMuYXdzTG9ncyh7XHJcbiAgICAgICAgc3RyZWFtUHJlZml4OiAndHJhY2tzdG9yZScsXHJcbiAgICAgICAgbG9nR3JvdXA6IG5ldyBsb2dzLkxvZ0dyb3VwKHRoaXMsICdUcmFja1N0b3JlTG9nR3JvdXAnLCB7XHJcbiAgICAgICAgICBsb2dHcm91cE5hbWU6IGAvZWNzL3RyYWNrc3RvcmUtJHtlbnZpcm9ubWVudH1gLFxyXG4gICAgICAgICAgcmV0ZW50aW9uOiBsb2dzLlJldGVudGlvbkRheXMuT05FX1dFRUssXHJcbiAgICAgICAgICByZW1vdmFsUG9saWN5OiBjZGsuUmVtb3ZhbFBvbGljeS5ERVNUUk9ZLFxyXG4gICAgICAgIH0pLFxyXG4gICAgICB9KSxcclxuICAgICAgZW52aXJvbm1lbnQ6IHtcclxuICAgICAgICBBV1NfUkVHSU9OOiB0aGlzLnJlZ2lvbixcclxuICAgICAgICBLSU5FU0lTX1NUUkVBTV9OQU1FOiBraW5lc2lzU3RyZWFtLnN0cmVhbU5hbWUsXHJcbiAgICAgICAgREVWSUNFX1RBQkxFX05BTUU6IGRldmljZVRhYmxlLnRhYmxlTmFtZSxcclxuICAgICAgICBMT0NBVElPTl9UQUJMRV9OQU1FOiBsb2NhdGlvblRhYmxlLnRhYmxlTmFtZSxcclxuICAgICAgICBTRVJWSUNFX05BTUU6ICd0cmFja3N0b3JlJyxcclxuICAgICAgICBMT0dfTEVWRUw6ICdJTkZPJyxcclxuICAgICAgfSxcclxuICAgICAgaGVhbHRoQ2hlY2s6IHtcclxuICAgICAgICBjb21tYW5kOiBbJ0NNRC1TSEVMTCcsICdjdXJsIC1mIGh0dHA6Ly9sb2NhbGhvc3Q6ODAwMC9oZWFsdGggfHwgZXhpdCAxJ10sXHJcbiAgICAgICAgaW50ZXJ2YWw6IGNkay5EdXJhdGlvbi5zZWNvbmRzKDMwKSxcclxuICAgICAgICB0aW1lb3V0OiBjZGsuRHVyYXRpb24uc2Vjb25kcygxMCksXHJcbiAgICAgICAgcmV0cmllczogNSxcclxuICAgICAgICBzdGFydFBlcmlvZDogY2RrLkR1cmF0aW9uLnNlY29uZHMoMTIwKSxcclxuICAgICAgfSxcclxuICAgIH0pO1xyXG5cclxuICAgIGNvbnRhaW5lci5hZGRQb3J0TWFwcGluZ3Moe1xyXG4gICAgICBjb250YWluZXJQb3J0OiA4MDAwLFxyXG4gICAgICBwcm90b2NvbDogZWNzLlByb3RvY29sLlRDUCxcclxuICAgIH0pO1xyXG5cclxuICAgIC8vIEdyYW50IHBlcm1pc3Npb25zXHJcbiAgICBraW5lc2lzU3RyZWFtLmdyYW50UmVhZCh0YXNrRGVmaW5pdGlvbi50YXNrUm9sZSk7XHJcbiAgICBkZXZpY2VUYWJsZS5ncmFudFJlYWRXcml0ZURhdGEodGFza0RlZmluaXRpb24udGFza1JvbGUpO1xyXG4gICAgbG9jYXRpb25UYWJsZS5ncmFudFJlYWRXcml0ZURhdGEodGFza0RlZmluaXRpb24udGFza1JvbGUpO1xyXG5cclxuICAgIC8vIEFkZCBYLVJheSBwZXJtaXNzaW9uc1xyXG4gICAgdGFza0RlZmluaXRpb24uYWRkVG9UYXNrUm9sZVBvbGljeShuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XHJcbiAgICAgIGFjdGlvbnM6IFtcclxuICAgICAgICAneHJheTpQdXRUcmFjZVNlZ21lbnRzJyxcclxuICAgICAgICAneHJheTpQdXRUZWxlbWV0cnlSZWNvcmRzJyxcclxuICAgICAgXSxcclxuICAgICAgcmVzb3VyY2VzOiBbJyonXSxcclxuICAgIH0pKTtcclxuXHJcbiAgICAvLyBDcmVhdGUgQUxCXHJcbiAgICB0aGlzLmxvYWRCYWxhbmNlciA9IG5ldyBlbGJ2Mi5BcHBsaWNhdGlvbkxvYWRCYWxhbmNlcih0aGlzLCAnVHJhY2tTdG9yZUFMQicsIHtcclxuICAgICAgbG9hZEJhbGFuY2VyTmFtZTogYHRyYWNrc3RvcmUtYWxiLSR7ZW52aXJvbm1lbnR9YCxcclxuICAgICAgdnBjOiB0aGlzLnZwYyxcclxuICAgICAgaW50ZXJuZXRGYWNpbmc6IHRydWUsXHJcbiAgICB9KTtcclxuXHJcbiAgICAvLyBDcmVhdGUgRmFyZ2F0ZSBTZXJ2aWNlXHJcbiAgICB0aGlzLnNlcnZpY2UgPSBuZXcgZWNzLkZhcmdhdGVTZXJ2aWNlKHRoaXMsICdUcmFja1N0b3JlU2VydmljZScsIHtcclxuICAgICAgc2VydmljZU5hbWU6IGB0cmFja3N0b3JlLSR7ZW52aXJvbm1lbnR9YCxcclxuICAgICAgY2x1c3RlcjogdGhpcy5jbHVzdGVyLFxyXG4gICAgICB0YXNrRGVmaW5pdGlvbixcclxuICAgICAgZGVzaXJlZENvdW50OiBlbnZpcm9ubWVudCA9PT0gJ3Byb2QnID8gMiA6IDEsXHJcbiAgICAgIGFzc2lnblB1YmxpY0lwOiB0cnVlLFxyXG4gICAgICBoZWFsdGhDaGVja0dyYWNlUGVyaW9kOiBjZGsuRHVyYXRpb24uc2Vjb25kcygxODApLFxyXG4gICAgfSk7XHJcblxyXG4gICAgLy8gQ29uZmlndXJlIGF1dG8tc2NhbGluZ1xyXG4gICAgY29uc3Qgc2NhbGluZyA9IHRoaXMuc2VydmljZS5hdXRvU2NhbGVUYXNrQ291bnQoe1xyXG4gICAgICBtaW5DYXBhY2l0eTogZW52aXJvbm1lbnQgPT09ICdwcm9kJyA/IDIgOiAxLFxyXG4gICAgICBtYXhDYXBhY2l0eTogZW52aXJvbm1lbnQgPT09ICdwcm9kJyA/IDEwIDogMyxcclxuICAgIH0pO1xyXG5cclxuICAgIHNjYWxpbmcuc2NhbGVPbkNwdVV0aWxpemF0aW9uKCdDcHVTY2FsaW5nJywge1xyXG4gICAgICB0YXJnZXRVdGlsaXphdGlvblBlcmNlbnQ6IDcwLFxyXG4gICAgICBzY2FsZUluQ29vbGRvd246IGNkay5EdXJhdGlvbi5zZWNvbmRzKDYwKSxcclxuICAgICAgc2NhbGVPdXRDb29sZG93bjogY2RrLkR1cmF0aW9uLnNlY29uZHMoNjApLFxyXG4gICAgfSk7XHJcblxyXG4gICAgLy8gQ3JlYXRlIHRhcmdldCBncm91cFxyXG4gICAgY29uc3QgdGFyZ2V0R3JvdXAgPSBuZXcgZWxidjIuQXBwbGljYXRpb25UYXJnZXRHcm91cCh0aGlzLCAnVHJhY2tTdG9yZVRhcmdldEdyb3VwJywge1xyXG4gICAgICB2cGM6IHRoaXMudnBjLFxyXG4gICAgICBwb3J0OiA4MDAwLFxyXG4gICAgICBwcm90b2NvbDogZWxidjIuQXBwbGljYXRpb25Qcm90b2NvbC5IVFRQLFxyXG4gICAgICB0YXJnZXRzOiBbdGhpcy5zZXJ2aWNlXSxcclxuICAgICAgaGVhbHRoQ2hlY2s6IHtcclxuICAgICAgICBwYXRoOiAnL2hlYWx0aCcsXHJcbiAgICAgICAgaW50ZXJ2YWw6IGNkay5EdXJhdGlvbi5zZWNvbmRzKDYwKSxcclxuICAgICAgICB0aW1lb3V0OiBjZGsuRHVyYXRpb24uc2Vjb25kcygxMCksXHJcbiAgICAgICAgaGVhbHRoeVRocmVzaG9sZENvdW50OiAyLFxyXG4gICAgICAgIHVuaGVhbHRoeVRocmVzaG9sZENvdW50OiA1LFxyXG4gICAgICAgIGhlYWx0aHlIdHRwQ29kZXM6ICcyMDAtMjk5JyxcclxuICAgICAgfSxcclxuICAgIH0pO1xyXG5cclxuICAgIC8vIEFkZCBsaXN0ZW5lclxyXG4gICAgdGhpcy5sb2FkQmFsYW5jZXIuYWRkTGlzdGVuZXIoJ1RyYWNrU3RvcmVMaXN0ZW5lcicsIHtcclxuICAgICAgcG9ydDogODAsXHJcbiAgICAgIHByb3RvY29sOiBlbGJ2Mi5BcHBsaWNhdGlvblByb3RvY29sLkhUVFAsXHJcbiAgICAgIGRlZmF1bHRUYXJnZXRHcm91cHM6IFt0YXJnZXRHcm91cF0sXHJcbiAgICB9KTtcclxuXHJcbiAgICAvLyBPdXRwdXRzXHJcbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnTG9hZEJhbGFuY2VyRE5TJywge1xyXG4gICAgICB2YWx1ZTogdGhpcy5sb2FkQmFsYW5jZXIubG9hZEJhbGFuY2VyRG5zTmFtZSxcclxuICAgICAgZGVzY3JpcHRpb246ICdUcmFja1N0b3JlIExvYWQgQmFsYW5jZXIgRE5TJyxcclxuICAgIH0pO1xyXG5cclxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdTZXJ2aWNlVVJMJywge1xyXG4gICAgICB2YWx1ZTogYGh0dHA6Ly8ke3RoaXMubG9hZEJhbGFuY2VyLmxvYWRCYWxhbmNlckRuc05hbWV9YCxcclxuICAgICAgZGVzY3JpcHRpb246ICdUcmFja1N0b3JlIFNlcnZpY2UgVVJMJyxcclxuICAgIH0pO1xyXG5cclxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdWcGNJZCcsIHtcclxuICAgICAgdmFsdWU6IHRoaXMudnBjLnZwY0lkLFxyXG4gICAgICBkZXNjcmlwdGlvbjogJ1ZQQyBJRCBmb3IgVHJhY2tTdG9yZScsXHJcbiAgICAgIGV4cG9ydE5hbWU6IGAke3RoaXMuc3RhY2tOYW1lfS1WcGNJZGAsXHJcbiAgICB9KTtcclxuXHJcbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnQ2x1c3Rlck5hbWUnLCB7XHJcbiAgICAgIHZhbHVlOiB0aGlzLmNsdXN0ZXIuY2x1c3Rlck5hbWUsXHJcbiAgICAgIGRlc2NyaXB0aW9uOiAnRUNTIENsdXN0ZXIgbmFtZSBmb3IgVHJhY2tTdG9yZScsXHJcbiAgICAgIGV4cG9ydE5hbWU6IGAke3RoaXMuc3RhY2tOYW1lfS1DbHVzdGVyTmFtZWAsXHJcbiAgICB9KTtcclxuXHJcbiAgICAvLyBUYWdzXHJcbiAgICBjZGsuVGFncy5vZih0aGlzKS5hZGQoJ1NlcnZpY2UnLCAnVHJhY2tTdG9yZScpO1xyXG4gICAgY2RrLlRhZ3Mub2YodGhpcykuYWRkKCdFbnZpcm9ubWVudCcsIGVudmlyb25tZW50KTtcclxuICB9XHJcbn0iXX0=