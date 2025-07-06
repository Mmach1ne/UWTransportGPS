import * as cdk from 'aws-cdk-lib';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
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

export class TrackStoreStack extends cdk.Stack {
  public readonly service: ecs.FargateService;
  public readonly loadBalancer: elbv2.ApplicationLoadBalancer;
  public readonly vpc: ec2.Vpc;
  public readonly cluster: ecs.Cluster;

  constructor(scope: Construct, id: string, props: TrackStoreStackProps) {
    super(scope, id, props);

    const { environment, kinesisStream, deviceTable, locationTable } = props;

    // Create VPC (or use existing) - expose as public property
    this.vpc = new ec2.Vpc(this, 'TrackStoreVPC', {
      vpcName: `trackstore-vpc-${environment}`,
      maxAzs: 2,
      natGateways: environment === 'prod' ? 2 : 1,
    });

    // Create ECS Cluster - expose as public property
    this.cluster = new ecs.Cluster(this, 'TrackStoreCluster', {
      clusterName: `trackstore-cluster-${environment}`,
      vpc: this.vpc,
      containerInsights: true,
    });

    // Create Task Definition
    const taskDefinition = new ecs.FargateTaskDefinition(this, 'TrackStoreTaskDef', {
      family: `trackstore-${environment}`,
      memoryLimitMiB: environment === 'prod' ? 2048 : 1024,
      cpu: environment === 'prod' ? 1024 : 512,
    });

    // Add container
    const container = taskDefinition.addContainer('trackstore', {
      image: ecs.ContainerImage.fromAsset('../services/trackstore'),
      logging: ecs.LogDrivers.awsLogs({
        streamPrefix: 'trackstore',
        logGroup: new logs.LogGroup(this, 'TrackStoreLogGroup', {
          logGroupName: `/ecs/trackstore-${environment}`,
          retention: logs.RetentionDays.ONE_WEEK,
          removalPolicy: cdk.RemovalPolicy.DESTROY,
        }),
      }),
      environment: {
        AWS_REGION: this.region,
        KINESIS_STREAM_NAME: kinesisStream.streamName,
        DEVICE_TABLE_NAME: deviceTable.tableName,
        LOCATION_TABLE_NAME: locationTable.tableName,
        SERVICE_NAME: 'trackstore',
        LOG_LEVEL: 'INFO',
      },
      healthCheck: {
        command: ['CMD-SHELL', 'curl -f http://localhost:8000/health || exit 1'],
        interval: cdk.Duration.seconds(30),
        timeout: cdk.Duration.seconds(10),
        retries: 5,
        startPeriod: cdk.Duration.seconds(120),
      },
    });

    container.addPortMappings({
      containerPort: 8000,
      protocol: ecs.Protocol.TCP,
    });

    // Grant permissions
    kinesisStream.grantRead(taskDefinition.taskRole);
    deviceTable.grantReadWriteData(taskDefinition.taskRole);
    locationTable.grantReadWriteData(taskDefinition.taskRole);

    // Add X-Ray permissions
    taskDefinition.addToTaskRolePolicy(new iam.PolicyStatement({
      actions: [
        'xray:PutTraceSegments',
        'xray:PutTelemetryRecords',
      ],
      resources: ['*'],
    }));

    // Create ALB
    this.loadBalancer = new elbv2.ApplicationLoadBalancer(this, 'TrackStoreALB', {
      loadBalancerName: `trackstore-alb-${environment}`,
      vpc: this.vpc,
      internetFacing: true,
    });

    // Create Fargate Service
    this.service = new ecs.FargateService(this, 'TrackStoreService', {
      serviceName: `trackstore-${environment}`,
      cluster: this.cluster,
      taskDefinition,
      desiredCount: environment === 'prod' ? 2 : 1,
      assignPublicIp: true,
      healthCheckGracePeriod: cdk.Duration.seconds(180),
    });

    // Configure auto-scaling
    const scaling = this.service.autoScaleTaskCount({
      minCapacity: environment === 'prod' ? 2 : 1,
      maxCapacity: environment === 'prod' ? 10 : 3,
    });

    scaling.scaleOnCpuUtilization('CpuScaling', {
      targetUtilizationPercent: 70,
      scaleInCooldown: cdk.Duration.seconds(60),
      scaleOutCooldown: cdk.Duration.seconds(60),
    });

    // Create target group
    const targetGroup = new elbv2.ApplicationTargetGroup(this, 'TrackStoreTargetGroup', {
      vpc: this.vpc,
      port: 8000,
      protocol: elbv2.ApplicationProtocol.HTTP,
      targets: [this.service],
      healthCheck: {
        path: '/health',
        interval: cdk.Duration.seconds(60),
        timeout: cdk.Duration.seconds(10),
        healthyThresholdCount: 2,
        unhealthyThresholdCount: 5,
        healthyHttpCodes: '200-299',
      },
    });

    // Add listener
    this.loadBalancer.addListener('TrackStoreListener', {
      port: 80,
      protocol: elbv2.ApplicationProtocol.HTTP,
      defaultTargetGroups: [targetGroup],
    });

    // Outputs
    new cdk.CfnOutput(this, 'LoadBalancerDNS', {
      value: this.loadBalancer.loadBalancerDnsName,
      description: 'TrackStore Load Balancer DNS',
    });

    new cdk.CfnOutput(this, 'ServiceURL', {
      value: `http://${this.loadBalancer.loadBalancerDnsName}`,
      description: 'TrackStore Service URL',
    });

    new cdk.CfnOutput(this, 'VpcId', {
      value: this.vpc.vpcId,
      description: 'VPC ID for TrackStore',
      exportName: `${this.stackName}-VpcId`,
    });

    new cdk.CfnOutput(this, 'ClusterName', {
      value: this.cluster.clusterName,
      description: 'ECS Cluster name for TrackStore',
      exportName: `${this.stackName}-ClusterName`,
    });

    // Tags
    cdk.Tags.of(this).add('Service', 'TrackStore');
    cdk.Tags.of(this).add('Environment', environment);
  }
}