import * as cdk from 'aws-cdk-lib';
import * as budgets from 'aws-cdk-lib/aws-budgets';
import { Construct } from 'constructs';

interface BudgetStackProps extends cdk.StackProps {
  environment: string;
  budgetAmount: number;
  emailAddress: string;
}

export class BudgetStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: BudgetStackProps) {
    super(scope, id, props);

    // Create monthly budget
    new budgets.CfnBudget(this, 'MonthlyBudget', {
      budget: {
        budgetType: 'COST',
        timeUnit: 'MONTHLY',
        budgetLimit: {
          amount: props.budgetAmount,
          unit: 'USD',
        },
        budgetName: `transport-gps-${props.environment}-monthly-budget`,
        costFilters: {
          // Optional: Add tags to filter costs
          TagKeyValue: [`Environment$${props.environment}`],
        },
      },
      notificationsWithSubscribers: [
        {
          notification: {
            notificationType: 'FORECASTED',
            comparisonOperator: 'GREATER_THAN',
            threshold: 80,
            thresholdType: 'PERCENTAGE',
          },
          subscribers: [
            {
              subscriptionType: 'EMAIL',
              address: props.emailAddress,
            },
          ],
        },
        {
          notification: {
            notificationType: 'ACTUAL',
            comparisonOperator: 'GREATER_THAN',
            threshold: 90,
            thresholdType: 'PERCENTAGE',
          },
          subscribers: [
            {
              subscriptionType: 'EMAIL',
              address: props.emailAddress,
            },
          ],
        },
        {
          notification: {
            notificationType: 'ACTUAL',
            comparisonOperator: 'GREATER_THAN',
            threshold: 100,
            thresholdType: 'PERCENTAGE',
          },
          subscribers: [
            {
              subscriptionType: 'EMAIL',
              address: props.emailAddress,
            },
          ],
        },
      ],
    });

    // Output budget information
    new cdk.CfnOutput(this, 'BudgetName', {
      value: `transport-gps-${props.environment}-monthly-budget`,
      description: 'Name of the created budget',
    });
  }
}