import * as cdk from 'aws-cdk-lib';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { Construct } from 'constructs';
interface GeofenceStackProps extends cdk.StackProps {
    environment: string;
    vpc?: ec2.IVpc;
    cluster?: ecs.ICluster;
}
export declare class GeofenceStack extends cdk.Stack {
    readonly service: ecs.FargateService;
    readonly loadBalancer: elbv2.ApplicationLoadBalancer;
    readonly geofenceTable: dynamodb.Table;
    readonly alertsTable: dynamodb.Table;
    constructor(scope: Construct, id: string, props: GeofenceStackProps);
}
export {};
