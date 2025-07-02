import os
import json
import boto3
import click
from pathlib import Path
import urllib.request

@click.command()
@click.option('--device-id', default='bus-001', help='Device ID to create')
@click.option('--region', default='us-east-1', help='AWS region')
@click.option('--thing-type', default='TransportGPSDevice-dev', help='IoT Thing Type name')
@click.option('--policy-name', default='TransportDevicePolicy-dev', help='IoT Policy name')
def setup_device(device_id, region, thing_type, policy_name):
    """Create and register an IoT device"""
    
    iot_client = boto3.client('iot', region_name=region)
    
    # Create certs directory
    certs_dir = Path('certs')
    certs_dir.mkdir(exist_ok=True)
    
    click.echo(f"Setting up device: {device_id}")
    
    try:
        click.echo("Creating IoT Thing...")
        iot_client.create_thing(
            thingName=device_id,
            thingTypeName=thing_type,
            attributePayload={
                'attributes': {
                    'deviceType': 'gps-tracker',
                    'vehicleType': 'bus'
                }
            }
        )
        click.echo(f"✓ Created thing: {device_id}")
    except iot_client.exceptions.ResourceAlreadyExistsException:
        click.echo(f"! Thing {device_id} already exists")
    
    click.echo("Creating device certificate...")
    cert_response = iot_client.create_keys_and_certificate(setAsActive=True)
    
    cert_arn = cert_response['certificateArn']
    cert_id = cert_response['certificateId']
    
    cert_path = certs_dir / 'device.pem.crt'
    with open(cert_path, 'w') as f:
        f.write(cert_response['certificatePem'])
    click.echo(f"Saved certificate: {cert_path}")
    
    key_path = certs_dir / 'private.pem.key'
    with open(key_path, 'w') as f:
        f.write(cert_response['keyPair']['PrivateKey'])
    click.echo(f"Saved private key: {key_path}")
    
    click.echo("Downloading AWS Root CA...")
    ca_url = 'https://www.amazontrust.com/repository/AmazonRootCA1.pem'
    ca_path = certs_dir / 'Amazon-root-CA-1.pem'
    urllib.request.urlretrieve(ca_url, ca_path)
    click.echo(f"Downloaded Root CA: {ca_path}")
    
    click.echo(f"Attaching policy {policy_name} to certificate...")
    iot_client.attach_policy(
        policyName=policy_name,
        target=cert_arn
    )
    click.echo("Policy attached")
    
    click.echo("Attaching certificate to thing...")
    iot_client.attach_thing_principal(
        thingName=device_id,
        principal=cert_arn
    )
    click.echo("Certificate attached to thing")
    
    endpoint_response = iot_client.describe_endpoint(endpointType='iot:Data-ATS')
    endpoint = endpoint_response['endpointAddress']
    
    env_content = f"""# AWS IoT Configuration
IOT_ENDPOINT={endpoint}
IOT_CERT_PATH=certs/device.pem.crt
IOT_KEY_PATH=certs/private.pem.key
IOT_CA_PATH=certs/Amazon-root-CA-1.pem

# Device settings
DEVICE_ID={device_id}
PUBLISH_INTERVAL=5
BUS_SPEED_KMH=30
"""
    
    with open('.env', 'w') as f:
        f.write(env_content)
    click.echo("✓ Created .env file")
    
    # Summary
    click.echo("\n" + "="*50)
    click.echo("Device setup has been complete!")
    click.echo(f"Device ID: {device_id}")
    click.echo(f"IoT Endpoint: {endpoint}")
    click.echo(f"Certificate ID: {cert_id}")
    click.echo("\nTo run the simulator:")
    click.echo("  python simulator.py")
    click.echo("="*50)

if __name__ == '__main__':
    setup_device()