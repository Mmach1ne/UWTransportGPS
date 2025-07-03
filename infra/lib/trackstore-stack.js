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
        // Create VPC (or use existing)
        const vpc = new ec2.Vpc(this, 'TrackStoreVPC', {
            vpcName: `trackstore-vpc-${environment}`,
            maxAzs: 2,
            natGateways: environment === 'prod' ? 2 : 1,
        });
        // Create ECS Cluster
        const cluster = new ecs.Cluster(this, 'TrackStoreCluster', {
            clusterName: `trackstore-cluster-${environment}`,
            vpc,
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
            vpc,
            internetFacing: true,
        });
        // Create Fargate Service
        this.service = new ecs.FargateService(this, 'TrackStoreService', {
            serviceName: `trackstore-${environment}`,
            cluster,
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
            vpc,
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
        // Tags
        cdk.Tags.of(this).add('Service', 'TrackStore');
        cdk.Tags.of(this).add('Environment', environment);
    }
}
exports.TrackStoreStack = TrackStoreStack;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidHJhY2tzdG9yZS1zdGFjay5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbInRyYWNrc3RvcmUtc3RhY2sudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBQSxpREFBbUM7QUFDbkMseURBQTJDO0FBQzNDLHlEQUEyQztBQUMzQyx5REFBMkM7QUFDM0MsMkRBQTZDO0FBQzdDLDhFQUFnRTtBQVloRSxNQUFhLGVBQWdCLFNBQVEsR0FBRyxDQUFDLEtBQUs7SUFJNUMsWUFBWSxLQUFnQixFQUFFLEVBQVUsRUFBRSxLQUEyQjtRQUNuRSxLQUFLLENBQUMsS0FBSyxFQUFFLEVBQUUsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUV4QixNQUFNLEVBQUUsV0FBVyxFQUFFLGFBQWEsRUFBRSxXQUFXLEVBQUUsYUFBYSxFQUFFLEdBQUcsS0FBSyxDQUFDO1FBRXpFLCtCQUErQjtRQUMvQixNQUFNLEdBQUcsR0FBRyxJQUFJLEdBQUcsQ0FBQyxHQUFHLENBQUMsSUFBSSxFQUFFLGVBQWUsRUFBRTtZQUM3QyxPQUFPLEVBQUUsa0JBQWtCLFdBQVcsRUFBRTtZQUN4QyxNQUFNLEVBQUUsQ0FBQztZQUNULFdBQVcsRUFBRSxXQUFXLEtBQUssTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7U0FDNUMsQ0FBQyxDQUFDO1FBRUgscUJBQXFCO1FBQ3JCLE1BQU0sT0FBTyxHQUFHLElBQUksR0FBRyxDQUFDLE9BQU8sQ0FBQyxJQUFJLEVBQUUsbUJBQW1CLEVBQUU7WUFDekQsV0FBVyxFQUFFLHNCQUFzQixXQUFXLEVBQUU7WUFDaEQsR0FBRztZQUNILGlCQUFpQixFQUFFLElBQUk7U0FDeEIsQ0FBQyxDQUFDO1FBRUgseUJBQXlCO1FBQ3pCLE1BQU0sY0FBYyxHQUFHLElBQUksR0FBRyxDQUFDLHFCQUFxQixDQUFDLElBQUksRUFBRSxtQkFBbUIsRUFBRTtZQUM5RSxNQUFNLEVBQUUsY0FBYyxXQUFXLEVBQUU7WUFDbkMsY0FBYyxFQUFFLFdBQVcsS0FBSyxNQUFNLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsSUFBSTtZQUNwRCxHQUFHLEVBQUUsV0FBVyxLQUFLLE1BQU0sQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxHQUFHO1NBQ3pDLENBQUMsQ0FBQztRQUVILGdCQUFnQjtRQUNoQixNQUFNLFNBQVMsR0FBRyxjQUFjLENBQUMsWUFBWSxDQUFDLFlBQVksRUFBRTtZQUMxRCxLQUFLLEVBQUUsR0FBRyxDQUFDLGNBQWMsQ0FBQyxTQUFTLENBQUMsd0JBQXdCLENBQUM7WUFDN0QsT0FBTyxFQUFFLEdBQUcsQ0FBQyxVQUFVLENBQUMsT0FBTyxDQUFDO2dCQUM5QixZQUFZLEVBQUUsWUFBWTtnQkFDMUIsUUFBUSxFQUFFLElBQUksSUFBSSxDQUFDLFFBQVEsQ0FBQyxJQUFJLEVBQUUsb0JBQW9CLEVBQUU7b0JBQ3RELFlBQVksRUFBRSxtQkFBbUIsV0FBVyxFQUFFO29CQUM5QyxTQUFTLEVBQUUsSUFBSSxDQUFDLGFBQWEsQ0FBQyxRQUFRO29CQUN0QyxhQUFhLEVBQUUsR0FBRyxDQUFDLGFBQWEsQ0FBQyxPQUFPO2lCQUN6QyxDQUFDO2FBQ0gsQ0FBQztZQUNGLFdBQVcsRUFBRTtnQkFDWCxVQUFVLEVBQUUsSUFBSSxDQUFDLE1BQU07Z0JBQ3ZCLG1CQUFtQixFQUFFLGFBQWEsQ0FBQyxVQUFVO2dCQUM3QyxpQkFBaUIsRUFBRSxXQUFXLENBQUMsU0FBUztnQkFDeEMsbUJBQW1CLEVBQUUsYUFBYSxDQUFDLFNBQVM7Z0JBQzVDLFlBQVksRUFBRSxZQUFZO2dCQUMxQixTQUFTLEVBQUUsTUFBTTthQUNsQjtZQUNELFdBQVcsRUFBRTtnQkFDWCxPQUFPLEVBQUUsQ0FBQyxXQUFXLEVBQUUsZ0RBQWdELENBQUM7Z0JBQ3hFLFFBQVEsRUFBRSxHQUFHLENBQUMsUUFBUSxDQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUM7Z0JBQ2xDLE9BQU8sRUFBRSxHQUFHLENBQUMsUUFBUSxDQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUM7Z0JBQ2pDLE9BQU8sRUFBRSxDQUFDO2dCQUNWLFdBQVcsRUFBRSxHQUFHLENBQUMsUUFBUSxDQUFDLE9BQU8sQ0FBQyxHQUFHLENBQUM7YUFDdkM7U0FDRixDQUFDLENBQUM7UUFFSCxTQUFTLENBQUMsZUFBZSxDQUFDO1lBQ3hCLGFBQWEsRUFBRSxJQUFJO1lBQ25CLFFBQVEsRUFBRSxHQUFHLENBQUMsUUFBUSxDQUFDLEdBQUc7U0FDM0IsQ0FBQyxDQUFDO1FBRUgsb0JBQW9CO1FBQ3BCLGFBQWEsQ0FBQyxTQUFTLENBQUMsY0FBYyxDQUFDLFFBQVEsQ0FBQyxDQUFDO1FBQ2pELFdBQVcsQ0FBQyxrQkFBa0IsQ0FBQyxjQUFjLENBQUMsUUFBUSxDQUFDLENBQUM7UUFDeEQsYUFBYSxDQUFDLGtCQUFrQixDQUFDLGNBQWMsQ0FBQyxRQUFRLENBQUMsQ0FBQztRQUUxRCx3QkFBd0I7UUFDeEIsY0FBYyxDQUFDLG1CQUFtQixDQUFDLElBQUksR0FBRyxDQUFDLGVBQWUsQ0FBQztZQUN6RCxPQUFPLEVBQUU7Z0JBQ1AsdUJBQXVCO2dCQUN2QiwwQkFBMEI7YUFDM0I7WUFDRCxTQUFTLEVBQUUsQ0FBQyxHQUFHLENBQUM7U0FDakIsQ0FBQyxDQUFDLENBQUM7UUFFSixhQUFhO1FBQ2IsSUFBSSxDQUFDLFlBQVksR0FBRyxJQUFJLEtBQUssQ0FBQyx1QkFBdUIsQ0FBQyxJQUFJLEVBQUUsZUFBZSxFQUFFO1lBQzNFLGdCQUFnQixFQUFFLGtCQUFrQixXQUFXLEVBQUU7WUFDakQsR0FBRztZQUNILGNBQWMsRUFBRSxJQUFJO1NBQ3JCLENBQUMsQ0FBQztRQUVILHlCQUF5QjtRQUN6QixJQUFJLENBQUMsT0FBTyxHQUFHLElBQUksR0FBRyxDQUFDLGNBQWMsQ0FBQyxJQUFJLEVBQUUsbUJBQW1CLEVBQUU7WUFDL0QsV0FBVyxFQUFFLGNBQWMsV0FBVyxFQUFFO1lBQ3hDLE9BQU87WUFDUCxjQUFjO1lBQ2QsWUFBWSxFQUFFLFdBQVcsS0FBSyxNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUM1QyxjQUFjLEVBQUUsSUFBSTtZQUNwQixzQkFBc0IsRUFBRSxHQUFHLENBQUMsUUFBUSxDQUFDLE9BQU8sQ0FBQyxHQUFHLENBQUM7U0FDbEQsQ0FBQyxDQUFDO1FBRUgseUJBQXlCO1FBQ3pCLE1BQU0sT0FBTyxHQUFHLElBQUksQ0FBQyxPQUFPLENBQUMsa0JBQWtCLENBQUM7WUFDOUMsV0FBVyxFQUFFLFdBQVcsS0FBSyxNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUMzQyxXQUFXLEVBQUUsV0FBVyxLQUFLLE1BQU0sQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDO1NBQzdDLENBQUMsQ0FBQztRQUVILE9BQU8sQ0FBQyxxQkFBcUIsQ0FBQyxZQUFZLEVBQUU7WUFDMUMsd0JBQXdCLEVBQUUsRUFBRTtZQUM1QixlQUFlLEVBQUUsR0FBRyxDQUFDLFFBQVEsQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDO1lBQ3pDLGdCQUFnQixFQUFFLEdBQUcsQ0FBQyxRQUFRLENBQUMsT0FBTyxDQUFDLEVBQUUsQ0FBQztTQUMzQyxDQUFDLENBQUM7UUFFSCxzQkFBc0I7UUFDdEIsTUFBTSxXQUFXLEdBQUcsSUFBSSxLQUFLLENBQUMsc0JBQXNCLENBQUMsSUFBSSxFQUFFLHVCQUF1QixFQUFFO1lBQ2xGLEdBQUc7WUFDSCxJQUFJLEVBQUUsSUFBSTtZQUNWLFFBQVEsRUFBRSxLQUFLLENBQUMsbUJBQW1CLENBQUMsSUFBSTtZQUN4QyxPQUFPLEVBQUUsQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDO1lBQ3ZCLFdBQVcsRUFBRTtnQkFDWCxJQUFJLEVBQUUsU0FBUztnQkFDZixRQUFRLEVBQUUsR0FBRyxDQUFDLFFBQVEsQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDO2dCQUNsQyxPQUFPLEVBQUUsR0FBRyxDQUFDLFFBQVEsQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDO2dCQUNqQyxxQkFBcUIsRUFBRSxDQUFDO2dCQUN4Qix1QkFBdUIsRUFBRSxDQUFDO2dCQUMxQixnQkFBZ0IsRUFBRSxTQUFTO2FBQzVCO1NBQ0YsQ0FBQyxDQUFDO1FBRUgsZUFBZTtRQUNmLElBQUksQ0FBQyxZQUFZLENBQUMsV0FBVyxDQUFDLG9CQUFvQixFQUFFO1lBQ2xELElBQUksRUFBRSxFQUFFO1lBQ1IsUUFBUSxFQUFFLEtBQUssQ0FBQyxtQkFBbUIsQ0FBQyxJQUFJO1lBQ3hDLG1CQUFtQixFQUFFLENBQUMsV0FBVyxDQUFDO1NBQ25DLENBQUMsQ0FBQztRQUVILFVBQVU7UUFDVixJQUFJLEdBQUcsQ0FBQyxTQUFTLENBQUMsSUFBSSxFQUFFLGlCQUFpQixFQUFFO1lBQ3pDLEtBQUssRUFBRSxJQUFJLENBQUMsWUFBWSxDQUFDLG1CQUFtQjtZQUM1QyxXQUFXLEVBQUUsOEJBQThCO1NBQzVDLENBQUMsQ0FBQztRQUVILElBQUksR0FBRyxDQUFDLFNBQVMsQ0FBQyxJQUFJLEVBQUUsWUFBWSxFQUFFO1lBQ3BDLEtBQUssRUFBRSxVQUFVLElBQUksQ0FBQyxZQUFZLENBQUMsbUJBQW1CLEVBQUU7WUFDeEQsV0FBVyxFQUFFLHdCQUF3QjtTQUN0QyxDQUFDLENBQUM7UUFFSCxPQUFPO1FBQ1AsR0FBRyxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFDLENBQUMsR0FBRyxDQUFDLFNBQVMsRUFBRSxZQUFZLENBQUMsQ0FBQztRQUMvQyxHQUFHLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxJQUFJLENBQUMsQ0FBQyxHQUFHLENBQUMsYUFBYSxFQUFFLFdBQVcsQ0FBQyxDQUFDO0lBQ3BELENBQUM7Q0FDRjtBQWhKRCwwQ0FnSkMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgKiBhcyBjZGsgZnJvbSAnYXdzLWNkay1saWInO1xyXG5pbXBvcnQgKiBhcyBlY3MgZnJvbSAnYXdzLWNkay1saWIvYXdzLWVjcyc7XHJcbmltcG9ydCAqIGFzIGVjMiBmcm9tICdhd3MtY2RrLWxpYi9hd3MtZWMyJztcclxuaW1wb3J0ICogYXMgaWFtIGZyb20gJ2F3cy1jZGstbGliL2F3cy1pYW0nO1xyXG5pbXBvcnQgKiBhcyBsb2dzIGZyb20gJ2F3cy1jZGstbGliL2F3cy1sb2dzJztcclxuaW1wb3J0ICogYXMgZWxidjIgZnJvbSAnYXdzLWNkay1saWIvYXdzLWVsYXN0aWNsb2FkYmFsYW5jaW5ndjInO1xyXG5pbXBvcnQgKiBhcyBraW5lc2lzIGZyb20gJ2F3cy1jZGstbGliL2F3cy1raW5lc2lzJztcclxuaW1wb3J0ICogYXMgZHluYW1vZGIgZnJvbSAnYXdzLWNkay1saWIvYXdzLWR5bmFtb2RiJztcclxuaW1wb3J0IHsgQ29uc3RydWN0IH0gZnJvbSAnY29uc3RydWN0cyc7XHJcblxyXG5pbnRlcmZhY2UgVHJhY2tTdG9yZVN0YWNrUHJvcHMgZXh0ZW5kcyBjZGsuU3RhY2tQcm9wcyB7XHJcbiAgZW52aXJvbm1lbnQ6IHN0cmluZztcclxuICBraW5lc2lzU3RyZWFtOiBraW5lc2lzLlN0cmVhbTtcclxuICBkZXZpY2VUYWJsZTogZHluYW1vZGIuVGFibGU7XHJcbiAgbG9jYXRpb25UYWJsZTogZHluYW1vZGIuVGFibGU7XHJcbn1cclxuXHJcbmV4cG9ydCBjbGFzcyBUcmFja1N0b3JlU3RhY2sgZXh0ZW5kcyBjZGsuU3RhY2sge1xyXG4gIHB1YmxpYyByZWFkb25seSBzZXJ2aWNlOiBlY3MuRmFyZ2F0ZVNlcnZpY2U7XHJcbiAgcHVibGljIHJlYWRvbmx5IGxvYWRCYWxhbmNlcjogZWxidjIuQXBwbGljYXRpb25Mb2FkQmFsYW5jZXI7XHJcblxyXG4gIGNvbnN0cnVjdG9yKHNjb3BlOiBDb25zdHJ1Y3QsIGlkOiBzdHJpbmcsIHByb3BzOiBUcmFja1N0b3JlU3RhY2tQcm9wcykge1xyXG4gICAgc3VwZXIoc2NvcGUsIGlkLCBwcm9wcyk7XHJcblxyXG4gICAgY29uc3QgeyBlbnZpcm9ubWVudCwga2luZXNpc1N0cmVhbSwgZGV2aWNlVGFibGUsIGxvY2F0aW9uVGFibGUgfSA9IHByb3BzO1xyXG5cclxuICAgIC8vIENyZWF0ZSBWUEMgKG9yIHVzZSBleGlzdGluZylcclxuICAgIGNvbnN0IHZwYyA9IG5ldyBlYzIuVnBjKHRoaXMsICdUcmFja1N0b3JlVlBDJywge1xyXG4gICAgICB2cGNOYW1lOiBgdHJhY2tzdG9yZS12cGMtJHtlbnZpcm9ubWVudH1gLFxyXG4gICAgICBtYXhBenM6IDIsXHJcbiAgICAgIG5hdEdhdGV3YXlzOiBlbnZpcm9ubWVudCA9PT0gJ3Byb2QnID8gMiA6IDEsXHJcbiAgICB9KTtcclxuXHJcbiAgICAvLyBDcmVhdGUgRUNTIENsdXN0ZXJcclxuICAgIGNvbnN0IGNsdXN0ZXIgPSBuZXcgZWNzLkNsdXN0ZXIodGhpcywgJ1RyYWNrU3RvcmVDbHVzdGVyJywge1xyXG4gICAgICBjbHVzdGVyTmFtZTogYHRyYWNrc3RvcmUtY2x1c3Rlci0ke2Vudmlyb25tZW50fWAsXHJcbiAgICAgIHZwYyxcclxuICAgICAgY29udGFpbmVySW5zaWdodHM6IHRydWUsXHJcbiAgICB9KTtcclxuXHJcbiAgICAvLyBDcmVhdGUgVGFzayBEZWZpbml0aW9uXHJcbiAgICBjb25zdCB0YXNrRGVmaW5pdGlvbiA9IG5ldyBlY3MuRmFyZ2F0ZVRhc2tEZWZpbml0aW9uKHRoaXMsICdUcmFja1N0b3JlVGFza0RlZicsIHtcclxuICAgICAgZmFtaWx5OiBgdHJhY2tzdG9yZS0ke2Vudmlyb25tZW50fWAsXHJcbiAgICAgIG1lbW9yeUxpbWl0TWlCOiBlbnZpcm9ubWVudCA9PT0gJ3Byb2QnID8gMjA0OCA6IDEwMjQsXHJcbiAgICAgIGNwdTogZW52aXJvbm1lbnQgPT09ICdwcm9kJyA/IDEwMjQgOiA1MTIsXHJcbiAgICB9KTtcclxuXHJcbiAgICAvLyBBZGQgY29udGFpbmVyXHJcbiAgICBjb25zdCBjb250YWluZXIgPSB0YXNrRGVmaW5pdGlvbi5hZGRDb250YWluZXIoJ3RyYWNrc3RvcmUnLCB7XHJcbiAgICAgIGltYWdlOiBlY3MuQ29udGFpbmVySW1hZ2UuZnJvbUFzc2V0KCcuLi9zZXJ2aWNlcy90cmFja3N0b3JlJyksXHJcbiAgICAgIGxvZ2dpbmc6IGVjcy5Mb2dEcml2ZXJzLmF3c0xvZ3Moe1xyXG4gICAgICAgIHN0cmVhbVByZWZpeDogJ3RyYWNrc3RvcmUnLFxyXG4gICAgICAgIGxvZ0dyb3VwOiBuZXcgbG9ncy5Mb2dHcm91cCh0aGlzLCAnVHJhY2tTdG9yZUxvZ0dyb3VwJywge1xyXG4gICAgICAgICAgbG9nR3JvdXBOYW1lOiBgL2Vjcy90cmFja3N0b3JlLSR7ZW52aXJvbm1lbnR9YCxcclxuICAgICAgICAgIHJldGVudGlvbjogbG9ncy5SZXRlbnRpb25EYXlzLk9ORV9XRUVLLFxyXG4gICAgICAgICAgcmVtb3ZhbFBvbGljeTogY2RrLlJlbW92YWxQb2xpY3kuREVTVFJPWSxcclxuICAgICAgICB9KSxcclxuICAgICAgfSksXHJcbiAgICAgIGVudmlyb25tZW50OiB7XHJcbiAgICAgICAgQVdTX1JFR0lPTjogdGhpcy5yZWdpb24sXHJcbiAgICAgICAgS0lORVNJU19TVFJFQU1fTkFNRToga2luZXNpc1N0cmVhbS5zdHJlYW1OYW1lLFxyXG4gICAgICAgIERFVklDRV9UQUJMRV9OQU1FOiBkZXZpY2VUYWJsZS50YWJsZU5hbWUsXHJcbiAgICAgICAgTE9DQVRJT05fVEFCTEVfTkFNRTogbG9jYXRpb25UYWJsZS50YWJsZU5hbWUsXHJcbiAgICAgICAgU0VSVklDRV9OQU1FOiAndHJhY2tzdG9yZScsXHJcbiAgICAgICAgTE9HX0xFVkVMOiAnSU5GTycsXHJcbiAgICAgIH0sXHJcbiAgICAgIGhlYWx0aENoZWNrOiB7XHJcbiAgICAgICAgY29tbWFuZDogWydDTUQtU0hFTEwnLCAnY3VybCAtZiBodHRwOi8vbG9jYWxob3N0OjgwMDAvaGVhbHRoIHx8IGV4aXQgMSddLFxyXG4gICAgICAgIGludGVydmFsOiBjZGsuRHVyYXRpb24uc2Vjb25kcygzMCksXHJcbiAgICAgICAgdGltZW91dDogY2RrLkR1cmF0aW9uLnNlY29uZHMoMTApLFxyXG4gICAgICAgIHJldHJpZXM6IDUsXHJcbiAgICAgICAgc3RhcnRQZXJpb2Q6IGNkay5EdXJhdGlvbi5zZWNvbmRzKDEyMCksXHJcbiAgICAgIH0sXHJcbiAgICB9KTtcclxuXHJcbiAgICBjb250YWluZXIuYWRkUG9ydE1hcHBpbmdzKHtcclxuICAgICAgY29udGFpbmVyUG9ydDogODAwMCxcclxuICAgICAgcHJvdG9jb2w6IGVjcy5Qcm90b2NvbC5UQ1AsXHJcbiAgICB9KTtcclxuXHJcbiAgICAvLyBHcmFudCBwZXJtaXNzaW9uc1xyXG4gICAga2luZXNpc1N0cmVhbS5ncmFudFJlYWQodGFza0RlZmluaXRpb24udGFza1JvbGUpO1xyXG4gICAgZGV2aWNlVGFibGUuZ3JhbnRSZWFkV3JpdGVEYXRhKHRhc2tEZWZpbml0aW9uLnRhc2tSb2xlKTtcclxuICAgIGxvY2F0aW9uVGFibGUuZ3JhbnRSZWFkV3JpdGVEYXRhKHRhc2tEZWZpbml0aW9uLnRhc2tSb2xlKTtcclxuXHJcbiAgICAvLyBBZGQgWC1SYXkgcGVybWlzc2lvbnNcclxuICAgIHRhc2tEZWZpbml0aW9uLmFkZFRvVGFza1JvbGVQb2xpY3kobmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xyXG4gICAgICBhY3Rpb25zOiBbXHJcbiAgICAgICAgJ3hyYXk6UHV0VHJhY2VTZWdtZW50cycsXHJcbiAgICAgICAgJ3hyYXk6UHV0VGVsZW1ldHJ5UmVjb3JkcycsXHJcbiAgICAgIF0sXHJcbiAgICAgIHJlc291cmNlczogWycqJ10sXHJcbiAgICB9KSk7XHJcblxyXG4gICAgLy8gQ3JlYXRlIEFMQlxyXG4gICAgdGhpcy5sb2FkQmFsYW5jZXIgPSBuZXcgZWxidjIuQXBwbGljYXRpb25Mb2FkQmFsYW5jZXIodGhpcywgJ1RyYWNrU3RvcmVBTEInLCB7XHJcbiAgICAgIGxvYWRCYWxhbmNlck5hbWU6IGB0cmFja3N0b3JlLWFsYi0ke2Vudmlyb25tZW50fWAsXHJcbiAgICAgIHZwYyxcclxuICAgICAgaW50ZXJuZXRGYWNpbmc6IHRydWUsXHJcbiAgICB9KTtcclxuXHJcbiAgICAvLyBDcmVhdGUgRmFyZ2F0ZSBTZXJ2aWNlXHJcbiAgICB0aGlzLnNlcnZpY2UgPSBuZXcgZWNzLkZhcmdhdGVTZXJ2aWNlKHRoaXMsICdUcmFja1N0b3JlU2VydmljZScsIHtcclxuICAgICAgc2VydmljZU5hbWU6IGB0cmFja3N0b3JlLSR7ZW52aXJvbm1lbnR9YCxcclxuICAgICAgY2x1c3RlcixcclxuICAgICAgdGFza0RlZmluaXRpb24sXHJcbiAgICAgIGRlc2lyZWRDb3VudDogZW52aXJvbm1lbnQgPT09ICdwcm9kJyA/IDIgOiAxLFxyXG4gICAgICBhc3NpZ25QdWJsaWNJcDogdHJ1ZSxcclxuICAgICAgaGVhbHRoQ2hlY2tHcmFjZVBlcmlvZDogY2RrLkR1cmF0aW9uLnNlY29uZHMoMTgwKSxcclxuICAgIH0pO1xyXG5cclxuICAgIC8vIENvbmZpZ3VyZSBhdXRvLXNjYWxpbmdcclxuICAgIGNvbnN0IHNjYWxpbmcgPSB0aGlzLnNlcnZpY2UuYXV0b1NjYWxlVGFza0NvdW50KHtcclxuICAgICAgbWluQ2FwYWNpdHk6IGVudmlyb25tZW50ID09PSAncHJvZCcgPyAyIDogMSxcclxuICAgICAgbWF4Q2FwYWNpdHk6IGVudmlyb25tZW50ID09PSAncHJvZCcgPyAxMCA6IDMsXHJcbiAgICB9KTtcclxuXHJcbiAgICBzY2FsaW5nLnNjYWxlT25DcHVVdGlsaXphdGlvbignQ3B1U2NhbGluZycsIHtcclxuICAgICAgdGFyZ2V0VXRpbGl6YXRpb25QZXJjZW50OiA3MCxcclxuICAgICAgc2NhbGVJbkNvb2xkb3duOiBjZGsuRHVyYXRpb24uc2Vjb25kcyg2MCksXHJcbiAgICAgIHNjYWxlT3V0Q29vbGRvd246IGNkay5EdXJhdGlvbi5zZWNvbmRzKDYwKSxcclxuICAgIH0pO1xyXG5cclxuICAgIC8vIENyZWF0ZSB0YXJnZXQgZ3JvdXBcclxuICAgIGNvbnN0IHRhcmdldEdyb3VwID0gbmV3IGVsYnYyLkFwcGxpY2F0aW9uVGFyZ2V0R3JvdXAodGhpcywgJ1RyYWNrU3RvcmVUYXJnZXRHcm91cCcsIHtcclxuICAgICAgdnBjLFxyXG4gICAgICBwb3J0OiA4MDAwLFxyXG4gICAgICBwcm90b2NvbDogZWxidjIuQXBwbGljYXRpb25Qcm90b2NvbC5IVFRQLFxyXG4gICAgICB0YXJnZXRzOiBbdGhpcy5zZXJ2aWNlXSxcclxuICAgICAgaGVhbHRoQ2hlY2s6IHtcclxuICAgICAgICBwYXRoOiAnL2hlYWx0aCcsXHJcbiAgICAgICAgaW50ZXJ2YWw6IGNkay5EdXJhdGlvbi5zZWNvbmRzKDYwKSxcclxuICAgICAgICB0aW1lb3V0OiBjZGsuRHVyYXRpb24uc2Vjb25kcygxMCksXHJcbiAgICAgICAgaGVhbHRoeVRocmVzaG9sZENvdW50OiAyLFxyXG4gICAgICAgIHVuaGVhbHRoeVRocmVzaG9sZENvdW50OiA1LFxyXG4gICAgICAgIGhlYWx0aHlIdHRwQ29kZXM6ICcyMDAtMjk5JyxcclxuICAgICAgfSxcclxuICAgIH0pO1xyXG5cclxuICAgIC8vIEFkZCBsaXN0ZW5lclxyXG4gICAgdGhpcy5sb2FkQmFsYW5jZXIuYWRkTGlzdGVuZXIoJ1RyYWNrU3RvcmVMaXN0ZW5lcicsIHtcclxuICAgICAgcG9ydDogODAsXHJcbiAgICAgIHByb3RvY29sOiBlbGJ2Mi5BcHBsaWNhdGlvblByb3RvY29sLkhUVFAsXHJcbiAgICAgIGRlZmF1bHRUYXJnZXRHcm91cHM6IFt0YXJnZXRHcm91cF0sXHJcbiAgICB9KTtcclxuXHJcbiAgICAvLyBPdXRwdXRzXHJcbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnTG9hZEJhbGFuY2VyRE5TJywge1xyXG4gICAgICB2YWx1ZTogdGhpcy5sb2FkQmFsYW5jZXIubG9hZEJhbGFuY2VyRG5zTmFtZSxcclxuICAgICAgZGVzY3JpcHRpb246ICdUcmFja1N0b3JlIExvYWQgQmFsYW5jZXIgRE5TJyxcclxuICAgIH0pO1xyXG5cclxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdTZXJ2aWNlVVJMJywge1xyXG4gICAgICB2YWx1ZTogYGh0dHA6Ly8ke3RoaXMubG9hZEJhbGFuY2VyLmxvYWRCYWxhbmNlckRuc05hbWV9YCxcclxuICAgICAgZGVzY3JpcHRpb246ICdUcmFja1N0b3JlIFNlcnZpY2UgVVJMJyxcclxuICAgIH0pO1xyXG5cclxuICAgIC8vIFRhZ3NcclxuICAgIGNkay5UYWdzLm9mKHRoaXMpLmFkZCgnU2VydmljZScsICdUcmFja1N0b3JlJyk7XHJcbiAgICBjZGsuVGFncy5vZih0aGlzKS5hZGQoJ0Vudmlyb25tZW50JywgZW52aXJvbm1lbnQpO1xyXG4gIH1cclxufSJdfQ==