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
exports.TransportInfraStack = void 0;
const cdk = __importStar(require("aws-cdk-lib"));
const s3 = __importStar(require("aws-cdk-lib/aws-s3"));
const dynamodb = __importStar(require("aws-cdk-lib/aws-dynamodb"));
const iot = __importStar(require("aws-cdk-lib/aws-iot"));
const iam = __importStar(require("aws-cdk-lib/aws-iam"));
const kinesis = __importStar(require("aws-cdk-lib/aws-kinesis"));
class TransportInfraStack extends cdk.Stack {
    constructor(scope, id, props) {
        super(scope, id, props);
        const { environment } = props;
        // S3 Bucket for storing device data
        this.dataBucket = new s3.Bucket(this, 'DeviceDataBucket', {
            bucketName: `transport-gps-data-${environment}-${this.account}`,
            encryption: s3.BucketEncryption.S3_MANAGED,
            versioned: true,
            lifecycleRules: [
                {
                    id: 'delete-old-data',
                    enabled: true,
                    expiration: cdk.Duration.days(environment === 'prod' ? 90 : 30),
                },
            ],
            removalPolicy: environment === 'prod'
                ? cdk.RemovalPolicy.RETAIN
                : cdk.RemovalPolicy.DESTROY,
            autoDeleteObjects: environment !== 'prod',
        });
        // DynamoDB table for device registry
        this.deviceTable = new dynamodb.Table(this, 'DeviceTable', {
            tableName: `transport-devices-${environment}`,
            partitionKey: { name: 'deviceId', type: dynamodb.AttributeType.STRING },
            billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
            encryption: dynamodb.TableEncryption.AWS_MANAGED,
            pointInTimeRecoverySpecification: {
                pointInTimeRecoveryEnabled: environment === 'prod',
            },
            removalPolicy: environment === 'prod'
                ? cdk.RemovalPolicy.RETAIN
                : cdk.RemovalPolicy.DESTROY,
        });
        // DynamoDB table for location data
        this.locationTable = new dynamodb.Table(this, 'LocationTable', {
            tableName: `transport-locations-${environment}`,
            partitionKey: { name: 'deviceId', type: dynamodb.AttributeType.STRING },
            sortKey: { name: 'timestamp', type: dynamodb.AttributeType.NUMBER },
            billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
            encryption: dynamodb.TableEncryption.AWS_MANAGED,
            pointInTimeRecovery: environment === 'prod',
            removalPolicy: environment === 'prod'
                ? cdk.RemovalPolicy.RETAIN
                : cdk.RemovalPolicy.DESTROY,
        });
        // Add GSI for querying by time range
        this.locationTable.addGlobalSecondaryIndex({
            indexName: 'TimestampIndex',
            partitionKey: { name: 'date', type: dynamodb.AttributeType.STRING },
            sortKey: { name: 'timestamp', type: dynamodb.AttributeType.NUMBER },
        });
        // Kinesis Data Stream for GPS data
        this.gpsDataStream = new kinesis.Stream(this, 'GPSDataStream', {
            streamName: `transport-gps-stream-${environment}`,
            shardCount: environment === 'prod' ? 2 : 1,
            retentionPeriod: cdk.Duration.hours(24),
            encryption: kinesis.StreamEncryption.MANAGED,
            streamMode: kinesis.StreamMode.PROVISIONED,
        });
        // Add CloudWatch alarms for Kinesis
        this.gpsDataStream.metricGetRecordsSuccess().createAlarm(this, 'StreamReadAlarm', {
            threshold: 0.95,
            evaluationPeriods: 2,
            treatMissingData: cdk.aws_cloudwatch.TreatMissingData.BREACHING,
            alarmDescription: 'Alarm when stream read success rate drops below 95%',
        });
        // Grant IoT Core permission to write to Kinesis
        const iotKinesisRole = new iam.Role(this, 'IoTKinesisRole', {
            assumedBy: new iam.ServicePrincipal('iot.amazonaws.com'),
            description: 'Role for IoT Core to write to Kinesis',
        });
        this.gpsDataStream.grantWrite(iotKinesisRole);
        // IoT Thing Type for GPS devices
        const deviceThingType = new iot.CfnThingType(this, 'GPSDeviceType', {
            thingTypeName: `TransportGPSDevice-${environment}`,
            thingTypeProperties: {
                thingTypeDescription: 'GPS tracking device for transport vehicles',
                searchableAttributes: ['deviceModel', 'firmwareVersion', 'vehicleId'],
            },
        });
        // IoT Policy for devices
        const iotPolicy = new iot.CfnPolicy(this, 'DevicePolicy', {
            policyName: `TransportDevicePolicy-${environment}`,
            policyDocument: {
                Version: '2012-10-17',
                Statement: [
                    {
                        Effect: 'Allow',
                        Action: [
                            'iot:Connect',
                            'iot:Publish',
                            'iot:Subscribe',
                            'iot:Receive',
                        ],
                        Resource: [
                            `arn:aws:iot:${this.region}:${this.account}:client/\${iot:ClientId}`,
                            `arn:aws:iot:${this.region}:${this.account}:topic/transport/${environment}/\${iot:ClientId}/*`,
                            `arn:aws:iot:${this.region}:${this.account}:topicfilter/transport/${environment}/\${iot:ClientId}/*`,
                        ],
                    },
                ],
            },
        });
        // Outputs
        new cdk.CfnOutput(this, 'DataBucketName', {
            value: this.dataBucket.bucketName,
            description: 'Name of the S3 bucket for device data',
        });
        new cdk.CfnOutput(this, 'DeviceTableName', {
            value: this.deviceTable.tableName,
            description: 'Name of the DynamoDB table for devices',
        });
        new cdk.CfnOutput(this, 'LocationTableName', {
            value: this.locationTable.tableName,
            description: 'Name of the DynamoDB table for locations',
        });
        new cdk.CfnOutput(this, 'IoTPolicyName', {
            value: iotPolicy.policyName,
            description: 'Name of the IoT policy for devices',
        });
        new cdk.CfnOutput(this, 'KinesisStreamName', {
            value: this.gpsDataStream.streamName,
            description: 'Name of the Kinesis stream for GPS data',
        });
        new cdk.CfnOutput(this, 'KinesisStreamArn', {
            value: this.gpsDataStream.streamArn,
            description: 'ARN of the Kinesis stream',
        });
        new cdk.CfnOutput(this, 'IoTKinesisRoleArn', {
            value: iotKinesisRole.roleArn,
            description: 'ARN of the IAM role for IoT to write to Kinesis',
        });
        // Tag all resources
        cdk.Tags.of(this).add('Project', 'TransportGPS');
        cdk.Tags.of(this).add('Environment', environment);
        cdk.Tags.of(this).add('ManagedBy', 'CDK');
    }
}
exports.TransportInfraStack = TransportInfraStack;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidHJhbnNwb3J0LWluZnJhLXN0YWNrLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsidHJhbnNwb3J0LWluZnJhLXN0YWNrLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQUEsaURBQW1DO0FBQ25DLHVEQUF5QztBQUN6QyxtRUFBcUQ7QUFDckQseURBQTJDO0FBQzNDLHlEQUEyQztBQUMzQyxpRUFBbUQ7QUFPbkQsTUFBYSxtQkFBb0IsU0FBUSxHQUFHLENBQUMsS0FBSztJQU1oRCxZQUFZLEtBQWdCLEVBQUUsRUFBVSxFQUFFLEtBQStCO1FBQ3ZFLEtBQUssQ0FBQyxLQUFLLEVBQUUsRUFBRSxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBRXhCLE1BQU0sRUFBRSxXQUFXLEVBQUUsR0FBRyxLQUFLLENBQUM7UUFFOUIsb0NBQW9DO1FBQ3BDLElBQUksQ0FBQyxVQUFVLEdBQUcsSUFBSSxFQUFFLENBQUMsTUFBTSxDQUFDLElBQUksRUFBRSxrQkFBa0IsRUFBRTtZQUN4RCxVQUFVLEVBQUUsc0JBQXNCLFdBQVcsSUFBSSxJQUFJLENBQUMsT0FBTyxFQUFFO1lBQy9ELFVBQVUsRUFBRSxFQUFFLENBQUMsZ0JBQWdCLENBQUMsVUFBVTtZQUMxQyxTQUFTLEVBQUUsSUFBSTtZQUNmLGNBQWMsRUFBRTtnQkFDZDtvQkFDRSxFQUFFLEVBQUUsaUJBQWlCO29CQUNyQixPQUFPLEVBQUUsSUFBSTtvQkFDYixVQUFVLEVBQUUsR0FBRyxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsV0FBVyxLQUFLLE1BQU0sQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUM7aUJBQ2hFO2FBQ0Y7WUFDRCxhQUFhLEVBQUUsV0FBVyxLQUFLLE1BQU07Z0JBQ25DLENBQUMsQ0FBQyxHQUFHLENBQUMsYUFBYSxDQUFDLE1BQU07Z0JBQzFCLENBQUMsQ0FBQyxHQUFHLENBQUMsYUFBYSxDQUFDLE9BQU87WUFDN0IsaUJBQWlCLEVBQUUsV0FBVyxLQUFLLE1BQU07U0FDMUMsQ0FBQyxDQUFDO1FBRUgscUNBQXFDO1FBQ3JDLElBQUksQ0FBQyxXQUFXLEdBQUcsSUFBSSxRQUFRLENBQUMsS0FBSyxDQUFDLElBQUksRUFBRSxhQUFhLEVBQUU7WUFDekQsU0FBUyxFQUFFLHFCQUFxQixXQUFXLEVBQUU7WUFDN0MsWUFBWSxFQUFFLEVBQUUsSUFBSSxFQUFFLFVBQVUsRUFBRSxJQUFJLEVBQUUsUUFBUSxDQUFDLGFBQWEsQ0FBQyxNQUFNLEVBQUU7WUFDdkUsV0FBVyxFQUFFLFFBQVEsQ0FBQyxXQUFXLENBQUMsZUFBZTtZQUNqRCxVQUFVLEVBQUUsUUFBUSxDQUFDLGVBQWUsQ0FBQyxXQUFXO1lBQ2hELGdDQUFnQyxFQUFFO2dCQUNoQywwQkFBMEIsRUFBRSxXQUFXLEtBQUssTUFBTTthQUNuRDtZQUNELGFBQWEsRUFBRSxXQUFXLEtBQUssTUFBTTtnQkFDbkMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxhQUFhLENBQUMsTUFBTTtnQkFDMUIsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxhQUFhLENBQUMsT0FBTztTQUM5QixDQUFDLENBQUM7UUFFSCxtQ0FBbUM7UUFDbkMsSUFBSSxDQUFDLGFBQWEsR0FBRyxJQUFJLFFBQVEsQ0FBQyxLQUFLLENBQUMsSUFBSSxFQUFFLGVBQWUsRUFBRTtZQUM3RCxTQUFTLEVBQUUsdUJBQXVCLFdBQVcsRUFBRTtZQUMvQyxZQUFZLEVBQUUsRUFBRSxJQUFJLEVBQUUsVUFBVSxFQUFFLElBQUksRUFBRSxRQUFRLENBQUMsYUFBYSxDQUFDLE1BQU0sRUFBRTtZQUN2RSxPQUFPLEVBQUUsRUFBRSxJQUFJLEVBQUUsV0FBVyxFQUFFLElBQUksRUFBRSxRQUFRLENBQUMsYUFBYSxDQUFDLE1BQU0sRUFBRTtZQUNuRSxXQUFXLEVBQUUsUUFBUSxDQUFDLFdBQVcsQ0FBQyxlQUFlO1lBQ2pELFVBQVUsRUFBRSxRQUFRLENBQUMsZUFBZSxDQUFDLFdBQVc7WUFDaEQsbUJBQW1CLEVBQUUsV0FBVyxLQUFLLE1BQU07WUFDM0MsYUFBYSxFQUFFLFdBQVcsS0FBSyxNQUFNO2dCQUNuQyxDQUFDLENBQUMsR0FBRyxDQUFDLGFBQWEsQ0FBQyxNQUFNO2dCQUMxQixDQUFDLENBQUMsR0FBRyxDQUFDLGFBQWEsQ0FBQyxPQUFPO1NBQzlCLENBQUMsQ0FBQztRQUVILHFDQUFxQztRQUNyQyxJQUFJLENBQUMsYUFBYSxDQUFDLHVCQUF1QixDQUFDO1lBQ3pDLFNBQVMsRUFBRSxnQkFBZ0I7WUFDM0IsWUFBWSxFQUFFLEVBQUUsSUFBSSxFQUFFLE1BQU0sRUFBRSxJQUFJLEVBQUUsUUFBUSxDQUFDLGFBQWEsQ0FBQyxNQUFNLEVBQUU7WUFDbkUsT0FBTyxFQUFFLEVBQUUsSUFBSSxFQUFFLFdBQVcsRUFBRSxJQUFJLEVBQUUsUUFBUSxDQUFDLGFBQWEsQ0FBQyxNQUFNLEVBQUU7U0FDcEUsQ0FBQyxDQUFDO1FBRUgsbUNBQW1DO1FBQ25DLElBQUksQ0FBQyxhQUFhLEdBQUcsSUFBSSxPQUFPLENBQUMsTUFBTSxDQUFDLElBQUksRUFBRSxlQUFlLEVBQUU7WUFDN0QsVUFBVSxFQUFFLHdCQUF3QixXQUFXLEVBQUU7WUFDakQsVUFBVSxFQUFFLFdBQVcsS0FBSyxNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUMxQyxlQUFlLEVBQUUsR0FBRyxDQUFDLFFBQVEsQ0FBQyxLQUFLLENBQUMsRUFBRSxDQUFDO1lBQ3ZDLFVBQVUsRUFBRSxPQUFPLENBQUMsZ0JBQWdCLENBQUMsT0FBTztZQUM1QyxVQUFVLEVBQUUsT0FBTyxDQUFDLFVBQVUsQ0FBQyxXQUFXO1NBQzNDLENBQUMsQ0FBQztRQUVILG9DQUFvQztRQUNwQyxJQUFJLENBQUMsYUFBYSxDQUFDLHVCQUF1QixFQUFFLENBQUMsV0FBVyxDQUFDLElBQUksRUFBRSxpQkFBaUIsRUFBRTtZQUNoRixTQUFTLEVBQUUsSUFBSTtZQUNmLGlCQUFpQixFQUFFLENBQUM7WUFDcEIsZ0JBQWdCLEVBQUUsR0FBRyxDQUFDLGNBQWMsQ0FBQyxnQkFBZ0IsQ0FBQyxTQUFTO1lBQy9ELGdCQUFnQixFQUFFLHFEQUFxRDtTQUN4RSxDQUFDLENBQUM7UUFFSCxnREFBZ0Q7UUFDaEQsTUFBTSxjQUFjLEdBQUcsSUFBSSxHQUFHLENBQUMsSUFBSSxDQUFDLElBQUksRUFBRSxnQkFBZ0IsRUFBRTtZQUMxRCxTQUFTLEVBQUUsSUFBSSxHQUFHLENBQUMsZ0JBQWdCLENBQUMsbUJBQW1CLENBQUM7WUFDeEQsV0FBVyxFQUFFLHVDQUF1QztTQUNyRCxDQUFDLENBQUM7UUFFSCxJQUFJLENBQUMsYUFBYSxDQUFDLFVBQVUsQ0FBQyxjQUFjLENBQUMsQ0FBQztRQUU5QyxpQ0FBaUM7UUFDakMsTUFBTSxlQUFlLEdBQUcsSUFBSSxHQUFHLENBQUMsWUFBWSxDQUFDLElBQUksRUFBRSxlQUFlLEVBQUU7WUFDbEUsYUFBYSxFQUFFLHNCQUFzQixXQUFXLEVBQUU7WUFDbEQsbUJBQW1CLEVBQUU7Z0JBQ25CLG9CQUFvQixFQUFFLDRDQUE0QztnQkFDbEUsb0JBQW9CLEVBQUUsQ0FBQyxhQUFhLEVBQUUsaUJBQWlCLEVBQUUsV0FBVyxDQUFDO2FBQ3RFO1NBQ0YsQ0FBQyxDQUFDO1FBRUgseUJBQXlCO1FBQ3pCLE1BQU0sU0FBUyxHQUFHLElBQUksR0FBRyxDQUFDLFNBQVMsQ0FBQyxJQUFJLEVBQUUsY0FBYyxFQUFFO1lBQ3hELFVBQVUsRUFBRSx5QkFBeUIsV0FBVyxFQUFFO1lBQ2xELGNBQWMsRUFBRTtnQkFDZCxPQUFPLEVBQUUsWUFBWTtnQkFDckIsU0FBUyxFQUFFO29CQUNUO3dCQUNFLE1BQU0sRUFBRSxPQUFPO3dCQUNmLE1BQU0sRUFBRTs0QkFDTixhQUFhOzRCQUNiLGFBQWE7NEJBQ2IsZUFBZTs0QkFDZixhQUFhO3lCQUNkO3dCQUNELFFBQVEsRUFBRTs0QkFDUixlQUFlLElBQUksQ0FBQyxNQUFNLElBQUksSUFBSSxDQUFDLE9BQU8sMEJBQTBCOzRCQUNwRSxlQUFlLElBQUksQ0FBQyxNQUFNLElBQUksSUFBSSxDQUFDLE9BQU8sb0JBQW9CLFdBQVcscUJBQXFCOzRCQUM5RixlQUFlLElBQUksQ0FBQyxNQUFNLElBQUksSUFBSSxDQUFDLE9BQU8sMEJBQTBCLFdBQVcscUJBQXFCO3lCQUNyRztxQkFDRjtpQkFDRjthQUNGO1NBQ0YsQ0FBQyxDQUFDO1FBRUgsVUFBVTtRQUNWLElBQUksR0FBRyxDQUFDLFNBQVMsQ0FBQyxJQUFJLEVBQUUsZ0JBQWdCLEVBQUU7WUFDeEMsS0FBSyxFQUFFLElBQUksQ0FBQyxVQUFVLENBQUMsVUFBVTtZQUNqQyxXQUFXLEVBQUUsdUNBQXVDO1NBQ3JELENBQUMsQ0FBQztRQUVILElBQUksR0FBRyxDQUFDLFNBQVMsQ0FBQyxJQUFJLEVBQUUsaUJBQWlCLEVBQUU7WUFDekMsS0FBSyxFQUFFLElBQUksQ0FBQyxXQUFXLENBQUMsU0FBUztZQUNqQyxXQUFXLEVBQUUsd0NBQXdDO1NBQ3RELENBQUMsQ0FBQztRQUVILElBQUksR0FBRyxDQUFDLFNBQVMsQ0FBQyxJQUFJLEVBQUUsbUJBQW1CLEVBQUU7WUFDM0MsS0FBSyxFQUFFLElBQUksQ0FBQyxhQUFhLENBQUMsU0FBUztZQUNuQyxXQUFXLEVBQUUsMENBQTBDO1NBQ3hELENBQUMsQ0FBQztRQUVILElBQUksR0FBRyxDQUFDLFNBQVMsQ0FBQyxJQUFJLEVBQUUsZUFBZSxFQUFFO1lBQ3ZDLEtBQUssRUFBRSxTQUFTLENBQUMsVUFBVztZQUM1QixXQUFXLEVBQUUsb0NBQW9DO1NBQ2xELENBQUMsQ0FBQztRQUVILElBQUksR0FBRyxDQUFDLFNBQVMsQ0FBQyxJQUFJLEVBQUUsbUJBQW1CLEVBQUU7WUFDM0MsS0FBSyxFQUFFLElBQUksQ0FBQyxhQUFhLENBQUMsVUFBVTtZQUNwQyxXQUFXLEVBQUUseUNBQXlDO1NBQ3ZELENBQUMsQ0FBQztRQUVILElBQUksR0FBRyxDQUFDLFNBQVMsQ0FBQyxJQUFJLEVBQUUsa0JBQWtCLEVBQUU7WUFDMUMsS0FBSyxFQUFFLElBQUksQ0FBQyxhQUFhLENBQUMsU0FBUztZQUNuQyxXQUFXLEVBQUUsMkJBQTJCO1NBQ3pDLENBQUMsQ0FBQztRQUVILElBQUksR0FBRyxDQUFDLFNBQVMsQ0FBQyxJQUFJLEVBQUUsbUJBQW1CLEVBQUU7WUFDM0MsS0FBSyxFQUFFLGNBQWMsQ0FBQyxPQUFPO1lBQzdCLFdBQVcsRUFBRSxpREFBaUQ7U0FDL0QsQ0FBQyxDQUFDO1FBRUgsb0JBQW9CO1FBQ3BCLEdBQUcsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLElBQUksQ0FBQyxDQUFDLEdBQUcsQ0FBQyxTQUFTLEVBQUUsY0FBYyxDQUFDLENBQUM7UUFDakQsR0FBRyxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFDLENBQUMsR0FBRyxDQUFDLGFBQWEsRUFBRSxXQUFXLENBQUMsQ0FBQztRQUNsRCxHQUFHLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxJQUFJLENBQUMsQ0FBQyxHQUFHLENBQUMsV0FBVyxFQUFFLEtBQUssQ0FBQyxDQUFDO0lBQzVDLENBQUM7Q0FDRjtBQWxLRCxrREFrS0MiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgKiBhcyBjZGsgZnJvbSAnYXdzLWNkay1saWInO1xyXG5pbXBvcnQgKiBhcyBzMyBmcm9tICdhd3MtY2RrLWxpYi9hd3MtczMnO1xyXG5pbXBvcnQgKiBhcyBkeW5hbW9kYiBmcm9tICdhd3MtY2RrLWxpYi9hd3MtZHluYW1vZGInO1xyXG5pbXBvcnQgKiBhcyBpb3QgZnJvbSAnYXdzLWNkay1saWIvYXdzLWlvdCc7XHJcbmltcG9ydCAqIGFzIGlhbSBmcm9tICdhd3MtY2RrLWxpYi9hd3MtaWFtJztcclxuaW1wb3J0ICogYXMga2luZXNpcyBmcm9tICdhd3MtY2RrLWxpYi9hd3Mta2luZXNpcyc7XHJcbmltcG9ydCB7IENvbnN0cnVjdCB9IGZyb20gJ2NvbnN0cnVjdHMnO1xyXG5cclxuaW50ZXJmYWNlIFRyYW5zcG9ydEluZnJhU3RhY2tQcm9wcyBleHRlbmRzIGNkay5TdGFja1Byb3BzIHtcclxuICBlbnZpcm9ubWVudDogc3RyaW5nO1xyXG59XHJcblxyXG5leHBvcnQgY2xhc3MgVHJhbnNwb3J0SW5mcmFTdGFjayBleHRlbmRzIGNkay5TdGFjayB7XHJcbiAgcHVibGljIHJlYWRvbmx5IGRhdGFCdWNrZXQ6IHMzLkJ1Y2tldDtcclxuICBwdWJsaWMgcmVhZG9ubHkgZGV2aWNlVGFibGU6IGR5bmFtb2RiLlRhYmxlO1xyXG4gIHB1YmxpYyByZWFkb25seSBsb2NhdGlvblRhYmxlOiBkeW5hbW9kYi5UYWJsZTtcclxuICBwdWJsaWMgcmVhZG9ubHkgZ3BzRGF0YVN0cmVhbToga2luZXNpcy5TdHJlYW07XHJcblxyXG4gIGNvbnN0cnVjdG9yKHNjb3BlOiBDb25zdHJ1Y3QsIGlkOiBzdHJpbmcsIHByb3BzOiBUcmFuc3BvcnRJbmZyYVN0YWNrUHJvcHMpIHtcclxuICAgIHN1cGVyKHNjb3BlLCBpZCwgcHJvcHMpO1xyXG5cclxuICAgIGNvbnN0IHsgZW52aXJvbm1lbnQgfSA9IHByb3BzO1xyXG5cclxuICAgIC8vIFMzIEJ1Y2tldCBmb3Igc3RvcmluZyBkZXZpY2UgZGF0YVxyXG4gICAgdGhpcy5kYXRhQnVja2V0ID0gbmV3IHMzLkJ1Y2tldCh0aGlzLCAnRGV2aWNlRGF0YUJ1Y2tldCcsIHtcclxuICAgICAgYnVja2V0TmFtZTogYHRyYW5zcG9ydC1ncHMtZGF0YS0ke2Vudmlyb25tZW50fS0ke3RoaXMuYWNjb3VudH1gLFxyXG4gICAgICBlbmNyeXB0aW9uOiBzMy5CdWNrZXRFbmNyeXB0aW9uLlMzX01BTkFHRUQsXHJcbiAgICAgIHZlcnNpb25lZDogdHJ1ZSxcclxuICAgICAgbGlmZWN5Y2xlUnVsZXM6IFtcclxuICAgICAgICB7XHJcbiAgICAgICAgICBpZDogJ2RlbGV0ZS1vbGQtZGF0YScsXHJcbiAgICAgICAgICBlbmFibGVkOiB0cnVlLFxyXG4gICAgICAgICAgZXhwaXJhdGlvbjogY2RrLkR1cmF0aW9uLmRheXMoZW52aXJvbm1lbnQgPT09ICdwcm9kJyA/IDkwIDogMzApLFxyXG4gICAgICAgIH0sXHJcbiAgICAgIF0sXHJcbiAgICAgIHJlbW92YWxQb2xpY3k6IGVudmlyb25tZW50ID09PSAncHJvZCcgXHJcbiAgICAgICAgPyBjZGsuUmVtb3ZhbFBvbGljeS5SRVRBSU4gXHJcbiAgICAgICAgOiBjZGsuUmVtb3ZhbFBvbGljeS5ERVNUUk9ZLFxyXG4gICAgICBhdXRvRGVsZXRlT2JqZWN0czogZW52aXJvbm1lbnQgIT09ICdwcm9kJyxcclxuICAgIH0pO1xyXG5cclxuICAgIC8vIER5bmFtb0RCIHRhYmxlIGZvciBkZXZpY2UgcmVnaXN0cnlcclxuICAgIHRoaXMuZGV2aWNlVGFibGUgPSBuZXcgZHluYW1vZGIuVGFibGUodGhpcywgJ0RldmljZVRhYmxlJywge1xyXG4gICAgICB0YWJsZU5hbWU6IGB0cmFuc3BvcnQtZGV2aWNlcy0ke2Vudmlyb25tZW50fWAsXHJcbiAgICAgIHBhcnRpdGlvbktleTogeyBuYW1lOiAnZGV2aWNlSWQnLCB0eXBlOiBkeW5hbW9kYi5BdHRyaWJ1dGVUeXBlLlNUUklORyB9LFxyXG4gICAgICBiaWxsaW5nTW9kZTogZHluYW1vZGIuQmlsbGluZ01vZGUuUEFZX1BFUl9SRVFVRVNULFxyXG4gICAgICBlbmNyeXB0aW9uOiBkeW5hbW9kYi5UYWJsZUVuY3J5cHRpb24uQVdTX01BTkFHRUQsXHJcbiAgICAgIHBvaW50SW5UaW1lUmVjb3ZlcnlTcGVjaWZpY2F0aW9uOiB7XHJcbiAgICAgICAgcG9pbnRJblRpbWVSZWNvdmVyeUVuYWJsZWQ6IGVudmlyb25tZW50ID09PSAncHJvZCcsXHJcbiAgICAgIH0sXHJcbiAgICAgIHJlbW92YWxQb2xpY3k6IGVudmlyb25tZW50ID09PSAncHJvZCcgXHJcbiAgICAgICAgPyBjZGsuUmVtb3ZhbFBvbGljeS5SRVRBSU4gXHJcbiAgICAgICAgOiBjZGsuUmVtb3ZhbFBvbGljeS5ERVNUUk9ZLFxyXG4gICAgfSk7XHJcblxyXG4gICAgLy8gRHluYW1vREIgdGFibGUgZm9yIGxvY2F0aW9uIGRhdGFcclxuICAgIHRoaXMubG9jYXRpb25UYWJsZSA9IG5ldyBkeW5hbW9kYi5UYWJsZSh0aGlzLCAnTG9jYXRpb25UYWJsZScsIHtcclxuICAgICAgdGFibGVOYW1lOiBgdHJhbnNwb3J0LWxvY2F0aW9ucy0ke2Vudmlyb25tZW50fWAsXHJcbiAgICAgIHBhcnRpdGlvbktleTogeyBuYW1lOiAnZGV2aWNlSWQnLCB0eXBlOiBkeW5hbW9kYi5BdHRyaWJ1dGVUeXBlLlNUUklORyB9LFxyXG4gICAgICBzb3J0S2V5OiB7IG5hbWU6ICd0aW1lc3RhbXAnLCB0eXBlOiBkeW5hbW9kYi5BdHRyaWJ1dGVUeXBlLk5VTUJFUiB9LFxyXG4gICAgICBiaWxsaW5nTW9kZTogZHluYW1vZGIuQmlsbGluZ01vZGUuUEFZX1BFUl9SRVFVRVNULFxyXG4gICAgICBlbmNyeXB0aW9uOiBkeW5hbW9kYi5UYWJsZUVuY3J5cHRpb24uQVdTX01BTkFHRUQsXHJcbiAgICAgIHBvaW50SW5UaW1lUmVjb3Zlcnk6IGVudmlyb25tZW50ID09PSAncHJvZCcsXHJcbiAgICAgIHJlbW92YWxQb2xpY3k6IGVudmlyb25tZW50ID09PSAncHJvZCcgXHJcbiAgICAgICAgPyBjZGsuUmVtb3ZhbFBvbGljeS5SRVRBSU4gXHJcbiAgICAgICAgOiBjZGsuUmVtb3ZhbFBvbGljeS5ERVNUUk9ZLFxyXG4gICAgfSk7XHJcblxyXG4gICAgLy8gQWRkIEdTSSBmb3IgcXVlcnlpbmcgYnkgdGltZSByYW5nZVxyXG4gICAgdGhpcy5sb2NhdGlvblRhYmxlLmFkZEdsb2JhbFNlY29uZGFyeUluZGV4KHtcclxuICAgICAgaW5kZXhOYW1lOiAnVGltZXN0YW1wSW5kZXgnLFxyXG4gICAgICBwYXJ0aXRpb25LZXk6IHsgbmFtZTogJ2RhdGUnLCB0eXBlOiBkeW5hbW9kYi5BdHRyaWJ1dGVUeXBlLlNUUklORyB9LFxyXG4gICAgICBzb3J0S2V5OiB7IG5hbWU6ICd0aW1lc3RhbXAnLCB0eXBlOiBkeW5hbW9kYi5BdHRyaWJ1dGVUeXBlLk5VTUJFUiB9LFxyXG4gICAgfSk7XHJcblxyXG4gICAgLy8gS2luZXNpcyBEYXRhIFN0cmVhbSBmb3IgR1BTIGRhdGFcclxuICAgIHRoaXMuZ3BzRGF0YVN0cmVhbSA9IG5ldyBraW5lc2lzLlN0cmVhbSh0aGlzLCAnR1BTRGF0YVN0cmVhbScsIHtcclxuICAgICAgc3RyZWFtTmFtZTogYHRyYW5zcG9ydC1ncHMtc3RyZWFtLSR7ZW52aXJvbm1lbnR9YCxcclxuICAgICAgc2hhcmRDb3VudDogZW52aXJvbm1lbnQgPT09ICdwcm9kJyA/IDIgOiAxLFxyXG4gICAgICByZXRlbnRpb25QZXJpb2Q6IGNkay5EdXJhdGlvbi5ob3VycygyNCksXHJcbiAgICAgIGVuY3J5cHRpb246IGtpbmVzaXMuU3RyZWFtRW5jcnlwdGlvbi5NQU5BR0VELFxyXG4gICAgICBzdHJlYW1Nb2RlOiBraW5lc2lzLlN0cmVhbU1vZGUuUFJPVklTSU9ORUQsXHJcbiAgICB9KTtcclxuXHJcbiAgICAvLyBBZGQgQ2xvdWRXYXRjaCBhbGFybXMgZm9yIEtpbmVzaXNcclxuICAgIHRoaXMuZ3BzRGF0YVN0cmVhbS5tZXRyaWNHZXRSZWNvcmRzU3VjY2VzcygpLmNyZWF0ZUFsYXJtKHRoaXMsICdTdHJlYW1SZWFkQWxhcm0nLCB7XHJcbiAgICAgIHRocmVzaG9sZDogMC45NSxcclxuICAgICAgZXZhbHVhdGlvblBlcmlvZHM6IDIsXHJcbiAgICAgIHRyZWF0TWlzc2luZ0RhdGE6IGNkay5hd3NfY2xvdWR3YXRjaC5UcmVhdE1pc3NpbmdEYXRhLkJSRUFDSElORyxcclxuICAgICAgYWxhcm1EZXNjcmlwdGlvbjogJ0FsYXJtIHdoZW4gc3RyZWFtIHJlYWQgc3VjY2VzcyByYXRlIGRyb3BzIGJlbG93IDk1JScsXHJcbiAgICB9KTtcclxuXHJcbiAgICAvLyBHcmFudCBJb1QgQ29yZSBwZXJtaXNzaW9uIHRvIHdyaXRlIHRvIEtpbmVzaXNcclxuICAgIGNvbnN0IGlvdEtpbmVzaXNSb2xlID0gbmV3IGlhbS5Sb2xlKHRoaXMsICdJb1RLaW5lc2lzUm9sZScsIHtcclxuICAgICAgYXNzdW1lZEJ5OiBuZXcgaWFtLlNlcnZpY2VQcmluY2lwYWwoJ2lvdC5hbWF6b25hd3MuY29tJyksXHJcbiAgICAgIGRlc2NyaXB0aW9uOiAnUm9sZSBmb3IgSW9UIENvcmUgdG8gd3JpdGUgdG8gS2luZXNpcycsXHJcbiAgICB9KTtcclxuXHJcbiAgICB0aGlzLmdwc0RhdGFTdHJlYW0uZ3JhbnRXcml0ZShpb3RLaW5lc2lzUm9sZSk7XHJcblxyXG4gICAgLy8gSW9UIFRoaW5nIFR5cGUgZm9yIEdQUyBkZXZpY2VzXHJcbiAgICBjb25zdCBkZXZpY2VUaGluZ1R5cGUgPSBuZXcgaW90LkNmblRoaW5nVHlwZSh0aGlzLCAnR1BTRGV2aWNlVHlwZScsIHtcclxuICAgICAgdGhpbmdUeXBlTmFtZTogYFRyYW5zcG9ydEdQU0RldmljZS0ke2Vudmlyb25tZW50fWAsXHJcbiAgICAgIHRoaW5nVHlwZVByb3BlcnRpZXM6IHtcclxuICAgICAgICB0aGluZ1R5cGVEZXNjcmlwdGlvbjogJ0dQUyB0cmFja2luZyBkZXZpY2UgZm9yIHRyYW5zcG9ydCB2ZWhpY2xlcycsXHJcbiAgICAgICAgc2VhcmNoYWJsZUF0dHJpYnV0ZXM6IFsnZGV2aWNlTW9kZWwnLCAnZmlybXdhcmVWZXJzaW9uJywgJ3ZlaGljbGVJZCddLFxyXG4gICAgICB9LFxyXG4gICAgfSk7XHJcblxyXG4gICAgLy8gSW9UIFBvbGljeSBmb3IgZGV2aWNlc1xyXG4gICAgY29uc3QgaW90UG9saWN5ID0gbmV3IGlvdC5DZm5Qb2xpY3kodGhpcywgJ0RldmljZVBvbGljeScsIHtcclxuICAgICAgcG9saWN5TmFtZTogYFRyYW5zcG9ydERldmljZVBvbGljeS0ke2Vudmlyb25tZW50fWAsXHJcbiAgICAgIHBvbGljeURvY3VtZW50OiB7XHJcbiAgICAgICAgVmVyc2lvbjogJzIwMTItMTAtMTcnLFxyXG4gICAgICAgIFN0YXRlbWVudDogW1xyXG4gICAgICAgICAge1xyXG4gICAgICAgICAgICBFZmZlY3Q6ICdBbGxvdycsXHJcbiAgICAgICAgICAgIEFjdGlvbjogW1xyXG4gICAgICAgICAgICAgICdpb3Q6Q29ubmVjdCcsXHJcbiAgICAgICAgICAgICAgJ2lvdDpQdWJsaXNoJyxcclxuICAgICAgICAgICAgICAnaW90OlN1YnNjcmliZScsXHJcbiAgICAgICAgICAgICAgJ2lvdDpSZWNlaXZlJyxcclxuICAgICAgICAgICAgXSxcclxuICAgICAgICAgICAgUmVzb3VyY2U6IFtcclxuICAgICAgICAgICAgICBgYXJuOmF3czppb3Q6JHt0aGlzLnJlZ2lvbn06JHt0aGlzLmFjY291bnR9OmNsaWVudC9cXCR7aW90OkNsaWVudElkfWAsXHJcbiAgICAgICAgICAgICAgYGFybjphd3M6aW90OiR7dGhpcy5yZWdpb259OiR7dGhpcy5hY2NvdW50fTp0b3BpYy90cmFuc3BvcnQvJHtlbnZpcm9ubWVudH0vXFwke2lvdDpDbGllbnRJZH0vKmAsXHJcbiAgICAgICAgICAgICAgYGFybjphd3M6aW90OiR7dGhpcy5yZWdpb259OiR7dGhpcy5hY2NvdW50fTp0b3BpY2ZpbHRlci90cmFuc3BvcnQvJHtlbnZpcm9ubWVudH0vXFwke2lvdDpDbGllbnRJZH0vKmAsXHJcbiAgICAgICAgICAgIF0sXHJcbiAgICAgICAgICB9LFxyXG4gICAgICAgIF0sXHJcbiAgICAgIH0sXHJcbiAgICB9KTtcclxuXHJcbiAgICAvLyBPdXRwdXRzXHJcbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnRGF0YUJ1Y2tldE5hbWUnLCB7XHJcbiAgICAgIHZhbHVlOiB0aGlzLmRhdGFCdWNrZXQuYnVja2V0TmFtZSxcclxuICAgICAgZGVzY3JpcHRpb246ICdOYW1lIG9mIHRoZSBTMyBidWNrZXQgZm9yIGRldmljZSBkYXRhJyxcclxuICAgIH0pO1xyXG5cclxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdEZXZpY2VUYWJsZU5hbWUnLCB7XHJcbiAgICAgIHZhbHVlOiB0aGlzLmRldmljZVRhYmxlLnRhYmxlTmFtZSxcclxuICAgICAgZGVzY3JpcHRpb246ICdOYW1lIG9mIHRoZSBEeW5hbW9EQiB0YWJsZSBmb3IgZGV2aWNlcycsXHJcbiAgICB9KTtcclxuXHJcbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnTG9jYXRpb25UYWJsZU5hbWUnLCB7XHJcbiAgICAgIHZhbHVlOiB0aGlzLmxvY2F0aW9uVGFibGUudGFibGVOYW1lLFxyXG4gICAgICBkZXNjcmlwdGlvbjogJ05hbWUgb2YgdGhlIER5bmFtb0RCIHRhYmxlIGZvciBsb2NhdGlvbnMnLFxyXG4gICAgfSk7XHJcblxyXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ0lvVFBvbGljeU5hbWUnLCB7XHJcbiAgICAgIHZhbHVlOiBpb3RQb2xpY3kucG9saWN5TmFtZSEsXHJcbiAgICAgIGRlc2NyaXB0aW9uOiAnTmFtZSBvZiB0aGUgSW9UIHBvbGljeSBmb3IgZGV2aWNlcycsXHJcbiAgICB9KTtcclxuXHJcbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnS2luZXNpc1N0cmVhbU5hbWUnLCB7XHJcbiAgICAgIHZhbHVlOiB0aGlzLmdwc0RhdGFTdHJlYW0uc3RyZWFtTmFtZSxcclxuICAgICAgZGVzY3JpcHRpb246ICdOYW1lIG9mIHRoZSBLaW5lc2lzIHN0cmVhbSBmb3IgR1BTIGRhdGEnLFxyXG4gICAgfSk7XHJcblxyXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ0tpbmVzaXNTdHJlYW1Bcm4nLCB7XHJcbiAgICAgIHZhbHVlOiB0aGlzLmdwc0RhdGFTdHJlYW0uc3RyZWFtQXJuLFxyXG4gICAgICBkZXNjcmlwdGlvbjogJ0FSTiBvZiB0aGUgS2luZXNpcyBzdHJlYW0nLFxyXG4gICAgfSk7XHJcblxyXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ0lvVEtpbmVzaXNSb2xlQXJuJywge1xyXG4gICAgICB2YWx1ZTogaW90S2luZXNpc1JvbGUucm9sZUFybixcclxuICAgICAgZGVzY3JpcHRpb246ICdBUk4gb2YgdGhlIElBTSByb2xlIGZvciBJb1QgdG8gd3JpdGUgdG8gS2luZXNpcycsXHJcbiAgICB9KTtcclxuXHJcbiAgICAvLyBUYWcgYWxsIHJlc291cmNlc1xyXG4gICAgY2RrLlRhZ3Mub2YodGhpcykuYWRkKCdQcm9qZWN0JywgJ1RyYW5zcG9ydEdQUycpO1xyXG4gICAgY2RrLlRhZ3Mub2YodGhpcykuYWRkKCdFbnZpcm9ubWVudCcsIGVudmlyb25tZW50KTtcclxuICAgIGNkay5UYWdzLm9mKHRoaXMpLmFkZCgnTWFuYWdlZEJ5JywgJ0NESycpO1xyXG4gIH1cclxufSJdfQ==