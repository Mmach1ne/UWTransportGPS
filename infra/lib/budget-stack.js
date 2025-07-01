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
exports.BudgetStack = void 0;
const cdk = __importStar(require("aws-cdk-lib"));
const budgets = __importStar(require("aws-cdk-lib/aws-budgets"));
class BudgetStack extends cdk.Stack {
    constructor(scope, id, props) {
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
exports.BudgetStack = BudgetStack;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYnVkZ2V0LXN0YWNrLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiYnVkZ2V0LXN0YWNrLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQUEsaURBQW1DO0FBQ25DLGlFQUFtRDtBQVVuRCxNQUFhLFdBQVksU0FBUSxHQUFHLENBQUMsS0FBSztJQUN4QyxZQUFZLEtBQWdCLEVBQUUsRUFBVSxFQUFFLEtBQXVCO1FBQy9ELEtBQUssQ0FBQyxLQUFLLEVBQUUsRUFBRSxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBRXhCLHdCQUF3QjtRQUN4QixJQUFJLE9BQU8sQ0FBQyxTQUFTLENBQUMsSUFBSSxFQUFFLGVBQWUsRUFBRTtZQUMzQyxNQUFNLEVBQUU7Z0JBQ04sVUFBVSxFQUFFLE1BQU07Z0JBQ2xCLFFBQVEsRUFBRSxTQUFTO2dCQUNuQixXQUFXLEVBQUU7b0JBQ1gsTUFBTSxFQUFFLEtBQUssQ0FBQyxZQUFZO29CQUMxQixJQUFJLEVBQUUsS0FBSztpQkFDWjtnQkFDRCxVQUFVLEVBQUUsaUJBQWlCLEtBQUssQ0FBQyxXQUFXLGlCQUFpQjtnQkFDL0QsV0FBVyxFQUFFO29CQUNYLHFDQUFxQztvQkFDckMsV0FBVyxFQUFFLENBQUMsZUFBZSxLQUFLLENBQUMsV0FBVyxFQUFFLENBQUM7aUJBQ2xEO2FBQ0Y7WUFDRCw0QkFBNEIsRUFBRTtnQkFDNUI7b0JBQ0UsWUFBWSxFQUFFO3dCQUNaLGdCQUFnQixFQUFFLFlBQVk7d0JBQzlCLGtCQUFrQixFQUFFLGNBQWM7d0JBQ2xDLFNBQVMsRUFBRSxFQUFFO3dCQUNiLGFBQWEsRUFBRSxZQUFZO3FCQUM1QjtvQkFDRCxXQUFXLEVBQUU7d0JBQ1g7NEJBQ0UsZ0JBQWdCLEVBQUUsT0FBTzs0QkFDekIsT0FBTyxFQUFFLEtBQUssQ0FBQyxZQUFZO3lCQUM1QjtxQkFDRjtpQkFDRjtnQkFDRDtvQkFDRSxZQUFZLEVBQUU7d0JBQ1osZ0JBQWdCLEVBQUUsUUFBUTt3QkFDMUIsa0JBQWtCLEVBQUUsY0FBYzt3QkFDbEMsU0FBUyxFQUFFLEVBQUU7d0JBQ2IsYUFBYSxFQUFFLFlBQVk7cUJBQzVCO29CQUNELFdBQVcsRUFBRTt3QkFDWDs0QkFDRSxnQkFBZ0IsRUFBRSxPQUFPOzRCQUN6QixPQUFPLEVBQUUsS0FBSyxDQUFDLFlBQVk7eUJBQzVCO3FCQUNGO2lCQUNGO2dCQUNEO29CQUNFLFlBQVksRUFBRTt3QkFDWixnQkFBZ0IsRUFBRSxRQUFRO3dCQUMxQixrQkFBa0IsRUFBRSxjQUFjO3dCQUNsQyxTQUFTLEVBQUUsR0FBRzt3QkFDZCxhQUFhLEVBQUUsWUFBWTtxQkFDNUI7b0JBQ0QsV0FBVyxFQUFFO3dCQUNYOzRCQUNFLGdCQUFnQixFQUFFLE9BQU87NEJBQ3pCLE9BQU8sRUFBRSxLQUFLLENBQUMsWUFBWTt5QkFDNUI7cUJBQ0Y7aUJBQ0Y7YUFDRjtTQUNGLENBQUMsQ0FBQztRQUVILDRCQUE0QjtRQUM1QixJQUFJLEdBQUcsQ0FBQyxTQUFTLENBQUMsSUFBSSxFQUFFLFlBQVksRUFBRTtZQUNwQyxLQUFLLEVBQUUsaUJBQWlCLEtBQUssQ0FBQyxXQUFXLGlCQUFpQjtZQUMxRCxXQUFXLEVBQUUsNEJBQTRCO1NBQzFDLENBQUMsQ0FBQztJQUNMLENBQUM7Q0FDRjtBQXZFRCxrQ0F1RUMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgKiBhcyBjZGsgZnJvbSAnYXdzLWNkay1saWInO1xyXG5pbXBvcnQgKiBhcyBidWRnZXRzIGZyb20gJ2F3cy1jZGstbGliL2F3cy1idWRnZXRzJztcclxuaW1wb3J0ICogYXMgZG90ZW52IGZyb20gJ2RvdGVudic7XHJcbmltcG9ydCB7IENvbnN0cnVjdCB9IGZyb20gJ2NvbnN0cnVjdHMnO1xyXG5cclxuaW50ZXJmYWNlIEJ1ZGdldFN0YWNrUHJvcHMgZXh0ZW5kcyBjZGsuU3RhY2tQcm9wcyB7XHJcbiAgZW52aXJvbm1lbnQ6IHN0cmluZztcclxuICBidWRnZXRBbW91bnQ6IG51bWJlcjtcclxuICBlbWFpbEFkZHJlc3M6IHN0cmluZztcclxufVxyXG5cclxuZXhwb3J0IGNsYXNzIEJ1ZGdldFN0YWNrIGV4dGVuZHMgY2RrLlN0YWNrIHtcclxuICBjb25zdHJ1Y3RvcihzY29wZTogQ29uc3RydWN0LCBpZDogc3RyaW5nLCBwcm9wczogQnVkZ2V0U3RhY2tQcm9wcykge1xyXG4gICAgc3VwZXIoc2NvcGUsIGlkLCBwcm9wcyk7XHJcblxyXG4gICAgLy8gQ3JlYXRlIG1vbnRobHkgYnVkZ2V0XHJcbiAgICBuZXcgYnVkZ2V0cy5DZm5CdWRnZXQodGhpcywgJ01vbnRobHlCdWRnZXQnLCB7XHJcbiAgICAgIGJ1ZGdldDoge1xyXG4gICAgICAgIGJ1ZGdldFR5cGU6ICdDT1NUJyxcclxuICAgICAgICB0aW1lVW5pdDogJ01PTlRITFknLFxyXG4gICAgICAgIGJ1ZGdldExpbWl0OiB7XHJcbiAgICAgICAgICBhbW91bnQ6IHByb3BzLmJ1ZGdldEFtb3VudCxcclxuICAgICAgICAgIHVuaXQ6ICdVU0QnLFxyXG4gICAgICAgIH0sXHJcbiAgICAgICAgYnVkZ2V0TmFtZTogYHRyYW5zcG9ydC1ncHMtJHtwcm9wcy5lbnZpcm9ubWVudH0tbW9udGhseS1idWRnZXRgLFxyXG4gICAgICAgIGNvc3RGaWx0ZXJzOiB7XHJcbiAgICAgICAgICAvLyBPcHRpb25hbDogQWRkIHRhZ3MgdG8gZmlsdGVyIGNvc3RzXHJcbiAgICAgICAgICBUYWdLZXlWYWx1ZTogW2BFbnZpcm9ubWVudCQke3Byb3BzLmVudmlyb25tZW50fWBdLFxyXG4gICAgICAgIH0sXHJcbiAgICAgIH0sXHJcbiAgICAgIG5vdGlmaWNhdGlvbnNXaXRoU3Vic2NyaWJlcnM6IFtcclxuICAgICAgICB7XHJcbiAgICAgICAgICBub3RpZmljYXRpb246IHtcclxuICAgICAgICAgICAgbm90aWZpY2F0aW9uVHlwZTogJ0ZPUkVDQVNURUQnLFxyXG4gICAgICAgICAgICBjb21wYXJpc29uT3BlcmF0b3I6ICdHUkVBVEVSX1RIQU4nLFxyXG4gICAgICAgICAgICB0aHJlc2hvbGQ6IDgwLFxyXG4gICAgICAgICAgICB0aHJlc2hvbGRUeXBlOiAnUEVSQ0VOVEFHRScsXHJcbiAgICAgICAgICB9LFxyXG4gICAgICAgICAgc3Vic2NyaWJlcnM6IFtcclxuICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgIHN1YnNjcmlwdGlvblR5cGU6ICdFTUFJTCcsXHJcbiAgICAgICAgICAgICAgYWRkcmVzczogcHJvcHMuZW1haWxBZGRyZXNzLFxyXG4gICAgICAgICAgICB9LFxyXG4gICAgICAgICAgXSxcclxuICAgICAgICB9LFxyXG4gICAgICAgIHtcclxuICAgICAgICAgIG5vdGlmaWNhdGlvbjoge1xyXG4gICAgICAgICAgICBub3RpZmljYXRpb25UeXBlOiAnQUNUVUFMJyxcclxuICAgICAgICAgICAgY29tcGFyaXNvbk9wZXJhdG9yOiAnR1JFQVRFUl9USEFOJyxcclxuICAgICAgICAgICAgdGhyZXNob2xkOiA5MCxcclxuICAgICAgICAgICAgdGhyZXNob2xkVHlwZTogJ1BFUkNFTlRBR0UnLFxyXG4gICAgICAgICAgfSxcclxuICAgICAgICAgIHN1YnNjcmliZXJzOiBbXHJcbiAgICAgICAgICAgIHtcclxuICAgICAgICAgICAgICBzdWJzY3JpcHRpb25UeXBlOiAnRU1BSUwnLFxyXG4gICAgICAgICAgICAgIGFkZHJlc3M6IHByb3BzLmVtYWlsQWRkcmVzcyxcclxuICAgICAgICAgICAgfSxcclxuICAgICAgICAgIF0sXHJcbiAgICAgICAgfSxcclxuICAgICAgICB7XHJcbiAgICAgICAgICBub3RpZmljYXRpb246IHtcclxuICAgICAgICAgICAgbm90aWZpY2F0aW9uVHlwZTogJ0FDVFVBTCcsXHJcbiAgICAgICAgICAgIGNvbXBhcmlzb25PcGVyYXRvcjogJ0dSRUFURVJfVEhBTicsXHJcbiAgICAgICAgICAgIHRocmVzaG9sZDogMTAwLFxyXG4gICAgICAgICAgICB0aHJlc2hvbGRUeXBlOiAnUEVSQ0VOVEFHRScsXHJcbiAgICAgICAgICB9LFxyXG4gICAgICAgICAgc3Vic2NyaWJlcnM6IFtcclxuICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgIHN1YnNjcmlwdGlvblR5cGU6ICdFTUFJTCcsXHJcbiAgICAgICAgICAgICAgYWRkcmVzczogcHJvcHMuZW1haWxBZGRyZXNzLFxyXG4gICAgICAgICAgICB9LFxyXG4gICAgICAgICAgXSxcclxuICAgICAgICB9LFxyXG4gICAgICBdLFxyXG4gICAgfSk7XHJcblxyXG4gICAgLy8gT3V0cHV0IGJ1ZGdldCBpbmZvcm1hdGlvblxyXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ0J1ZGdldE5hbWUnLCB7XHJcbiAgICAgIHZhbHVlOiBgdHJhbnNwb3J0LWdwcy0ke3Byb3BzLmVudmlyb25tZW50fS1tb250aGx5LWJ1ZGdldGAsXHJcbiAgICAgIGRlc2NyaXB0aW9uOiAnTmFtZSBvZiB0aGUgY3JlYXRlZCBidWRnZXQnLFxyXG4gICAgfSk7XHJcbiAgfVxyXG59Il19