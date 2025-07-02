import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as kinesis from 'aws-cdk-lib/aws-kinesis';
import { Construct } from 'constructs';
interface IngestionLambdaStackProps extends cdk.StackProps {
    environment: string;
    kinesisStream: kinesis.Stream;
}
export declare class IngestionLambdaStack extends cdk.Stack {
    readonly ingestionLambda: lambda.Function;
    constructor(scope: Construct, id: string, props: IngestionLambdaStackProps);
}
export {};
