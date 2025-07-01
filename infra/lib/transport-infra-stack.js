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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidHJhbnNwb3J0LWluZnJhLXN0YWNrLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsidHJhbnNwb3J0LWluZnJhLXN0YWNrLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQUEsaURBQW1DO0FBQ25DLHVEQUF5QztBQUN6QyxtRUFBcUQ7QUFDckQseURBQTJDO0FBUzNDLE1BQWEsbUJBQW9CLFNBQVEsR0FBRyxDQUFDLEtBQUs7SUFLaEQsWUFBWSxLQUFnQixFQUFFLEVBQVUsRUFBRSxLQUErQjtRQUN2RSxLQUFLLENBQUMsS0FBSyxFQUFFLEVBQUUsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUV4QixNQUFNLEVBQUUsV0FBVyxFQUFFLEdBQUcsS0FBSyxDQUFDO1FBRTlCLG9DQUFvQztRQUNwQyxJQUFJLENBQUMsVUFBVSxHQUFHLElBQUksRUFBRSxDQUFDLE1BQU0sQ0FBQyxJQUFJLEVBQUUsa0JBQWtCLEVBQUU7WUFDeEQsVUFBVSxFQUFFLHNCQUFzQixXQUFXLElBQUksSUFBSSxDQUFDLE9BQU8sRUFBRTtZQUMvRCxVQUFVLEVBQUUsRUFBRSxDQUFDLGdCQUFnQixDQUFDLFVBQVU7WUFDMUMsU0FBUyxFQUFFLElBQUk7WUFDZixjQUFjLEVBQUU7Z0JBQ2Q7b0JBQ0UsRUFBRSxFQUFFLGlCQUFpQjtvQkFDckIsT0FBTyxFQUFFLElBQUk7b0JBQ2IsVUFBVSxFQUFFLEdBQUcsQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLFdBQVcsS0FBSyxNQUFNLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDO2lCQUNoRTthQUNGO1lBQ0QsYUFBYSxFQUFFLFdBQVcsS0FBSyxNQUFNO2dCQUNuQyxDQUFDLENBQUMsR0FBRyxDQUFDLGFBQWEsQ0FBQyxNQUFNO2dCQUMxQixDQUFDLENBQUMsR0FBRyxDQUFDLGFBQWEsQ0FBQyxPQUFPO1lBQzdCLGlCQUFpQixFQUFFLFdBQVcsS0FBSyxN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QUFDLEVBQUUsQ0FBQyxJQUFJLENBQUMsQ0FBQyxHQUFHLENBQUMsV0FBVyxFQUFFLEtBQUssQ0FBQyxDQUFDO0lBQzVDLENBQUM7Q0FDRjtBQXZIRCxrREF1SEMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgKiBhcyBjZGsgZnJvbSAnYXdzLWNkay1saWInO1xyXG5pbXBvcnQgKiBhcyBzMyBmcm9tICdhd3MtY2RrLWxpYi9hd3MtczMnO1xyXG5pbXBvcnQgKiBhcyBkeW5hbW9kYiBmcm9tICdhd3MtY2RrLWxpYi9hd3MtZHluYW1vZGInO1xyXG5pbXBvcnQgKiBhcyBpb3QgZnJvbSAnYXdzLWNkay1saWIvYXdzLWlvdCc7XHJcbmltcG9ydCAqIGFzIGlhbSBmcm9tICdhd3MtY2RrLWxpYi9hd3MtaWFtJztcclxuaW1wb3J0ICogYXMgZG90ZW52IGZyb20gJ2RvdGVudic7XHJcbmltcG9ydCB7IENvbnN0cnVjdCB9IGZyb20gJ2NvbnN0cnVjdHMnO1xyXG5cclxuaW50ZXJmYWNlIFRyYW5zcG9ydEluZnJhU3RhY2tQcm9wcyBleHRlbmRzIGNkay5TdGFja1Byb3BzIHtcclxuICBlbnZpcm9ubWVudDogc3RyaW5nO1xyXG59XHJcblxyXG5leHBvcnQgY2xhc3MgVHJhbnNwb3J0SW5mcmFTdGFjayBleHRlbmRzIGNkay5TdGFjayB7XHJcbiAgcHVibGljIHJlYWRvbmx5IGRhdGFCdWNrZXQ6IHMzLkJ1Y2tldDtcclxuICBwdWJsaWMgcmVhZG9ubHkgZGV2aWNlVGFibGU6IGR5bmFtb2RiLlRhYmxlO1xyXG4gIHB1YmxpYyByZWFkb25seSBsb2NhdGlvblRhYmxlOiBkeW5hbW9kYi5UYWJsZTtcclxuXHJcbiAgY29uc3RydWN0b3Ioc2NvcGU6IENvbnN0cnVjdCwgaWQ6IHN0cmluZywgcHJvcHM6IFRyYW5zcG9ydEluZnJhU3RhY2tQcm9wcykge1xyXG4gICAgc3VwZXIoc2NvcGUsIGlkLCBwcm9wcyk7XHJcblxyXG4gICAgY29uc3QgeyBlbnZpcm9ubWVudCB9ID0gcHJvcHM7XHJcblxyXG4gICAgLy8gUzMgQnVja2V0IGZvciBzdG9yaW5nIGRldmljZSBkYXRhXHJcbiAgICB0aGlzLmRhdGFCdWNrZXQgPSBuZXcgczMuQnVja2V0KHRoaXMsICdEZXZpY2VEYXRhQnVja2V0Jywge1xyXG4gICAgICBidWNrZXROYW1lOiBgdHJhbnNwb3J0LWdwcy1kYXRhLSR7ZW52aXJvbm1lbnR9LSR7dGhpcy5hY2NvdW50fWAsXHJcbiAgICAgIGVuY3J5cHRpb246IHMzLkJ1Y2tldEVuY3J5cHRpb24uUzNfTUFOQUdFRCxcclxuICAgICAgdmVyc2lvbmVkOiB0cnVlLFxyXG4gICAgICBsaWZlY3ljbGVSdWxlczogW1xyXG4gICAgICAgIHtcclxuICAgICAgICAgIGlkOiAnZGVsZXRlLW9sZC1kYXRhJyxcclxuICAgICAgICAgIGVuYWJsZWQ6IHRydWUsXHJcbiAgICAgICAgICBleHBpcmF0aW9uOiBjZGsuRHVyYXRpb24uZGF5cyhlbnZpcm9ubWVudCA9PT0gJ3Byb2QnID8gOTAgOiAzMCksXHJcbiAgICAgICAgfSxcclxuICAgICAgXSxcclxuICAgICAgcmVtb3ZhbFBvbGljeTogZW52aXJvbm1lbnQgPT09ICdwcm9kJyBcclxuICAgICAgICA/IGNkay5SZW1vdmFsUG9saWN5LlJFVEFJTiBcclxuICAgICAgICA6IGNkay5SZW1vdmFsUG9saWN5LkRFU1RST1ksXHJcbiAgICAgIGF1dG9EZWxldGVPYmplY3RzOiBlbnZpcm9ubWVudCAhPT0gJ3Byb2QnLFxyXG4gICAgfSk7XHJcblxyXG4gICAgLy8gRHluYW1vREIgdGFibGUgZm9yIGRldmljZSByZWdpc3RyeVxyXG4gICAgdGhpcy5kZXZpY2VUYWJsZSA9IG5ldyBkeW5hbW9kYi5UYWJsZSh0aGlzLCAnRGV2aWNlVGFibGUnLCB7XHJcbiAgICAgIHRhYmxlTmFtZTogYHRyYW5zcG9ydC1kZXZpY2VzLSR7ZW52aXJvbm1lbnR9YCxcclxuICAgICAgcGFydGl0aW9uS2V5OiB7IG5hbWU6ICdkZXZpY2VJZCcsIHR5cGU6IGR5bmFtb2RiLkF0dHJpYnV0ZVR5cGUuU1RSSU5HIH0sXHJcbiAgICAgIGJpbGxpbmdNb2RlOiBkeW5hbW9kYi5CaWxsaW5nTW9kZS5QQVlfUEVSX1JFUVVFU1QsXHJcbiAgICAgIGVuY3J5cHRpb246IGR5bmFtb2RiLlRhYmxlRW5jcnlwdGlvbi5BV1NfTUFOQUdFRCxcclxuICAgICAgcG9pbnRJblRpbWVSZWNvdmVyeTogZW52aXJvbm1lbnQgPT09ICdwcm9kJyxcclxuICAgICAgcmVtb3ZhbFBvbGljeTogZW52aXJvbm1lbnQgPT09ICdwcm9kJyBcclxuICAgICAgICA/IGNkay5SZW1vdmFsUG9saWN5LlJFVEFJTiBcclxuICAgICAgICA6IGNkay5SZW1vdmFsUG9saWN5LkRFU1RST1ksXHJcbiAgICB9KTtcclxuXHJcbiAgICAvLyBEeW5hbW9EQiB0YWJsZSBmb3IgbG9jYXRpb24gZGF0YVxyXG4gICAgdGhpcy5sb2NhdGlvblRhYmxlID0gbmV3IGR5bmFtb2RiLlRhYmxlKHRoaXMsICdMb2NhdGlvblRhYmxlJywge1xyXG4gICAgICB0YWJsZU5hbWU6IGB0cmFuc3BvcnQtbG9jYXRpb25zLSR7ZW52aXJvbm1lbnR9YCxcclxuICAgICAgcGFydGl0aW9uS2V5OiB7IG5hbWU6ICdkZXZpY2VJZCcsIHR5cGU6IGR5bmFtb2RiLkF0dHJpYnV0ZVR5cGUuU1RSSU5HIH0sXHJcbiAgICAgIHNvcnRLZXk6IHsgbmFtZTogJ3RpbWVzdGFtcCcsIHR5cGU6IGR5bmFtb2RiLkF0dHJpYnV0ZVR5cGUuTlVNQkVSIH0sXHJcbiAgICAgIGJpbGxpbmdNb2RlOiBkeW5hbW9kYi5CaWxsaW5nTW9kZS5QQVlfUEVSX1JFUVVFU1QsXHJcbiAgICAgIGVuY3J5cHRpb246IGR5bmFtb2RiLlRhYmxlRW5jcnlwdGlvbi5BV1NfTUFOQUdFRCxcclxuICAgICAgcG9pbnRJblRpbWVSZWNvdmVyeTogZW52aXJvbm1lbnQgPT09ICdwcm9kJyxcclxuICAgICAgcmVtb3ZhbFBvbGljeTogZW52aXJvbm1lbnQgPT09ICdwcm9kJyBcclxuICAgICAgICA/IGNkay5SZW1vdmFsUG9saWN5LlJFVEFJTiBcclxuICAgICAgICA6IGNkay5SZW1vdmFsUG9saWN5LkRFU1RST1ksXHJcbiAgICB9KTtcclxuXHJcbiAgICAvLyBBZGQgR1NJIGZvciBxdWVyeWluZyBieSB0aW1lIHJhbmdlXHJcbiAgICB0aGlzLmxvY2F0aW9uVGFibGUuYWRkR2xvYmFsU2Vjb25kYXJ5SW5kZXgoe1xyXG4gICAgICBpbmRleE5hbWU6ICdUaW1lc3RhbXBJbmRleCcsXHJcbiAgICAgIHBhcnRpdGlvbktleTogeyBuYW1lOiAnZGF0ZScsIHR5cGU6IGR5bmFtb2RiLkF0dHJpYnV0ZVR5cGUuU1RSSU5HIH0sXHJcbiAgICAgIHNvcnRLZXk6IHsgbmFtZTogJ3RpbWVzdGFtcCcsIHR5cGU6IGR5bmFtb2RiLkF0dHJpYnV0ZVR5cGUuTlVNQkVSIH0sXHJcbiAgICB9KTtcclxuXHJcbiAgICAvLyBJb1QgVGhpbmcgVHlwZSBmb3IgR1BTIGRldmljZXNcclxuICAgIGNvbnN0IGRldmljZVRoaW5nVHlwZSA9IG5ldyBpb3QuQ2ZuVGhpbmdUeXBlKHRoaXMsICdHUFNEZXZpY2VUeXBlJywge1xyXG4gICAgICB0aGluZ1R5cGVOYW1lOiBgVHJhbnNwb3J0R1BTRGV2aWNlLSR7ZW52aXJvbm1lbnR9YCxcclxuICAgICAgdGhpbmdUeXBlUHJvcGVydGllczoge1xyXG4gICAgICAgIHRoaW5nVHlwZURlc2NyaXB0aW9uOiAnR1BTIHRyYWNraW5nIGRldmljZSBmb3IgdHJhbnNwb3J0IHZlaGljbGVzJyxcclxuICAgICAgICBzZWFyY2hhYmxlQXR0cmlidXRlczogWydkZXZpY2VNb2RlbCcsICdmaXJtd2FyZVZlcnNpb24nLCAndmVoaWNsZUlkJ10sXHJcbiAgICAgIH0sXHJcbiAgICB9KTtcclxuXHJcbiAgICAvLyBJb1QgUG9saWN5IGZvciBkZXZpY2VzXHJcbiAgICBjb25zdCBpb3RQb2xpY3kgPSBuZXcgaW90LkNmblBvbGljeSh0aGlzLCAnRGV2aWNlUG9saWN5Jywge1xyXG4gICAgICBwb2xpY3lOYW1lOiBgVHJhbnNwb3J0RGV2aWNlUG9saWN5LSR7ZW52aXJvbm1lbnR9YCxcclxuICAgICAgcG9saWN5RG9jdW1lbnQ6IHtcclxuICAgICAgICBWZXJzaW9uOiAnMjAxMi0xMC0xNycsXHJcbiAgICAgICAgU3RhdGVtZW50OiBbXHJcbiAgICAgICAgICB7XHJcbiAgICAgICAgICAgIEVmZmVjdDogJ0FsbG93JyxcclxuICAgICAgICAgICAgQWN0aW9uOiBbXHJcbiAgICAgICAgICAgICAgJ2lvdDpDb25uZWN0JyxcclxuICAgICAgICAgICAgICAnaW90OlB1Ymxpc2gnLFxyXG4gICAgICAgICAgICAgICdpb3Q6U3Vic2NyaWJlJyxcclxuICAgICAgICAgICAgICAnaW90OlJlY2VpdmUnLFxyXG4gICAgICAgICAgICBdLFxyXG4gICAgICAgICAgICBSZXNvdXJjZTogW1xyXG4gICAgICAgICAgICAgIGBhcm46YXdzOmlvdDoke3RoaXMucmVnaW9ufToke3RoaXMuYWNjb3VudH06Y2xpZW50L1xcJHtpb3Q6Q2xpZW50SWR9YCxcclxuICAgICAgICAgICAgICBgYXJuOmF3czppb3Q6JHt0aGlzLnJlZ2lvbn06JHt0aGlzLmFjY291bnR9OnRvcGljL3RyYW5zcG9ydC8ke2Vudmlyb25tZW50fS9cXCR7aW90OkNsaWVudElkfS8qYCxcclxuICAgICAgICAgICAgICBgYXJuOmF3czppb3Q6JHt0aGlzLnJlZ2lvbn06JHt0aGlzLmFjY291bnR9OnRvcGljZmlsdGVyL3RyYW5zcG9ydC8ke2Vudmlyb25tZW50fS9cXCR7aW90OkNsaWVudElkfS8qYCxcclxuICAgICAgICAgICAgXSxcclxuICAgICAgICAgIH0sXHJcbiAgICAgICAgXSxcclxuICAgICAgfSxcclxuICAgIH0pO1xyXG5cclxuICAgIC8vIE91dHB1dHNcclxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdEYXRhQnVja2V0TmFtZScsIHtcclxuICAgICAgdmFsdWU6IHRoaXMuZGF0YUJ1Y2tldC5idWNrZXROYW1lLFxyXG4gICAgICBkZXNjcmlwdGlvbjogJ05hbWUgb2YgdGhlIFMzIGJ1Y2tldCBmb3IgZGV2aWNlIGRhdGEnLFxyXG4gICAgfSk7XHJcblxyXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ0RldmljZVRhYmxlTmFtZScsIHtcclxuICAgICAgdmFsdWU6IHRoaXMuZGV2aWNlVGFibGUudGFibGVOYW1lLFxyXG4gICAgICBkZXNjcmlwdGlvbjogJ05hbWUgb2YgdGhlIER5bmFtb0RCIHRhYmxlIGZvciBkZXZpY2VzJyxcclxuICAgIH0pO1xyXG5cclxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdMb2NhdGlvblRhYmxlTmFtZScsIHtcclxuICAgICAgdmFsdWU6IHRoaXMubG9jYXRpb25UYWJsZS50YWJsZU5hbWUsXHJcbiAgICAgIGRlc2NyaXB0aW9uOiAnTmFtZSBvZiB0aGUgRHluYW1vREIgdGFibGUgZm9yIGxvY2F0aW9ucycsXHJcbiAgICB9KTtcclxuXHJcbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnSW9UUG9saWN5TmFtZScsIHtcclxuICAgICAgdmFsdWU6IGlvdFBvbGljeS5wb2xpY3lOYW1lISxcclxuICAgICAgZGVzY3JpcHRpb246ICdOYW1lIG9mIHRoZSBJb1QgcG9saWN5IGZvciBkZXZpY2VzJyxcclxuICAgIH0pO1xyXG5cclxuICAgIC8vIFRhZyBhbGwgcmVzb3VyY2VzXHJcbiAgICBjZGsuVGFncy5vZih0aGlzKS5hZGQoJ1Byb2plY3QnLCAnVHJhbnNwb3J0R1BTJyk7XHJcbiAgICBjZGsuVGFncy5vZih0aGlzKS5hZGQoJ0Vudmlyb25tZW50JywgZW52aXJvbm1lbnQpO1xyXG4gICAgY2RrLlRhZ3Mub2YodGhpcykuYWRkKCdNYW5hZ2VkQnknLCAnQ0RLJyk7XHJcbiAgfVxyXG59Il19