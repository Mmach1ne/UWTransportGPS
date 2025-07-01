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
            pointInTimeRecovery: environment === 'prod',
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
        // Tag all resources
        cdk.Tags.of(this).add('Project', 'TransportGPS');
        cdk.Tags.of(this).add('Environment', environment);
        cdk.Tags.of(this).add('ManagedBy', 'CDK');
    }
}
exports.TransportInfraStack = TransportInfraStack;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidHJhbnNwb3J0LWluZnJhLXN0YWNrLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsidHJhbnNwb3J0LWluZnJhLXN0YWNrLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQUEsaURBQW1DO0FBQ25DLHVEQUF5QztBQUN6QyxtRUFBcUQ7QUFDckQseURBQTJDO0FBUTNDLE1BQWEsbUJBQW9CLFNBQVEsR0FBRyxDQUFDLEtBQUs7SUFLaEQsWUFBWSxLQUFnQixFQUFFLEVBQVUsRUFBRSxLQUErQjtRQUN2RSxLQUFLLENBQUMsS0FBSyxFQUFFLEVBQUUsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUV4QixNQUFNLEVBQUUsV0FBVyxFQUFFLEdBQUcsS0FBSyxDQUFDO1FBRTlCLG9DQUFvQztRQUNwQyxJQUFJLENBQUMsVUFBVSxHQUFHLElBQUksRUFBRSxDQUFDLE1BQU0sQ0FBQyxJQUFJLEVBQUUsa0JBQWtCLEVBQUU7WUFDeEQsVUFBVSxFQUFFLHNCQUFzQixXQUFXLElBQUksSUFBSSxDQUFDLE9BQU8sRUFBRTtZQUMvRCxVQUFVLEVBQUUsRUFBRSxDQUFDLGdCQUFnQixDQUFDLFVBQVU7WUFDMUMsU0FBUyxFQUFFLElBQUk7WUFDZixjQUFjLEVBQUU7Z0JBQ2Q7b0JBQ0UsRUFBRSxFQUFFLGlCQUFpQjtvQkFDckIsT0FBTyxFQUFFLElBQUk7b0JBQ2IsVUFBVSxFQUFFLEdBQUcsQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLFdBQVcsS0FBSyxNQUFNLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDO2lCQUNoRTthQUNGO1lBQ0QsYUFBYSxFQUFFLFdBQVcsS0FBSyxNQUFNO2dCQUNuQyxDQUFDLENBQUMsR0FBRyxDQUFDLGFBQWEsQ0FBQyxNQUFNO2dCQUMxQixDQUFDLENBQUMsR0FBRyxDQUFDLGFBQWEsQ0FBQyxPQUFPO1lBQzdCLGlCQUFpQixFQUFFLFdBQVcsS0FBSyxN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QUFDLEVBQUUsQ0FBQyxJQUFJLENBQUMsQ0FBQyxHQUFHLENBQUMsV0FBVyxFQUFFLEtBQUssQ0FBQyxDQUFDO0lBQzVDLENBQUM7Q0FDRjtBQXZIRCxrREF1SEMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgKiBhcyBjZGsgZnJvbSAnYXdzLWNkay1saWInO1xyXG5pbXBvcnQgKiBhcyBzMyBmcm9tICdhd3MtY2RrLWxpYi9hd3MtczMnO1xyXG5pbXBvcnQgKiBhcyBkeW5hbW9kYiBmcm9tICdhd3MtY2RrLWxpYi9hd3MtZHluYW1vZGInO1xyXG5pbXBvcnQgKiBhcyBpb3QgZnJvbSAnYXdzLWNkay1saWIvYXdzLWlvdCc7XHJcbmltcG9ydCAqIGFzIGlhbSBmcm9tICdhd3MtY2RrLWxpYi9hd3MtaWFtJztcclxuaW1wb3J0IHsgQ29uc3RydWN0IH0gZnJvbSAnY29uc3RydWN0cyc7XHJcblxyXG5pbnRlcmZhY2UgVHJhbnNwb3J0SW5mcmFTdGFja1Byb3BzIGV4dGVuZHMgY2RrLlN0YWNrUHJvcHMge1xyXG4gIGVudmlyb25tZW50OiBzdHJpbmc7XHJcbn1cclxuXHJcbmV4cG9ydCBjbGFzcyBUcmFuc3BvcnRJbmZyYVN0YWNrIGV4dGVuZHMgY2RrLlN0YWNrIHtcclxuICBwdWJsaWMgcmVhZG9ubHkgZGF0YUJ1Y2tldDogczMuQnVja2V0O1xyXG4gIHB1YmxpYyByZWFkb25seSBkZXZpY2VUYWJsZTogZHluYW1vZGIuVGFibGU7XHJcbiAgcHVibGljIHJlYWRvbmx5IGxvY2F0aW9uVGFibGU6IGR5bmFtb2RiLlRhYmxlO1xyXG5cclxuICBjb25zdHJ1Y3RvcihzY29wZTogQ29uc3RydWN0LCBpZDogc3RyaW5nLCBwcm9wczogVHJhbnNwb3J0SW5mcmFTdGFja1Byb3BzKSB7XHJcbiAgICBzdXBlcihzY29wZSwgaWQsIHByb3BzKTtcclxuXHJcbiAgICBjb25zdCB7IGVudmlyb25tZW50IH0gPSBwcm9wcztcclxuXHJcbiAgICAvLyBTMyBCdWNrZXQgZm9yIHN0b3JpbmcgZGV2aWNlIGRhdGFcclxuICAgIHRoaXMuZGF0YUJ1Y2tldCA9IG5ldyBzMy5CdWNrZXQodGhpcywgJ0RldmljZURhdGFCdWNrZXQnLCB7XHJcbiAgICAgIGJ1Y2tldE5hbWU6IGB0cmFuc3BvcnQtZ3BzLWRhdGEtJHtlbnZpcm9ubWVudH0tJHt0aGlzLmFjY291bnR9YCxcclxuICAgICAgZW5jcnlwdGlvbjogczMuQnVja2V0RW5jcnlwdGlvbi5TM19NQU5BR0VELFxyXG4gICAgICB2ZXJzaW9uZWQ6IHRydWUsXHJcbiAgICAgIGxpZmVjeWNsZVJ1bGVzOiBbXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgaWQ6ICdkZWxldGUtb2xkLWRhdGEnLFxyXG4gICAgICAgICAgZW5hYmxlZDogdHJ1ZSxcclxuICAgICAgICAgIGV4cGlyYXRpb246IGNkay5EdXJhdGlvbi5kYXlzKGVudmlyb25tZW50ID09PSAncHJvZCcgPyA5MCA6IDMwKSxcclxuICAgICAgICB9LFxyXG4gICAgICBdLFxyXG4gICAgICByZW1vdmFsUG9saWN5OiBlbnZpcm9ubWVudCA9PT0gJ3Byb2QnIFxyXG4gICAgICAgID8gY2RrLlJlbW92YWxQb2xpY3kuUkVUQUlOIFxyXG4gICAgICAgIDogY2RrLlJlbW92YWxQb2xpY3kuREVTVFJPWSxcclxuICAgICAgYXV0b0RlbGV0ZU9iamVjdHM6IGVudmlyb25tZW50ICE9PSAncHJvZCcsXHJcbiAgICB9KTtcclxuXHJcbiAgICAvLyBEeW5hbW9EQiB0YWJsZSBmb3IgZGV2aWNlIHJlZ2lzdHJ5XHJcbiAgICB0aGlzLmRldmljZVRhYmxlID0gbmV3IGR5bmFtb2RiLlRhYmxlKHRoaXMsICdEZXZpY2VUYWJsZScsIHtcclxuICAgICAgdGFibGVOYW1lOiBgdHJhbnNwb3J0LWRldmljZXMtJHtlbnZpcm9ubWVudH1gLFxyXG4gICAgICBwYXJ0aXRpb25LZXk6IHsgbmFtZTogJ2RldmljZUlkJywgdHlwZTogZHluYW1vZGIuQXR0cmlidXRlVHlwZS5TVFJJTkcgfSxcclxuICAgICAgYmlsbGluZ01vZGU6IGR5bmFtb2RiLkJpbGxpbmdNb2RlLlBBWV9QRVJfUkVRVUVTVCxcclxuICAgICAgZW5jcnlwdGlvbjogZHluYW1vZGIuVGFibGVFbmNyeXB0aW9uLkFXU19NQU5BR0VELFxyXG4gICAgICBwb2ludEluVGltZVJlY292ZXJ5OiBlbnZpcm9ubWVudCA9PT0gJ3Byb2QnLFxyXG4gICAgICByZW1vdmFsUG9saWN5OiBlbnZpcm9ubWVudCA9PT0gJ3Byb2QnIFxyXG4gICAgICAgID8gY2RrLlJlbW92YWxQb2xpY3kuUkVUQUlOIFxyXG4gICAgICAgIDogY2RrLlJlbW92YWxQb2xpY3kuREVTVFJPWSxcclxuICAgIH0pO1xyXG5cclxuICAgIC8vIER5bmFtb0RCIHRhYmxlIGZvciBsb2NhdGlvbiBkYXRhXHJcbiAgICB0aGlzLmxvY2F0aW9uVGFibGUgPSBuZXcgZHluYW1vZGIuVGFibGUodGhpcywgJ0xvY2F0aW9uVGFibGUnLCB7XHJcbiAgICAgIHRhYmxlTmFtZTogYHRyYW5zcG9ydC1sb2NhdGlvbnMtJHtlbnZpcm9ubWVudH1gLFxyXG4gICAgICBwYXJ0aXRpb25LZXk6IHsgbmFtZTogJ2RldmljZUlkJywgdHlwZTogZHluYW1vZGIuQXR0cmlidXRlVHlwZS5TVFJJTkcgfSxcclxuICAgICAgc29ydEtleTogeyBuYW1lOiAndGltZXN0YW1wJywgdHlwZTogZHluYW1vZGIuQXR0cmlidXRlVHlwZS5OVU1CRVIgfSxcclxuICAgICAgYmlsbGluZ01vZGU6IGR5bmFtb2RiLkJpbGxpbmdNb2RlLlBBWV9QRVJfUkVRVUVTVCxcclxuICAgICAgZW5jcnlwdGlvbjogZHluYW1vZGIuVGFibGVFbmNyeXB0aW9uLkFXU19NQU5BR0VELFxyXG4gICAgICBwb2ludEluVGltZVJlY292ZXJ5OiBlbnZpcm9ubWVudCA9PT0gJ3Byb2QnLFxyXG4gICAgICByZW1vdmFsUG9saWN5OiBlbnZpcm9ubWVudCA9PT0gJ3Byb2QnIFxyXG4gICAgICAgID8gY2RrLlJlbW92YWxQb2xpY3kuUkVUQUlOIFxyXG4gICAgICAgIDogY2RrLlJlbW92YWxQb2xpY3kuREVTVFJPWSxcclxuICAgIH0pO1xyXG5cclxuICAgIC8vIEFkZCBHU0kgZm9yIHF1ZXJ5aW5nIGJ5IHRpbWUgcmFuZ2VcclxuICAgIHRoaXMubG9jYXRpb25UYWJsZS5hZGRHbG9iYWxTZWNvbmRhcnlJbmRleCh7XHJcbiAgICAgIGluZGV4TmFtZTogJ1RpbWVzdGFtcEluZGV4JyxcclxuICAgICAgcGFydGl0aW9uS2V5OiB7IG5hbWU6ICdkYXRlJywgdHlwZTogZHluYW1vZGIuQXR0cmlidXRlVHlwZS5TVFJJTkcgfSxcclxuICAgICAgc29ydEtleTogeyBuYW1lOiAndGltZXN0YW1wJywgdHlwZTogZHluYW1vZGIuQXR0cmlidXRlVHlwZS5OVU1CRVIgfSxcclxuICAgIH0pO1xyXG5cclxuICAgIC8vIElvVCBUaGluZyBUeXBlIGZvciBHUFMgZGV2aWNlc1xyXG4gICAgY29uc3QgZGV2aWNlVGhpbmdUeXBlID0gbmV3IGlvdC5DZm5UaGluZ1R5cGUodGhpcywgJ0dQU0RldmljZVR5cGUnLCB7XHJcbiAgICAgIHRoaW5nVHlwZU5hbWU6IGBUcmFuc3BvcnRHUFNEZXZpY2UtJHtlbnZpcm9ubWVudH1gLFxyXG4gICAgICB0aGluZ1R5cGVQcm9wZXJ0aWVzOiB7XHJcbiAgICAgICAgdGhpbmdUeXBlRGVzY3JpcHRpb246ICdHUFMgdHJhY2tpbmcgZGV2aWNlIGZvciB0cmFuc3BvcnQgdmVoaWNsZXMnLFxyXG4gICAgICAgIHNlYXJjaGFibGVBdHRyaWJ1dGVzOiBbJ2RldmljZU1vZGVsJywgJ2Zpcm13YXJlVmVyc2lvbicsICd2ZWhpY2xlSWQnXSxcclxuICAgICAgfSxcclxuICAgIH0pO1xyXG5cclxuICAgIC8vIElvVCBQb2xpY3kgZm9yIGRldmljZXNcclxuICAgIGNvbnN0IGlvdFBvbGljeSA9IG5ldyBpb3QuQ2ZuUG9saWN5KHRoaXMsICdEZXZpY2VQb2xpY3knLCB7XHJcbiAgICAgIHBvbGljeU5hbWU6IGBUcmFuc3BvcnREZXZpY2VQb2xpY3ktJHtlbnZpcm9ubWVudH1gLFxyXG4gICAgICBwb2xpY3lEb2N1bWVudDoge1xyXG4gICAgICAgIFZlcnNpb246ICcyMDEyLTEwLTE3JyxcclxuICAgICAgICBTdGF0ZW1lbnQ6IFtcclxuICAgICAgICAgIHtcclxuICAgICAgICAgICAgRWZmZWN0OiAnQWxsb3cnLFxyXG4gICAgICAgICAgICBBY3Rpb246IFtcclxuICAgICAgICAgICAgICAnaW90OkNvbm5lY3QnLFxyXG4gICAgICAgICAgICAgICdpb3Q6UHVibGlzaCcsXHJcbiAgICAgICAgICAgICAgJ2lvdDpTdWJzY3JpYmUnLFxyXG4gICAgICAgICAgICAgICdpb3Q6UmVjZWl2ZScsXHJcbiAgICAgICAgICAgIF0sXHJcbiAgICAgICAgICAgIFJlc291cmNlOiBbXHJcbiAgICAgICAgICAgICAgYGFybjphd3M6aW90OiR7dGhpcy5yZWdpb259OiR7dGhpcy5hY2NvdW50fTpjbGllbnQvXFwke2lvdDpDbGllbnRJZH1gLFxyXG4gICAgICAgICAgICAgIGBhcm46YXdzOmlvdDoke3RoaXMucmVnaW9ufToke3RoaXMuYWNjb3VudH06dG9waWMvdHJhbnNwb3J0LyR7ZW52aXJvbm1lbnR9L1xcJHtpb3Q6Q2xpZW50SWR9LypgLFxyXG4gICAgICAgICAgICAgIGBhcm46YXdzOmlvdDoke3RoaXMucmVnaW9ufToke3RoaXMuYWNjb3VudH06dG9waWNmaWx0ZXIvdHJhbnNwb3J0LyR7ZW52aXJvbm1lbnR9L1xcJHtpb3Q6Q2xpZW50SWR9LypgLFxyXG4gICAgICAgICAgICBdLFxyXG4gICAgICAgICAgfSxcclxuICAgICAgICBdLFxyXG4gICAgICB9LFxyXG4gICAgfSk7XHJcblxyXG4gICAgLy8gT3V0cHV0c1xyXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ0RhdGFCdWNrZXROYW1lJywge1xyXG4gICAgICB2YWx1ZTogdGhpcy5kYXRhQnVja2V0LmJ1Y2tldE5hbWUsXHJcbiAgICAgIGRlc2NyaXB0aW9uOiAnTmFtZSBvZiB0aGUgUzMgYnVja2V0IGZvciBkZXZpY2UgZGF0YScsXHJcbiAgICB9KTtcclxuXHJcbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnRGV2aWNlVGFibGVOYW1lJywge1xyXG4gICAgICB2YWx1ZTogdGhpcy5kZXZpY2VUYWJsZS50YWJsZU5hbWUsXHJcbiAgICAgIGRlc2NyaXB0aW9uOiAnTmFtZSBvZiB0aGUgRHluYW1vREIgdGFibGUgZm9yIGRldmljZXMnLFxyXG4gICAgfSk7XHJcblxyXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ0xvY2F0aW9uVGFibGVOYW1lJywge1xyXG4gICAgICB2YWx1ZTogdGhpcy5sb2NhdGlvblRhYmxlLnRhYmxlTmFtZSxcclxuICAgICAgZGVzY3JpcHRpb246ICdOYW1lIG9mIHRoZSBEeW5hbW9EQiB0YWJsZSBmb3IgbG9jYXRpb25zJyxcclxuICAgIH0pO1xyXG5cclxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdJb1RQb2xpY3lOYW1lJywge1xyXG4gICAgICB2YWx1ZTogaW90UG9saWN5LnBvbGljeU5hbWUhLFxyXG4gICAgICBkZXNjcmlwdGlvbjogJ05hbWUgb2YgdGhlIElvVCBwb2xpY3kgZm9yIGRldmljZXMnLFxyXG4gICAgfSk7XHJcblxyXG4gICAgLy8gVGFnIGFsbCByZXNvdXJjZXNcclxuICAgIGNkay5UYWdzLm9mKHRoaXMpLmFkZCgnUHJvamVjdCcsICdUcmFuc3BvcnRHUFMnKTtcclxuICAgIGNkay5UYWdzLm9mKHRoaXMpLmFkZCgnRW52aXJvbm1lbnQnLCBlbnZpcm9ubWVudCk7XHJcbiAgICBjZGsuVGFncy5vZih0aGlzKS5hZGQoJ01hbmFnZWRCeScsICdDREsnKTtcclxuICB9XHJcbn0iXX0=