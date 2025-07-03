import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iot from 'aws-cdk-lib/aws-iot';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as kinesis from 'aws-cdk-lib/aws-kinesis';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';

interface IngestionLambdaStackProps extends cdk.StackProps {
  environment: string;
  kinesisStream: kinesis.Stream;
}

export class IngestionLambdaStack extends cdk.Stack {
  public readonly ingestionLambda: lambda.Function;

  constructor(scope: Construct, id: string, props: IngestionLambdaStackProps) {
    super(scope, id, props);

    const { environment, kinesisStream } = props;

    // Create the Ingestion Lambda
    this.ingestionLambda = new lambda.Function(this, 'IngestionLambda', {
      functionName: `transport-ingestion-${environment}`,
      runtime: lambda.Runtime.PYTHON_3_11,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('../services/ingestion-lambda/src'),
      timeout: cdk.Duration.seconds(30),
      memorySize: 256,
      environment: {
        'KINESIS_STREAM_NAME': kinesisStream.streamName,
        'AWS_XRAY_CONTEXT_MISSING': 'LOG_ERROR',
        'AWS_XRAY_TRACING_NAME': `transport-ingestion-${environment}`,
      },
      logRetention: logs.RetentionDays.ONE_WEEK,
      tracing: lambda.Tracing.ACTIVE,
    });

    // Grant Lambda permission to write to Kinesis
    kinesisStream.grantWrite(this.ingestionLambda);

    // Grant X-Ray permissions
    this.ingestionLambda.addToRolePolicy(new iam.PolicyStatement({
      actions: [
        'xray:PutTraceSegments',
        'xray:PutTelemetryRecords',
      ],
      resources: ['*'],
    }));

    // Create IoT Rule to trigger Lambda
    const iotRule = new iot.CfnTopicRule(this, 'GPSIngestionRule', {
      ruleName: `transport_gps_ingestion_${environment}`,
      topicRulePayload: {
        sql: `SELECT * FROM 'transport/${environment}/+/location'`,
        description: 'Route GPS data from IoT devices to ingestion Lambda',
        actions: [
          {
            lambda: {
              functionArn: this.ingestionLambda.functionArn,
            },
          },
        ],
        errorAction: {
          cloudwatchLogs: {
            logGroupName: `/aws/iot/transport/${environment}/errors`,
            roleArn: new iam.Role(this, 'IoTErrorLogRole', {
              assumedBy: new iam.ServicePrincipal('iot.amazonaws.com'),
              inlinePolicies: {
                'LogPolicy': new iam.PolicyDocument({
                  statements: [
                    new iam.PolicyStatement({
                      actions: ['logs:CreateLogGroup', 'logs:CreateLogStream', 'logs:PutLogEvents'],
                      resources: [`arn:aws:logs:${this.region}:${this.account}:log-group:/aws/iot/transport/${environment}/errors:*`],
                    }),
                  ],
                }),
              },
            }).roleArn,
          },
        },
        ruleDisabled: false,
      },
    });

    // Grant IoT permission to invoke Lambda
    this.ingestionLambda.addPermission('AllowIoTInvoke', {
      principal: new iam.ServicePrincipal('iot.amazonaws.com'),
      sourceArn: `arn:aws:iot:${this.region}:${this.account}:rule/${iotRule.ruleName}`,
    });

    // Create CloudWatch Log Group for IoT errors
    new logs.LogGroup(this, 'IoTErrorLogGroup', {
      logGroupName: `/aws/iot/transport/${environment}/errors`,
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // Outputs
    new cdk.CfnOutput(this, 'IngestionLambdaName', {
      value: this.ingestionLambda.functionName,
      description: 'Name of the ingestion Lambda function',
    });

    new cdk.CfnOutput(this, 'IoTRuleName', {
      value: iotRule.ruleName || '',
      description: 'Name of the IoT rule for GPS ingestion',
    });
  }
}