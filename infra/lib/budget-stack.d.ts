import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
interface BudgetStackProps extends cdk.StackProps {
    environment: string;
    budgetAmount: number;
    emailAddress: string;
}
export declare class BudgetStack extends cdk.Stack {
    constructor(scope: Construct, id: string, props: BudgetStackProps);
}
export {};
