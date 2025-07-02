import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as iot from 'aws-cdk-lib/aws-iot';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as kinesis from 'aws-cdk-lib/aws-kinesis';
import { Construct } from 'constructs';

interface TransportInfraStackProps extends cdk.StackProps {
  environment: string;
}

export class TransportInfraStack extends cdk.Stack {
  public readonly dataBucket: s3.Bucket;
  public readonly deviceTable: dynamodb.Table;
  public readonly locationTable: dynamodb.Table;
  public readonly gpsDataStream: kinesis.Stream;

  constructor(scope: Construct, id: string, props: TransportInfraStackProps) {
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
      value: iotPolicy.policyName!,
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