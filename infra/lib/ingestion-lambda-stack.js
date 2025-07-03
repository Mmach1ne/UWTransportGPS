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
exports.IngestionLambdaStack = IngestionLambdaStack;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5nZXN0aW9uLWxhbWJkYS1zdGFjay5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbImluZ2VzdGlvbi1sYW1iZGEtc3RhY2sudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBQSxpREFBbUM7QUFDbkMsK0RBQWlEO0FBQ2pELHlEQUEyQztBQUMzQyx5REFBMkM7QUFFM0MsMkRBQTZDO0FBUTdDLE1BQWEsb0JBQXFCLFNBQVEsR0FBRyxDQUFDLEtBQUs7SUFHakQsWUFBWSxLQUFnQixFQUFFLEVBQVUsRUFBRSxLQUFnQztRQUN4RSxLQUFLLENBQUMsS0FBSyxFQUFFLEVBQUUsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUV4QixNQUFNLEVBQUUsV0FBVyxFQUFFLGFBQWEsRUFBRSxHQUFHLEtBQUssQ0FBQztRQUU3Qyw4QkFBOEI7UUFDOUIsSUFBSSxDQUFDLGVBQWUsR0FBRyxJQUFJLE1BQU0sQ0FBQyxRQUFRLENBQUMsSUFBSSxFQUFFLGlCQUFpQixFQUFFO1lBQ2xFLFlBQVksRUFBRSx1QkFBdUIsV0FBVyxFQUFFO1lBQ2xELE9BQU8sRUFBRSxNQUFNLENBQUMsT0FBTyxDQUFDLFdBQVc7WUFDbkMsT0FBTyxFQUFFLGVBQWU7WUFDeEIsSUFBSSxFQUFFLE1BQU0sQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLGtDQUFrQyxDQUFDO1lBQy9ELE9BQU8sRUFBRSxHQUFHLENBQUMsUUFBUSxDQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUM7WUFDakMsVUFBVSxFQUFFLEdBQUc7WUFDZixXQUFXLEVBQUU7Z0JBQ1gscUJBQXFCLEVBQUUsYUFBYSxDQUFDLFVBQVU7Z0JBQy9DLDBCQUEwQixFQUFFLFdBQVc7Z0JBQ3ZDLHVCQUF1QixFQUFFLHVCQUF1QixXQUFXLEVBQUU7YUFDOUQ7WUFDRCxZQUFZLEVBQUUsSUFBSSxDQUFDLGFBQWEsQ0FBQyxRQUFRO1lBQ3pDLE9BQU8sRUFBRSxNQUFNLENBQUMsT0FBTyxDQUFD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LCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgKiBhcyBjZGsgZnJvbSAnYXdzLWNkay1saWInO1xyXG5pbXBvcnQgKiBhcyBsYW1iZGEgZnJvbSAnYXdzLWNkay1saWIvYXdzLWxhbWJkYSc7XHJcbmltcG9ydCAqIGFzIGlvdCBmcm9tICdhd3MtY2RrLWxpYi9hd3MtaW90JztcclxuaW1wb3J0ICogYXMgaWFtIGZyb20gJ2F3cy1jZGstbGliL2F3cy1pYW0nO1xyXG5pbXBvcnQgKiBhcyBraW5lc2lzIGZyb20gJ2F3cy1jZGstbGliL2F3cy1raW5lc2lzJztcclxuaW1wb3J0ICogYXMgbG9ncyBmcm9tICdhd3MtY2RrLWxpYi9hd3MtbG9ncyc7XHJcbmltcG9ydCB7IENvbnN0cnVjdCB9IGZyb20gJ2NvbnN0cnVjdHMnO1xyXG5cclxuaW50ZXJmYWNlIEluZ2VzdGlvbkxhbWJkYVN0YWNrUHJvcHMgZXh0ZW5kcyBjZGsuU3RhY2tQcm9wcyB7XHJcbiAgZW52aXJvbm1lbnQ6IHN0cmluZztcclxuICBraW5lc2lzU3RyZWFtOiBraW5lc2lzLlN0cmVhbTtcclxufVxyXG5cclxuZXhwb3J0IGNsYXNzIEluZ2VzdGlvbkxhbWJkYVN0YWNrIGV4dGVuZHMgY2RrLlN0YWNrIHtcclxuICBwdWJsaWMgcmVhZG9ubHkgaW5nZXN0aW9uTGFtYmRhOiBsYW1iZGEuRnVuY3Rpb247XHJcblxyXG4gIGNvbnN0cnVjdG9yKHNjb3BlOiBDb25zdHJ1Y3QsIGlkOiBzdHJpbmcsIHByb3BzOiBJbmdlc3Rpb25MYW1iZGFTdGFja1Byb3BzKSB7XHJcbiAgICBzdXBlcihzY29wZSwgaWQsIHByb3BzKTtcclxuXHJcbiAgICBjb25zdCB7IGVudmlyb25tZW50LCBraW5lc2lzU3RyZWFtIH0gPSBwcm9wcztcclxuXHJcbiAgICAvLyBDcmVhdGUgdGhlIEluZ2VzdGlvbiBMYW1iZGFcclxuICAgIHRoaXMuaW5nZXN0aW9uTGFtYmRhID0gbmV3IGxhbWJkYS5GdW5jdGlvbih0aGlzLCAnSW5nZXN0aW9uTGFtYmRhJywge1xyXG4gICAgICBmdW5jdGlvbk5hbWU6IGB0cmFuc3BvcnQtaW5nZXN0aW9uLSR7ZW52aXJvbm1lbnR9YCxcclxuICAgICAgcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuUFlUSE9OXzNfMTEsXHJcbiAgICAgIGhhbmRsZXI6ICdpbmRleC5oYW5kbGVyJyxcclxuICAgICAgY29kZTogbGFtYmRhLkNvZGUuZnJvbUFzc2V0KCcuLi9zZXJ2aWNlcy9pbmdlc3Rpb24tbGFtYmRhL3NyYycpLFxyXG4gICAgICB0aW1lb3V0OiBjZGsuRHVyYXRpb24uc2Vjb25kcygzMCksXHJcbiAgICAgIG1lbW9yeVNpemU6IDI1NixcclxuICAgICAgZW52aXJvbm1lbnQ6IHtcclxuICAgICAgICAnS0lORVNJU19TVFJFQU1fTkFNRSc6IGtpbmVzaXNTdHJlYW0uc3RyZWFtTmFtZSxcclxuICAgICAgICAnQVdTX1hSQVlfQ09OVEVYVF9NSVNTSU5HJzogJ0xPR19FUlJPUicsXHJcbiAgICAgICAgJ0FXU19YUkFZX1RSQUNJTkdfTkFNRSc6IGB0cmFuc3BvcnQtaW5nZXN0aW9uLSR7ZW52aXJvbm1lbnR9YCxcclxuICAgICAgfSxcclxuICAgICAgbG9nUmV0ZW50aW9uOiBsb2dzLlJldGVudGlvbkRheXMuT05FX1dFRUssXHJcbiAgICAgIHRyYWNpbmc6IGxhbWJkYS5UcmFjaW5nLkFDVElWRSxcclxuICAgIH0pO1xyXG5cclxuICAgIC8vIEdyYW50IExhbWJkYSBwZXJtaXNzaW9uIHRvIHdyaXRlIHRvIEtpbmVzaXNcclxuICAgIGtpbmVzaXNTdHJlYW0uZ3JhbnRXcml0ZSh0aGlzLmluZ2VzdGlvbkxhbWJkYSk7XHJcblxyXG4gICAgLy8gR3JhbnQgWC1SYXkgcGVybWlzc2lvbnNcclxuICAgIHRoaXMuaW5nZXN0aW9uTGFtYmRhLmFkZFRvUm9sZVBvbGljeShuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XHJcbiAgICAgIGFjdGlvbnM6IFtcclxuICAgICAgICAneHJheTpQdXRUcmFjZVNlZ21lbnRzJyxcclxuICAgICAgICAneHJheTpQdXRUZWxlbWV0cnlSZWNvcmRzJyxcclxuICAgICAgXSxcclxuICAgICAgcmVzb3VyY2VzOiBbJyonXSxcclxuICAgIH0pKTtcclxuXHJcbiAgICAvLyBDcmVhdGUgSW9UIFJ1bGUgdG8gdHJpZ2dlciBMYW1iZGFcclxuICAgIGNvbnN0IGlvdFJ1bGUgPSBuZXcgaW90LkNmblRvcGljUnVsZSh0aGlzLCAnR1BTSW5nZXN0aW9uUnVsZScsIHtcclxuICAgICAgcnVsZU5hbWU6IGB0cmFuc3BvcnRfZ3BzX2luZ2VzdGlvbl8ke2Vudmlyb25tZW50fWAsXHJcbiAgICAgIHRvcGljUnVsZVBheWxvYWQ6IHtcclxuICAgICAgICBzcWw6IGBTRUxFQ1QgKiBGUk9NICd0cmFuc3BvcnQvJHtlbnZpcm9ubWVudH0vKy9sb2NhdGlvbidgLFxyXG4gICAgICAgIGRlc2NyaXB0aW9uOiAnUm91dGUgR1BTIGRhdGEgZnJvbSBJb1QgZGV2aWNlcyB0byBpbmdlc3Rpb24gTGFtYmRhJyxcclxuICAgICAgICBhY3Rpb25zOiBbXHJcbiAgICAgICAgICB7XHJcbiAgICAgICAgICAgIGxhbWJkYToge1xyXG4gICAgICAgICAgICAgIGZ1bmN0aW9uQXJuOiB0aGlzLmluZ2VzdGlvbkxhbWJkYS5mdW5jdGlvbkFybixcclxuICAgICAgICAgICAgfSxcclxuICAgICAgICAgIH0sXHJcbiAgICAgICAgXSxcclxuICAgICAgICBlcnJvckFjdGlvbjoge1xyXG4gICAgICAgICAgY2xvdWR3YXRjaExvZ3M6IHtcclxuICAgICAgICAgICAgbG9nR3JvdXBOYW1lOiBgL2F3cy9pb3QvdHJhbnNwb3J0LyR7ZW52aXJvbm1lbnR9L2Vycm9yc2AsXHJcbiAgICAgICAgICAgIHJvbGVBcm46IG5ldyBpYW0uUm9sZSh0aGlzLCAnSW9URXJyb3JMb2dSb2xlJywge1xyXG4gICAgICAgICAgICAgIGFzc3VtZWRCeTogbmV3IGlhbS5TZXJ2aWNlUHJpbmNpcGFsKCdpb3QuYW1hem9uYXdzLmNvbScpLFxyXG4gICAgICAgICAgICAgIGlubGluZVBvbGljaWVzOiB7XHJcbiAgICAgICAgICAgICAgICAnTG9nUG9saWN5JzogbmV3IGlhbS5Qb2xpY3lEb2N1bWVudCh7XHJcbiAgICAgICAgICAgICAgICAgIHN0YXRlbWVudHM6IFtcclxuICAgICAgICAgICAgICAgICAgICBuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XHJcbiAgICAgICAgICAgICAgICAgICAgICBhY3Rpb25zOiBbJ2xvZ3M6Q3JlYXRlTG9nR3JvdXAnLCAnbG9nczpDcmVhdGVMb2dTdHJlYW0nLCAnbG9nczpQdXRMb2dFdmVudHMnXSxcclxuICAgICAgICAgICAgICAgICAgICAgIHJlc291cmNlczogW2Bhcm46YXdzOmxvZ3M6JHt0aGlzLnJlZ2lvbn06JHt0aGlzLmFjY291bnR9OmxvZy1ncm91cDovYXdzL2lvdC90cmFuc3BvcnQvJHtlbnZpcm9ubWVudH0vZXJyb3JzOipgXSxcclxuICAgICAgICAgICAgICAgICAgICB9KSxcclxuICAgICAgICAgICAgICAgICAgXSxcclxuICAgICAgICAgICAgICAgIH0pLFxyXG4gICAgICAgICAgICAgIH0sXHJcbiAgICAgICAgICAgIH0pLnJvbGVBcm4sXHJcbiAgICAgICAgICB9LFxyXG4gICAgICAgIH0sXHJcbiAgICAgICAgcnVsZURpc2FibGVkOiBmYWxzZSxcclxuICAgICAgfSxcclxuICAgIH0pO1xyXG5cclxuICAgIC8vIEdyYW50IElvVCBwZXJtaXNzaW9uIHRvIGludm9rZSBMYW1iZGFcclxuICAgIHRoaXMuaW5nZXN0aW9uTGFtYmRhLmFkZFBlcm1pc3Npb24oJ0FsbG93SW9USW52b2tlJywge1xyXG4gICAgICBwcmluY2lwYWw6IG5ldyBpYW0uU2VydmljZVByaW5jaXBhbCgnaW90LmFtYXpvbmF3cy5jb20nKSxcclxuICAgICAgc291cmNlQXJuOiBgYXJuOmF3czppb3Q6JHt0aGlzLnJlZ2lvbn06JHt0aGlzLmFjY291bnR9OnJ1bGUvJHtpb3RSdWxlLnJ1bGVOYW1lfWAsXHJcbiAgICB9KTtcclxuXHJcbiAgICAvLyBDcmVhdGUgQ2xvdWRXYXRjaCBMb2cgR3JvdXAgZm9yIElvVCBlcnJvcnNcclxuICAgIG5ldyBsb2dzLkxvZ0dyb3VwKHRoaXMsICdJb1RFcnJvckxvZ0dyb3VwJywge1xyXG4gICAgICBsb2dHcm91cE5hbWU6IGAvYXdzL2lvdC90cmFuc3BvcnQvJHtlbnZpcm9ubWVudH0vZXJyb3JzYCxcclxuICAgICAgcmV0ZW50aW9uOiBsb2dzLlJldGVudGlvbkRheXMuT05FX1dFRUssXHJcbiAgICAgIHJlbW92YWxQb2xpY3k6IGNkay5SZW1vdmFsUG9saWN5LkRFU1RST1ksXHJcbiAgICB9KTtcclxuXHJcbiAgICAvLyBPdXRwdXRzXHJcbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnSW5nZXN0aW9uTGFtYmRhTmFtZScsIHtcclxuICAgICAgdmFsdWU6IHRoaXMuaW5nZXN0aW9uTGFtYmRhLmZ1bmN0aW9uTmFtZSxcclxuICAgICAgZGVzY3JpcHRpb246ICdOYW1lIG9mIHRoZSBpbmdlc3Rpb24gTGFtYmRhIGZ1bmN0aW9uJyxcclxuICAgIH0pO1xyXG5cclxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdJb1RSdWxlTmFtZScsIHtcclxuICAgICAgdmFsdWU6IGlvdFJ1bGUucnVsZU5hbWUgfHwgJycsXHJcbiAgICAgIGRlc2NyaXB0aW9uOiAnTmFtZSBvZiB0aGUgSW9UIHJ1bGUgZm9yIEdQUyBpbmdlc3Rpb24nLFxyXG4gICAgfSk7XHJcbiAgfVxyXG59Il19