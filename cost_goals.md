# AC130 Cost Goals

## Target Baseline: <$10/month Idle Spend

This document outlines the cost constraints and optimization goals for the AC130 Health web deployment on Google Cloud Platform. The primary objective is to maintain sub-$10 monthly spend at zero traffic while supporting scalable growth without fixed overheads.

## Architecture Decisions for Cost Control

### Cloud Run (Next.js App)
- **No Global HTTPS Load Balancer**: Use Cloud Run's direct custom domain mapping to eliminate the ~$18/month minimum load balancer cost.
- **Managed Certificates**: Rely on Cloud Run's built-in TLS certificates (free).
- **Zero Scaling**: Cloud Run scales to zero instances when idle, ensuring $0 compute cost during no-traffic periods.
- **Scaling Expectations**:
  - 0 traffic: $0
  - 1M page views (0.25 vCPU/512 MB): ~$10/month
  - CPU: $0.000024 per vCPU-second
  - Memory: $0.0000025 per GiB-second
  - Bandwidth: $0.12–$0.15/GB egress (North America)

### Firestore
- **First 1 GiB Storage**: Free
- **Reads**: $0.18 per 100K operations
- **Writes**: $0.12 per 100K operations
- **Deletes**: $0.02 per 100K operations
- **Scaling Expectations**:
  - ~$5/month per 1M reads + 500K writes
  - Use composite indexes sparingly to control costs

### Cloud Functions (MCP & Account Services)
- **Invocations**: $0.40 per million + $0.0000024 per GB-second
- **Scaling Expectations**:
  - Light API usage: <$1/month
  - Zero invocations when idle: $0

### Secret Manager
- **First 6 Secrets**: Free
- **Additional Secrets**: $0.06 per secret/month
- **Accesses**: $0.03 per 10K operations
- **Scaling Expectations**: Minimal cost with low-frequency access

### Cloud DNS
- **Managed Zone**: $0.20 per zone/month
- **Queries**: $0.40 per million
- **Scaling Expectations**: <$1/month for single zone

### Domain Renewals
- **External Registrar**: ~$12/year per domain (ac130.health, ac130health.com)
- **Not included in GCP billing**

## Monitoring & Alerts

### Billing Review Cadence
- Monthly GCP billing review against these targets
- Set up budget alerts at $5/month threshold
- Monitor Cloud Run request metrics and Firestore operations

### Cost Optimization Checks
- Quarterly: Review unused Firestore indexes
- Monthly: Check Secret Manager usage vs. free tier
- Weekly: Monitor Cloud Run cold starts and latency

## Scaling Triggers

### Traffic Growth
- When exceeding 1M monthly page views, evaluate regional load balancer if needed
- Monitor bandwidth costs vs. traffic patterns

### Data Growth
- When Firestore exceeds 1 GiB, evaluate storage optimization
- Monitor read/write patterns for index optimization opportunities

## Emergency Cost Controls

### Immediate Actions if Budget Exceeded
1. Review recent traffic spikes in Cloud Logging
2. Check for unexpected Cloud Function invocations
3. Verify no runaway queries or loops in application code
4. Scale down Cloud Run concurrency limits if needed

### Cost Ceiling
- Hard cap at $50/month before manual intervention
- Automatic alerts configured in GCP billing
