# Transport GPS Tracking System

A monorepo for a real-time GPS tracking system for transport vehicles.

## Project Structure

```
transport-gps/
├── frontend/           # Frontend applications
│   └── web/           # Next.js web application
├── services/          # Backend microservices
│   ├── device-api/    # Device management API
│   ├── location-api/  # Location tracking API
│   └── analytics/     # Analytics service
├── device-sim/        # IoT device simulator
├── infra/            # Infrastructure as Code (AWS CDK)
├── packages/         # Shared packages
│   ├── ui/           # Shared UI components
│   └── utils/        # Shared utilities
└── package.json      # Root package configuration
```

## Quick Start

1. **Install dependencies**
   ```bash
   yarn install
   ```

2. **Set up infrastructure** (see `/infra/README.md`)
   ```bash
   cd infra
   npm run deploy:dev
   ```

3. **Run development servers**
   ```bash
   yarn dev
   ```

## Technology Stack

- **Frontend**: Next.js, React, TypeScript, Tailwind CSS
- **Backend**: Node.js, AWS Lambda, API Gateway
- **Database**: DynamoDB, S3
- **IoT**: AWS IoT Core
- **Infrastructure**: AWS CDK (TypeScript)
- **Monorepo**: Yarn Workspaces, Turbo

## Development Workflow

1. Create feature branches from `main`
2. Use conventional commits: `feat(scope): message`
3. Run tests before pushing
4. Create PR for review

## Deployment

- **Development**: Automatic deployment on merge to `main`
- **Production**: Manual deployment after approval

## Environment Variables

See `.env.template` for required environment variables.

## License

Private - All rights reserved