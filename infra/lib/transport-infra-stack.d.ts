import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as kinesis from 'aws-cdk-lib/aws-kinesis';
import { Construct } from 'constructs';
interface TransportInfraStackProps extends cdk.StackProps {
    environment: string;
}
export declare class TransportInfraStack extends cdk.Stack {
    readonly dataBucket: s3.Bucket;
    readonly deviceTable: dynamodb.Table;
    readonly locationTable: dynamodb.Table;
    readonly gpsDataStream: kinesis.Stream;
    constructor(scope: Construct, id: string, props: TransportInfraStackProps);
}
export {};
