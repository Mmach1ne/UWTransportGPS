import * as cdk from 'aws-cdk-lib';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as kinesis from 'aws-cdk-lib/aws-kinesis';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { Construct } from 'constructs';
interface TrackStoreStackProps extends cdk.StackProps {
    environment: string;
    kinesisStream: kinesis.Stream;
    deviceTable: dynamodb.Table;
    locationTable: dynamodb.Table;
}
export declare class TrackStoreStack extends cdk.Stack {
    readonly service: ecs.FargateService;
    readonly loadBalancer: elbv2.ApplicationLoadBalancer;
    constructor(scope: Construct, id: string, props: TrackStoreStackProps);
}
export {};
