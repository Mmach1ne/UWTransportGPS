#!/usr/bin/env python3
"""
Diagnostic script to check Kinesis stream health and data flow
"""

import boto3
import json
from datetime import datetime, timedelta
import time

def check_kinesis_stream(stream_name='transport-gps-stream-dev', region='us-east-1'):
    """Check Kinesis stream status and recent data"""
    
    kinesis = boto3.client('kinesis', region_name=region)
    cloudwatch = boto3.client('cloudwatch', region_name=region)
    
    print(f"🔍 Checking Kinesis Stream: {stream_name}\n")
    
    try:
        # 1. Check stream status
        print("1️⃣ Stream Status:")
        response = kinesis.describe_stream(StreamName=stream_name)
        stream_desc = response['StreamDescription']
        
        print(f"   Status: {stream_desc['StreamStatus']}")
        print(f"   Shards: {len(stream_desc['Shards'])}")
        print(f"   Retention: {stream_desc['RetentionPeriodHours']} hours")
        print(f"   Encryption: {stream_desc.get('EncryptionType', 'None')}")
        
        # 2. Check CloudWatch metrics
        print("\n2️⃣ Stream Metrics (last hour):")
        
        end_time = datetime.utcnow()
        start_time = end_time - timedelta(hours=1)
        
        # Check incoming records
        metrics = cloudwatch.get_metric_statistics(
            Namespace='AWS/Kinesis',
            MetricName='IncomingRecords',
            Dimensions=[{'Name': 'StreamName', 'Value': stream_name}],
            StartTime=start_time,
            EndTime=end_time,
            Period=300,
            Statistics=['Sum']
        )
        
        total_records = sum(dp['Sum'] for dp in metrics['Datapoints'])
        print(f"   Incoming Records: {int(total_records)}")
        
        # Check put success rate
        put_success = cloudwatch.get_metric_statistics(
            Namespace='AWS/Kinesis',
            MetricName='PutRecords.Success',
            Dimensions=[{'Name': 'StreamName', 'Value': stream_name}],
            StartTime=start_time,
            EndTime=end_time,
            Period=300,
            Statistics=['Average']
        )
        
        if put_success['Datapoints']:
            avg_success = sum(dp['Average'] for dp in put_success['Datapoints']) / len(put_success['Datapoints'])
            print(f"   Put Success Rate: {avg_success:.2f}%")
        
        # 3. Try to read recent records
        print("\n3️⃣ Recent Records:")
        
        if stream_desc['Shards']:
            shard = stream_desc['Shards'][0]
            shard_id = shard['ShardId']
            
            # Get iterator for the last few records
            iterator_response = kinesis.get_shard_iterator(
                StreamName=stream_name,
                ShardId=shard_id,
                ShardIteratorType='TRIM_HORIZON'  # Start from beginning
            )
            
            shard_iterator = iterator_response['ShardIterator']
            
            # Read records
            records_response = kinesis.get_records(
                ShardIterator=shard_iterator,
                Limit=5
            )
            
            records = records_response['Records']
            
            if records:
                print(f"   Found {len(records)} records:")
                for i, record in enumerate(records[:3]):  # Show first 3
                    data = json.loads(record['Data'])
                    timestamp = datetime.fromtimestamp(data.get('ts', 0) / 1000)
                    print(f"   [{i+1}] Bus: {data.get('busId')} at {timestamp}")
                    print(f"       Location: ({data.get('lat')}, {data.get('lon')})")
                    print(f"       Partition Key: {record['PartitionKey']}")
            else:
                print("   ❌ No records found in stream")
                
        # 4. Check for errors
        print("\n4️⃣ Error Metrics:")
        
        user_errors = cloudwatch.get_metric_statistics(
            Namespace='AWS/Kinesis',
            MetricName='UserRecordsPending',
            Dimensions=[{'Name': 'StreamName', 'Value': stream_name}],
            StartTime=start_time,
            EndTime=end_time,
            Period=300,
            Statistics=['Maximum']
        )
        
        if user_errors['Datapoints']:
            max_pending = max(dp['Maximum'] for dp in user_errors['Datapoints'])
            print(f"   Max Records Pending: {int(max_pending)}")
        
    except Exception as e:
        print(f"\n❌ Error: {str(e)}")
        print("\nPossible issues:")
        print("- Stream doesn't exist")
        print("- No permissions to read stream")
        print("- AWS credentials not configured")

def check_lambda_logs(function_name='transport-ingestion-dev', region='us-east-1'):
    """Check recent Lambda logs"""
    
    logs = boto3.client('logs', region_name=region)
    
    print(f"\n🔍 Checking Lambda Logs: {function_name}\n")
    
    try:
        # Get log streams
        log_group = f'/aws/lambda/{function_name}'
        streams = logs.describe_log_streams(
            logGroupName=log_group,
            orderBy='LastEventTime',
            descending=True,
            limit=1
        )
        
        if streams['logStreams']:
            stream = streams['logStreams'][0]
            
            # Get recent events
            events = logs.get_log_events(
                logGroupName=log_group,
                logStreamName=stream['logStreamName'],
                limit=10
            )
            
            print("Recent log entries:")
            for event in events['events'][-5:]:  # Last 5 events
                timestamp = datetime.fromtimestamp(event['timestamp'] / 1000)
                print(f"[{timestamp}] {event['message'].strip()}")
        else:
            print("❌ No log streams found")
            
    except Exception as e:
        print(f"❌ Error checking logs: {str(e)}")

def check_iot_rule(rule_name='transport_gps_ingestion_dev', region='us-east-1'):
    """Check IoT rule status"""
    
    iot = boto3.client('iot', region_name=region)
    
    print(f"\n🔍 Checking IoT Rule: {rule_name}\n")
    
    try:
        rule = iot.get_topic_rule(ruleName=rule_name)
        rule_info = rule['rule']
        
        print(f"   Status: {'Enabled' if not rule_info['ruleDisabled'] else 'Disabled'}")
        print(f"   SQL: {rule_info['sql']}")
        print(f"   Actions: {len(rule_info['actions'])}")
        
        if rule_info['actions']:
            for action in rule_info['actions']:
                if 'lambda' in action:
                    print(f"   → Lambda: {action['lambda']['functionArn']}")
                    
    except Exception as e:
        print(f"❌ Error: {str(e)}")

if __name__ == "__main__":
    print("=== GPS Pipeline Diagnostic ===\n")
    
    # Check each component
    check_kinesis_stream()
    check_lambda_logs()
    check_iot_rule()
    
    print("\n=== Diagnostic Complete ===")
    print("\nIf no data is flowing:")
    print("1. Ensure device simulator is running")
    print("2. Check IoT Core endpoint is correct")
    print("3. Verify IoT certificates are valid")
    print("4. Check CloudWatch Logs for errors")