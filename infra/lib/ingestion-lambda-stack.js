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
exports.IngestionLambdaStack = void 0;
const cdk = __importStar(require("aws-cdk-lib"));
const lambda = __importStar(require("aws-cdk-lib/aws-lambda"));
const iot = __importStar(require("aws-cdk-lib/aws-iot"));
const iam = __importStar(require("aws-cdk-lib/aws-iam"));
const logs = __importStar(require("aws-cdk-lib/aws-logs"));
class IngestionLambdaStack extends cdk.Stack {
    constructor(scope, id, props) {
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
exports.IngestionLambdaStack = IngestionLambdaStack;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5nZXN0aW9uLWxhbWJkYS1zdGFjay5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbImluZ2VzdGlvbi1sYW1iZGEtc3RhY2sudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBQSxpREFBbUM7QUFDbkMsK0RBQWlEO0FBQ2pELHlEQUEyQztBQUMzQyx5REFBMkM7QUFFM0MsMkRBQTZDO0FBUTdDLE1BQWEsb0JBQXFCLFNBQVEsR0FBRyxDQUFDLEtBQUs7SUFHakQsWUFBWSxLQUFnQixFQUFFLEVBQVUsRUFBRSxLQUFnQztRQUN4RSxLQUFLLENBQUMsS0FBSyxFQUFFLEVBQUUsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUV4QixNQUFNLEVBQUUsV0FBVyxFQUFFLGFBQWEsRUFBRSxHQUFHLEtBQUssQ0FBQztRQUU3Qyw4QkFBOEI7UUFDOUIsSUFBSSxDQUFDLGVBQWUsR0FBRyxJQUFJLE1BQU0sQ0FBQyxRQUFRLENBQUMsSUFBSSxFQUFFLGlCQUFpQixFQUFFO1lBQ2xFLFlBQVksRUFBRSx1QkFBdUIsV0FBVyxFQUFFO1lBQ2xELE9BQU8sRUFBRSxNQUFNLENBQUMsT0FBTyxDQUFDLFdBQVc7WUFDbkMsT0FBTyxFQUFFLGVBQWU7WUFDeEIsSUFBSSxFQUFFLE1BQU0sQ0FBQyxJQUFJLENBQUMsVUFBVSxDQUFDOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztPQXVFNUIsQ0FBQztZQUNGLE9BQU8sRUFBRSxHQUFHLENBQUMsUUFBUSxDQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUM7WUFDakMsVUFBVSxFQUFFLEdBQUc7WUFDZixXQUFXLEVBQUU7Z0JBQ1gscUJBQXFCLEVBQUUsYUFBYSxDQUFDLFVBQVU7YUFDaEQ7WUFDRCxZQUFZLEVBQUUsSUFBSSxDQUFDLGFBQWEsQ0FBQyxRQUFRO1lBQ3pDLE9BQU8sRUFBRSxNQUFNLENBQUMsT0FBTyxDQUFDLE1BQU07U0FDL0IsQ0FBQyxDQUFDO1FBRUgsOENBQThDO1FBQzlDLGFBQWEsQ0FBQyxVQUFVLENBQUMsSUFBSSxDQUFDLGVBQWUsQ0FBQyxDQUFDO1FBRS9DLG9DQUFvQztRQUNwQyxNQUFNLE9BQU8sR0FBRyxJQUFJLEdBQUcsQ0FBQyxZQUFZLENBQUMsSUFBSSxFQUFFLGtCQUFrQixFQUFFO1lBQzdELFFBQVEsRUFBRSwyQkFBMkIsV0FBVyxFQUFFO1lBQ2xELGdCQUFnQixFQUFFO2dCQUNoQixHQUFHLEVBQUUsNEJBQTRCLFdBQVcsY0FBYztnQkFDMUQsV0FBVyxFQUFFLHFEQUFxRDtnQkFDbEUsT0FBTyxFQUFFO29CQUNQO3dCQUNFLE1BQU0sRUFBRTs0QkFDTixXQUFXLEVBQUUsSUFBSSxDQUFDLGVBQWUsQ0FBQyxXQUFXO3lCQUM5QztxQkFDRjtpQkFDRjtnQkFDRCxXQUFXLEVBQUU7b0JBQ1gsY0FBYyxFQUFFO3dCQUNkLFlBQVksRUFBRSxzQkFBc0IsV0FBVyxTQUFTO3dCQUN4RCxPQUFPLEVBQUUsSUFBSSxHQUFHLENBQUMsSUFBSSxDQUFDLElBQUksRUFBRSxpQkFBaUIsRUFBRTs0QkFDN0MsU0FBUyxFQUFFLElBQUksR0FBRyxDQUFDLGdCQUFnQixDQUFDLG1CQUFtQixDQUFDOzRCQUN4RCxjQUFjLEVBQUU7Z0NBQ2QsV0FBVyxFQUFFLElBQUksR0FBRyxDQUFDLGNBQWMsQ0FBQztvQ0FDbEMsVUFBVSxFQUFFO3dDQUNWLElBQUksR0FBRyxDQUFDLGVBQWUsQ0FBQzs0Q0FDdEIsT0FBTyxFQUFFLENBQUMscUJBQXFCLEVBQUUsc0JBQXNCLEVBQUUsbUJBQW1CLENBQUM7NENBQzdFLFNBQVMsRUFBRSxDQUFDLGdCQUFnQixJQUFJLENBQUMsTUFBTSxJQUFJLElBQUksQ0FBQyxPQUFPLGlDQUFpQyxXQUFXLFdBQVcsQ0FBQzt5Q0FDaEgsQ0FBQztxQ0FDSDtpQ0FDRixDQUFDOzZCQUNIO3lCQUNGLENBQUMsQ0FBQyxPQUFPO3FCQUNYO2lCQUNGO2dCQUNELFlBQVksRUFBRSxLQUFLO2FBQ3BCO1NBQ0YsQ0FBQyxDQUFDO1FBRUgsd0NBQXdDO1FBQ3hDLElBQUksQ0FBQyxlQUFlLENBQUMsYUFBYSxDQUFDLGdCQUFnQixFQUFFO1lBQ25ELFNBQVMsRUFBRSxJQUFJLEdBQUcsQ0FBQyxnQkFBZ0IsQ0FBQyxtQkFBbUIsQ0FBQztZQUN4RCxTQUFTLEVBQUUsZUFBZSxJQUFJLENBQUMsTUFBTSxJQUFJLElBQUksQ0FBQyxPQUFPLFNBQVMsT0FBTyxDQUFDLFFBQVEsRUFBRTtTQUNqRixDQUFDLENBQUM7UUFFSCw2Q0FBNkM7UUFDN0MsSUFBSSxJQUFJLENBQUMsUUFBUSxDQUFDLElBQUksRUFBRSxrQkFBa0IsRUFBRTtZQUMxQyxZQUFZLEVBQUUsc0JBQXNCLFdBQVcsU0FBUztZQUN4RCxTQUFTLEVBQUUsSUFBSSxDQUFDLGFBQWEsQ0FBQyxRQUFRO1lBQ3RDLGFBQWEsRUFBRSxHQUFHLENBQUMsYUFBYSxDQUFDLE9BQU87U0FDekMsQ0FBQyxDQUFDO1FBRUgsVUFBVTtRQUNWLElBQUksR0FBRyxDQUFDLFNBQVMsQ0FBQyxJQUFJLEVBQUUscUJBQXFCLEVBQUU7WUFDN0MsS0FBSyxFQUFFLElBQUksQ0FBQyxlQUFlLENBQUMsWUFBWTtZQUN4QyxXQUFXLEVBQUUsdUNBQXVDO1NBQ3JELENBQUMsQ0FBQztRQUVILElBQUksR0FBRyxDQUFDLFNBQVMsQ0FBQyxJQUFJLEVBQUUsYUFBYSxFQUFFO1lBQ3JDLEtBQUssRUFBRSxPQUFPLENBQUMsUUFBUSxJQUFJLEVBQUU7WUFDN0IsV0FBVyxFQUFFLHdDQUF3QztTQUN0RCxDQUFDLENBQUM7SUFDTCxDQUFDO0NBQ0Y7QUE1SkQsb0RBNEpDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0ICogYXMgY2RrIGZyb20gJ2F3cy1jZGstbGliJztcclxuaW1wb3J0ICogYXMgbGFtYmRhIGZyb20gJ2F3cy1jZGstbGliL2F3cy1sYW1iZGEnO1xyXG5pbXBvcnQgKiBhcyBpb3QgZnJvbSAnYXdzLWNkay1saWIvYXdzLWlvdCc7XHJcbmltcG9ydCAqIGFzIGlhbSBmcm9tICdhd3MtY2RrLWxpYi9hd3MtaWFtJztcclxuaW1wb3J0ICogYXMga2luZXNpcyBmcm9tICdhd3MtY2RrLWxpYi9hd3Mta2luZXNpcyc7XHJcbmltcG9ydCAqIGFzIGxvZ3MgZnJvbSAnYXdzLWNkay1saWIvYXdzLWxvZ3MnO1xyXG5pbXBvcnQgeyBDb25zdHJ1Y3QgfSBmcm9tICdjb25zdHJ1Y3RzJztcclxuXHJcbmludGVyZmFjZSBJbmdlc3Rpb25MYW1iZGFTdGFja1Byb3BzIGV4dGVuZHMgY2RrLlN0YWNrUHJvcHMge1xyXG4gIGVudmlyb25tZW50OiBzdHJpbmc7XHJcbiAga2luZXNpc1N0cmVhbToga2luZXNpcy5TdHJlYW07XHJcbn1cclxuXHJcbmV4cG9ydCBjbGFzcyBJbmdlc3Rpb25MYW1iZGFTdGFjayBleHRlbmRzIGNkay5TdGFjayB7XHJcbiAgcHVibGljIHJlYWRvbmx5IGluZ2VzdGlvbkxhbWJkYTogbGFtYmRhLkZ1bmN0aW9uO1xyXG5cclxuICBjb25zdHJ1Y3RvcihzY29wZTogQ29uc3RydWN0LCBpZDogc3RyaW5nLCBwcm9wczogSW5nZXN0aW9uTGFtYmRhU3RhY2tQcm9wcykge1xyXG4gICAgc3VwZXIoc2NvcGUsIGlkLCBwcm9wcyk7XHJcblxyXG4gICAgY29uc3QgeyBlbnZpcm9ubWVudCwga2luZXNpc1N0cmVhbSB9ID0gcHJvcHM7XHJcblxyXG4gICAgLy8gQ3JlYXRlIHRoZSBJbmdlc3Rpb24gTGFtYmRhXHJcbiAgICB0aGlzLmluZ2VzdGlvbkxhbWJkYSA9IG5ldyBsYW1iZGEuRnVuY3Rpb24odGhpcywgJ0luZ2VzdGlvbkxhbWJkYScsIHtcclxuICAgICAgZnVuY3Rpb25OYW1lOiBgdHJhbnNwb3J0LWluZ2VzdGlvbi0ke2Vudmlyb25tZW50fWAsXHJcbiAgICAgIHJ1bnRpbWU6IGxhbWJkYS5SdW50aW1lLlBZVEhPTl8zXzExLFxyXG4gICAgICBoYW5kbGVyOiAnaW5kZXguaGFuZGxlcicsXHJcbiAgICAgIGNvZGU6IGxhbWJkYS5Db2RlLmZyb21JbmxpbmUoYFxyXG5pbXBvcnQganNvblxyXG5pbXBvcnQgYm90bzNcclxuaW1wb3J0IG9zXHJcbmZyb20gZGF0ZXRpbWUgaW1wb3J0IGRhdGV0aW1lXHJcblxyXG5raW5lc2lzID0gYm90bzMuY2xpZW50KCdraW5lc2lzJylcclxuU1RSRUFNX05BTUUgPSBvcy5lbnZpcm9uWydLSU5FU0lTX1NUUkVBTV9OQU1FJ11cclxuXHJcbmRlZiBoYW5kbGVyKGV2ZW50LCBjb250ZXh0KTpcclxuICAgIFwiXCJcIlxyXG4gICAgVmFsaWRhdGUgYW5kIGZvcndhcmQgSW9UIEdQUyBkYXRhIHRvIEtpbmVzaXNcclxuICAgIFwiXCJcIlxyXG4gICAgdHJ5OlxyXG4gICAgICAgICMgUGFyc2UgdGhlIGluY29taW5nIG1lc3NhZ2VcclxuICAgICAgICBpZiBpc2luc3RhbmNlKGV2ZW50LCBzdHIpOlxyXG4gICAgICAgICAgICBtZXNzYWdlID0ganNvbi5sb2FkcyhldmVudClcclxuICAgICAgICBlbHNlOlxyXG4gICAgICAgICAgICBtZXNzYWdlID0gZXZlbnRcclxuICAgICAgICBcclxuICAgICAgICAjIFZhbGlkYXRlIHJlcXVpcmVkIGZpZWxkc1xyXG4gICAgICAgIHJlcXVpcmVkX2ZpZWxkcyA9IFsnYnVzSWQnLCAnbGF0JywgJ2xvbicsICd0cyddXHJcbiAgICAgICAgZm9yIGZpZWxkIGluIHJlcXVpcmVkX2ZpZWxkczpcclxuICAgICAgICAgICAgaWYgZmllbGQgbm90IGluIG1lc3NhZ2U6XHJcbiAgICAgICAgICAgICAgICBwcmludChmXCJNaXNzaW5nIHJlcXVpcmVkIGZpZWxkOiB7ZmllbGR9XCIpXHJcbiAgICAgICAgICAgICAgICByZXR1cm4ge1xyXG4gICAgICAgICAgICAgICAgICAgICdzdGF0dXNDb2RlJzogNDAwLFxyXG4gICAgICAgICAgICAgICAgICAgICdib2R5JzogZidNaXNzaW5nIHJlcXVpcmVkIGZpZWxkOiB7ZmllbGR9J1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgICMgVmFsaWRhdGUgZGF0YSB0eXBlcyBhbmQgcmFuZ2VzXHJcbiAgICAgICAgaWYgbm90IGlzaW5zdGFuY2UobWVzc2FnZVsnbGF0J10sIChpbnQsIGZsb2F0KSkgb3Igbm90IC05MCA8PSBtZXNzYWdlWydsYXQnXSA8PSA5MDpcclxuICAgICAgICAgICAgcmV0dXJuIHsnc3RhdHVzQ29kZSc6IDQwMCwgJ2JvZHknOiAnSW52YWxpZCBsYXRpdHVkZSd9XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgIGlmIG5vdCBpc2luc3RhbmNlKG1lc3NhZ2VbJ2xvbiddLCAoaW50LCBmbG9hdCkpIG9yIG5vdCAtMTgwIDw9IG1lc3NhZ2VbJ2xvbiddIDw9IDE4MDpcclxuICAgICAgICAgICAgcmV0dXJuIHsnc3RhdHVzQ29kZSc6IDQwMCwgJ2JvZHknOiAnSW52YWxpZCBsb25naXR1ZGUnfVxyXG4gICAgICAgICAgICBcclxuICAgICAgICBpZiBub3QgaXNpbnN0YW5jZShtZXNzYWdlWyd0cyddLCBpbnQpIG9yIG1lc3NhZ2VbJ3RzJ10gPCAwOlxyXG4gICAgICAgICAgICByZXR1cm4geydzdGF0dXNDb2RlJzogNDAwLCAnYm9keSc6ICdJbnZhbGlkIHRpbWVzdGFtcCd9XHJcbiAgICAgICAgXHJcbiAgICAgICAgIyBFbnJpY2ggdGhlIG1lc3NhZ2VcclxuICAgICAgICBlbnJpY2hlZF9tZXNzYWdlID0ge1xyXG4gICAgICAgICAgICAqKm1lc3NhZ2UsXHJcbiAgICAgICAgICAgICdwcm9jZXNzZWRfYXQnOiBpbnQoZGF0ZXRpbWUudXRjbm93KCkudGltZXN0YW1wKCkgKiAxMDAwKSxcclxuICAgICAgICAgICAgJ3Byb2Nlc3Nvcl92ZXJzaW9uJzogJzEuMCcsXHJcbiAgICAgICAgICAgICd2YWxpZCc6IFRydWVcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgIyBTZW5kIHRvIEtpbmVzaXNcclxuICAgICAgICByZXNwb25zZSA9IGtpbmVzaXMucHV0X3JlY29yZChcclxuICAgICAgICAgICAgU3RyZWFtTmFtZT1TVFJFQU1fTkFNRSxcclxuICAgICAgICAgICAgRGF0YT1qc29uLmR1bXBzKGVucmljaGVkX21lc3NhZ2UpLFxyXG4gICAgICAgICAgICBQYXJ0aXRpb25LZXk9bWVzc2FnZVsnYnVzSWQnXSAgIyBVc2UgYnVzSWQgYXMgcGFydGl0aW9uIGtleVxyXG4gICAgICAgIClcclxuICAgICAgICBcclxuICAgICAgICBwcmludChmXCJTdWNjZXNzZnVsbHkgc2VudCB0byBLaW5lc2lzOiB7cmVzcG9uc2VbJ1NlcXVlbmNlTnVtYmVyJ119XCIpXHJcbiAgICAgICAgXHJcbiAgICAgICAgcmV0dXJuIHtcclxuICAgICAgICAgICAgJ3N0YXR1c0NvZGUnOiAyMDAsXHJcbiAgICAgICAgICAgICdib2R5JzoganNvbi5kdW1wcyh7XHJcbiAgICAgICAgICAgICAgICAnbWVzc2FnZSc6ICdTdWNjZXNzZnVsbHkgcHJvY2Vzc2VkJyxcclxuICAgICAgICAgICAgICAgICdzZXF1ZW5jZU51bWJlcic6IHJlc3BvbnNlWydTZXF1ZW5jZU51bWJlciddXHJcbiAgICAgICAgICAgIH0pXHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgZXhjZXB0IEV4Y2VwdGlvbiBhcyBlOlxyXG4gICAgICAgIHByaW50KGZcIkVycm9yIHByb2Nlc3NpbmcgbWVzc2FnZToge3N0cihlKX1cIilcclxuICAgICAgICByZXR1cm4ge1xyXG4gICAgICAgICAgICAnc3RhdHVzQ29kZSc6IDUwMCxcclxuICAgICAgICAgICAgJ2JvZHknOiBmJ0Vycm9yOiB7c3RyKGUpfSdcclxuICAgICAgICB9XHJcbiAgICAgIGApLFxyXG4gICAgICB0aW1lb3V0OiBjZGsuRHVyYXRpb24uc2Vjb25kcygzMCksXHJcbiAgICAgIG1lbW9yeVNpemU6IDI1NixcclxuICAgICAgZW52aXJvbm1lbnQ6IHtcclxuICAgICAgICAnS0lORVNJU19TVFJFQU1fTkFNRSc6IGtpbmVzaXNTdHJlYW0uc3RyZWFtTmFtZSxcclxuICAgICAgfSxcclxuICAgICAgbG9nUmV0ZW50aW9uOiBsb2dzLlJldGVudGlvbkRheXMuT05FX1dFRUssXHJcbiAgICAgIHRyYWNpbmc6IGxhbWJkYS5UcmFjaW5nLkFDVElWRSxcclxuICAgIH0pO1xyXG5cclxuICAgIC8vIEdyYW50IExhbWJkYSBwZXJtaXNzaW9uIHRvIHdyaXRlIHRvIEtpbmVzaXNcclxuICAgIGtpbmVzaXNTdHJlYW0uZ3JhbnRXcml0ZSh0aGlzLmluZ2VzdGlvbkxhbWJkYSk7XHJcblxyXG4gICAgLy8gQ3JlYXRlIElvVCBSdWxlIHRvIHRyaWdnZXIgTGFtYmRhXHJcbiAgICBjb25zdCBpb3RSdWxlID0gbmV3IGlvdC5DZm5Ub3BpY1J1bGUodGhpcywgJ0dQU0luZ2VzdGlvblJ1bGUnLCB7XHJcbiAgICAgIHJ1bGVOYW1lOiBgdHJhbnNwb3J0X2dwc19pbmdlc3Rpb25fJHtlbnZpcm9ubWVudH1gLFxyXG4gICAgICB0b3BpY1J1bGVQYXlsb2FkOiB7XHJcbiAgICAgICAgc3FsOiBgU0VMRUNUICogRlJPTSAndHJhbnNwb3J0LyR7ZW52aXJvbm1lbnR9LysvbG9jYXRpb24nYCxcclxuICAgICAgICBkZXNjcmlwdGlvbjogJ1JvdXRlIEdQUyBkYXRhIGZyb20gSW9UIGRldmljZXMgdG8gaW5nZXN0aW9uIExhbWJkYScsXHJcbiAgICAgICAgYWN0aW9uczogW1xyXG4gICAgICAgICAge1xyXG4gICAgICAgICAgICBsYW1iZGE6IHtcclxuICAgICAgICAgICAgICBmdW5jdGlvbkFybjogdGhpcy5pbmdlc3Rpb25MYW1iZGEuZnVuY3Rpb25Bcm4sXHJcbiAgICAgICAgICAgIH0sXHJcbiAgICAgICAgICB9LFxyXG4gICAgICAgIF0sXHJcbiAgICAgICAgZXJyb3JBY3Rpb246IHtcclxuICAgICAgICAgIGNsb3Vkd2F0Y2hMb2dzOiB7XHJcbiAgICAgICAgICAgIGxvZ0dyb3VwTmFtZTogYC9hd3MvaW90L3RyYW5zcG9ydC8ke2Vudmlyb25tZW50fS9lcnJvcnNgLFxyXG4gICAgICAgICAgICByb2xlQXJuOiBuZXcgaWFtLlJvbGUodGhpcywgJ0lvVEVycm9yTG9nUm9sZScsIHtcclxuICAgICAgICAgICAgICBhc3N1bWVkQnk6IG5ldyBpYW0uU2VydmljZVByaW5jaXBhbCgnaW90LmFtYXpvbmF3cy5jb20nKSxcclxuICAgICAgICAgICAgICBpbmxpbmVQb2xpY2llczoge1xyXG4gICAgICAgICAgICAgICAgJ0xvZ1BvbGljeSc6IG5ldyBpYW0uUG9saWN5RG9jdW1lbnQoe1xyXG4gICAgICAgICAgICAgICAgICBzdGF0ZW1lbnRzOiBbXHJcbiAgICAgICAgICAgICAgICAgICAgbmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xyXG4gICAgICAgICAgICAgICAgICAgICAgYWN0aW9uczogWydsb2dzOkNyZWF0ZUxvZ0dyb3VwJywgJ2xvZ3M6Q3JlYXRlTG9nU3RyZWFtJywgJ2xvZ3M6UHV0TG9nRXZlbnRzJ10sXHJcbiAgICAgICAgICAgICAgICAgICAgICByZXNvdXJjZXM6IFtgYXJuOmF3czpsb2dzOiR7dGhpcy5yZWdpb259OiR7dGhpcy5hY2NvdW50fTpsb2ctZ3JvdXA6L2F3cy9pb3QvdHJhbnNwb3J0LyR7ZW52aXJvbm1lbnR9L2Vycm9yczoqYF0sXHJcbiAgICAgICAgICAgICAgICAgICAgfSksXHJcbiAgICAgICAgICAgICAgICAgIF0sXHJcbiAgICAgICAgICAgICAgICB9KSxcclxuICAgICAgICAgICAgICB9LFxyXG4gICAgICAgICAgICB9KS5yb2xlQXJuLFxyXG4gICAgICAgICAgfSxcclxuICAgICAgICB9LFxyXG4gICAgICAgIHJ1bGVEaXNhYmxlZDogZmFsc2UsXHJcbiAgICAgIH0sXHJcbiAgICB9KTtcclxuXHJcbiAgICAvLyBHcmFudCBJb1QgcGVybWlzc2lvbiB0byBpbnZva2UgTGFtYmRhXHJcbiAgICB0aGlzLmluZ2VzdGlvbkxhbWJkYS5hZGRQZXJtaXNzaW9uKCdBbGxvd0lvVEludm9rZScsIHtcclxuICAgICAgcHJpbmNpcGFsOiBuZXcgaWFtLlNlcnZpY2VQcmluY2lwYWwoJ2lvdC5hbWF6b25hd3MuY29tJyksXHJcbiAgICAgIHNvdXJjZUFybjogYGFybjphd3M6aW90OiR7dGhpcy5yZWdpb259OiR7dGhpcy5hY2NvdW50fTpydWxlLyR7aW90UnVsZS5ydWxlTmFtZX1gLFxyXG4gICAgfSk7XHJcblxyXG4gICAgLy8gQ3JlYXRlIENsb3VkV2F0Y2ggTG9nIEdyb3VwIGZvciBJb1QgZXJyb3JzXHJcbiAgICBuZXcgbG9ncy5Mb2dHcm91cCh0aGlzLCAnSW9URXJyb3JMb2dHcm91cCcsIHtcclxuICAgICAgbG9nR3JvdXBOYW1lOiBgL2F3cy9pb3QvdHJhbnNwb3J0LyR7ZW52aXJvbm1lbnR9L2Vycm9yc2AsXHJcbiAgICAgIHJldGVudGlvbjogbG9ncy5SZXRlbnRpb25EYXlzLk9ORV9XRUVLLFxyXG4gICAgICByZW1vdmFsUG9saWN5OiBjZGsuUmVtb3ZhbFBvbGljeS5ERVNUUk9ZLFxyXG4gICAgfSk7XHJcblxyXG4gICAgLy8gT3V0cHV0c1xyXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ0luZ2VzdGlvbkxhbWJkYU5hbWUnLCB7XHJcbiAgICAgIHZhbHVlOiB0aGlzLmluZ2VzdGlvbkxhbWJkYS5mdW5jdGlvbk5hbWUsXHJcbiAgICAgIGRlc2NyaXB0aW9uOiAnTmFtZSBvZiB0aGUgaW5nZXN0aW9uIExhbWJkYSBmdW5jdGlvbicsXHJcbiAgICB9KTtcclxuXHJcbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnSW9UUnVsZU5hbWUnLCB7XHJcbiAgICAgIHZhbHVlOiBpb3RSdWxlLnJ1bGVOYW1lIHx8ICcnLFxyXG4gICAgICBkZXNjcmlwdGlvbjogJ05hbWUgb2YgdGhlIElvVCBydWxlIGZvciBHUFMgaW5nZXN0aW9uJyxcclxuICAgIH0pO1xyXG4gIH1cclxufSJdfQ==