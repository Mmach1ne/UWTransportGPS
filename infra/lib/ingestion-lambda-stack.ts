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
      code: lambda.Code.fromInline(`
import json
import boto3
import os
from datetime import datetime

kinesis = boto3.client('kinesis')
STREAM_NAME = os.environ['KINESIS_STREAM_NAME']

def handler(event, context):
    """
    Validate and forward IoT GPS data to Kinesis
    """
    try:
        # Parse the incoming message
        if isinstance(event, str):
            message = json.loads(event)
        else:
            message = event
        
        # Validate required fields
        required_fields = ['busId', 'lat', 'lon', 'ts']
        for field in required_fields:
            if field not in message:
                print(f"Missing required field: {field}")
                return {
                    'statusCode': 400,
                    'body': f'Missing required field: {field}'
                }
        
        # Validate data types and ranges
        if not isinstance(message['lat'], (int, float)) or not -90 <= message['lat'] <= 90:
            return {'statusCode': 400, 'body': 'Invalid latitude'}
            
        if not isinstance(message['lon'], (int, float)) or not -180 <= message['lon'] <= 180:
            return {'statusCode': 400, 'body': 'Invalid longitude'}
            
        if not isinstance(message['ts'], int) or message['ts'] < 0:
            return {'statusCode': 400, 'body': 'Invalid timestamp'}
        
        # Enrich the message
        enriched_message = {
            **message,
            'processed_at': int(datetime.utcnow().timestamp() * 1000),
            'processor_version': '1.0',
            'valid': True
        }
        
        # Send to Kinesis
        response = kinesis.put_record(
            StreamName=STREAM_NAME,
            Data=json.dumps(enriched_message),
            PartitionKey=message['busId']  # Use busId as partition key
        )
        
        print(f"Successfully sent to Kinesis: {response['SequenceNumber']}")
        
        return {
            'statusCode': 200,
            'body': json.dumps({
                'message': 'Successfully processed',
                'sequenceNumber': response['SequenceNumber']
            })
        }
        
    except Exception as e:
        print(f"Error processing message: {str(e)}")
        return {
            'statusCode': 500,
            'body': f'Error: {str(e)}'
        }
      `),
      timeout: cdk.Duration.seconds(30),
      memorySize: 256,
      environment: {
        'KINESIS_STREAM_NAME': kinesisStream.streamName,
      },
      logRetention: logs.RetentionDays.ONE_WEEK,
      tracing: lambda.Tracing.ACTIVE,
    });

    // Grant Lambda permission to write to Kinesis
    kinesisStream.grantWrite(this.ingestionLambda);

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