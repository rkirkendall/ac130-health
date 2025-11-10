# Medical Record Viewer Web Application

A read-only web application for viewing medical records stored in MongoDB. Built with Next.js and ShadCN UI components.

## Features

- **Patient Selection**: Select from a list of patients in the top header
- **Record Type Sidebar**: View all available record types with counts for the selected patient
- **Data Viewer**: View detailed information for each record type in the main content area
- **Black & White Theme**: Clean, professional monochrome design

## Record Types Supported

- Visits
- Prescriptions
- Labs
- Conditions
- Allergies
- Immunizations
- Vital Signs
- Procedures
- Imaging
- Insurance
- Treatments

## Running with Docker Compose

The web application is automatically started when you run the Docker Compose stack:

```bash
# From the project root directory
docker compose up -d
```

The application will be available at: **http://localhost:3001**

## Environment Variables

The following environment variables are configured in `docker-compose.yml`:

- `MONGODB_URI`: MongoDB connection string (default: `mongodb://mongodb:27017`)
- `NODE_ENV`: Node environment (set to `production` in container)

## Architecture

- **Frontend**: Next.js 16 with React and TypeScript
- **UI Components**: ShadCN (Radix UI) with Tailwind CSS
- **Database**: MongoDB via the shared MongoDB container
- **Port**: Exposed on port 3001 (mapped to container port 3000)

## Development

To run the application in development mode:

```bash
cd webapp
npm install
npm run dev
```

Make sure MongoDB is running and the `MONGODB_URI` environment variable is set in `.env.local`:

```
MONGODB_URI=mongodb://localhost:27017
```

## Building

The application uses Next.js standalone output for optimized Docker deployments:

```bash
npm run build
```

## Docker Build

The Dockerfile uses a multi-stage build process:
1. **deps**: Install dependencies
2. **builder**: Build the Next.js application
3. **runner**: Production runtime with minimal footprint
