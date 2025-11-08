# Changelog

## [0.9.0] - 2025-01-08 (Pre-release)

### Added
- **Procedure/Surgery Tracking**: Complete surgical and procedure history
  - `create_procedure` tool - Create single or multiple procedures (bulk support)
  - `update_procedure` tool - Update procedure details
  - `get_procedure` tool - Retrieve procedure by ID
  - Procedure types: surgery, diagnostic, therapeutic, other
  - Track date, location, indication, outcome, complications
  - Link to performing provider
- **Imaging/Radiology Tracking**: Comprehensive imaging study management
  - `create_imaging` tool - Create single or multiple imaging records (bulk support)
  - `update_imaging` tool - Update imaging details
  - `get_imaging` tool - Retrieve imaging by ID
  - Modalities: X-Ray, CT, MRI, Ultrasound, PET, Nuclear, Other
  - Track findings, impression, report URL
  - Link to ordering provider
- **Insurance Coverage Tracking**: Patient insurance information management
  - `create_insurance` tool - Create single or multiple insurance records (bulk support)
  - `update_insurance` tool - Update insurance details
  - `get_insurance` tool - Retrieve insurance by ID
  - Coverage types: primary, secondary, tertiary
  - Track provider, plan, policy number, group number
  - Effective and termination dates

### Database Changes
- Added `procedures` collection with indexes on `patient_id` and `procedure_type`
- Added `imaging` collection with indexes on `patient_id` and `modality`
- Added `insurance` collection with indexes on `patient_id` and `coverage_type`

### Total Tool Count
**41 tools** (up from 32 in v0.8.0):
- 9 new tools for procedures, imaging, and insurance
- All with bulk creation support

## [0.8.0] - 2025-01-08 (Pre-release)

### Added
- **Docker Support**: Complete Docker and Docker Compose configuration
  - Dockerfile for MCP server
  - docker-compose.yml with MongoDB and MCP server services
  - Persistent MongoDB data volumes
  - Health checks for MongoDB
  - Comprehensive DOCKER.md documentation
- **Allergy Tracking**: New entity for managing patient allergies
  - `create_allergy` tool - Create single or multiple allergies (bulk support)
  - `update_allergy` tool - Update allergy details
  - `get_allergy` tool - Retrieve allergy by ID
  - Support for allergy types: drug, food, environmental, other
  - Severity levels: mild, moderate, severe, life-threatening
  - Verification tracking by providers
- **Immunization/Vaccination Tracking**: Complete vaccination history management
  - `create_immunization` tool - Create single or multiple immunizations (bulk support)
  - `update_immunization` tool - Update immunization records
  - `get_immunization` tool - Retrieve immunization by ID
  - Track vaccine name, date, dose number, lot number
  - Record administration details (site, route, provider)
- **Vital Signs Tracking**: Comprehensive vital signs monitoring
  - `create_vital_signs` tool - Create single or multiple vital records (bulk support)
  - `update_vital_signs` tool - Update vital signs
  - `get_vital_signs` tool - Retrieve vitals by ID
  - Support for: blood pressure, heart rate, temperature, respiratory rate, oxygen saturation, weight, height, BMI
  - Flexible unit support (metric/imperial)

### Database Changes
- Added `allergies` collection with indexes on `patient_id` and `type`
- Added `immunizations` collection with indexes on `patient_id` and `vaccine_name`
- Added `vital_signs` collection with indexes on `patient_id` and `recorded_at`

### Documentation Updates
- New DOCKER.md with comprehensive Docker setup and usage guide
- Updated README.md with Docker installation option (recommended)
- Updated README.md with new entity tools (allergies, immunizations, vitals)
- Added documentation for all new tool schemas

### Total Tool Count
**32 tools** (up from 23):
- 9 new allergy/immunization/vitals tools
- All with bulk creation support

## [0.7.0] - 2025-01-08 (Pre-release)

### Added
- **Bulk Creation Support**: All create tools now accept single objects OR arrays
  - `create_patient` - Create one or multiple patients in a single call
  - `create_visit` - Create one or multiple visits in a single call
  - `create_prescription` - Create one or multiple prescriptions in a single call
  - `create_lab` - Create one or multiple lab records in a single call
  - `create_condition` - Create one or multiple conditions in a single call
  - Perfect for PDF parsing workflows where multiple records are extracted at once
  - Uses MongoDB `insertMany` for efficient batch insertion
  - Bulk responses include count and full array of created records

### Changed
- Updated Zod schemas to use `z.union([DataSchema, z.array(DataSchema)])` pattern
- Updated tool descriptions in MCP server to indicate bulk support
- Enhanced README with bulk data entry workflow example

## [0.6.0] - 2025-01-08 (Pre-release)

### Added
- **List Patients Tool**: New `list_patients` tool to search/filter patients by relationship
  - Enables "my dad" queries to work by listing patients with relationship="dad"
  - Optional filtering by relationship
  - Returns all patients if no filter specified
  - Configurable limit (default 50)

## [0.5.0] - 2025-01-08 (Pre-release)

### Added
- **Condition/Diagnosis Tracking**: New entity for managing patient conditions and diagnoses
  - `create_condition` tool - Create new condition records
  - `update_condition` tool - Update existing conditions (status, severity, etc.)
  - `get_condition` tool - Retrieve condition by ID
  - Support for condition status: `active`, `resolved`, `chronic`
  - Support for severity levels: `mild`, `moderate`, `severe`
  - Link conditions to diagnosing providers
  - Track diagnosis and resolution dates

### Database Changes
- Added `conditions` collection with indexes on `patient_id` and `status`
- Schema includes: name, diagnosed_date, resolved_date, status, severity, notes, diagnosed_by

### Documentation Updates
- Updated README.md with condition tools
- Updated PROJECT_SUMMARY.md with new tool count (22 total)
- Updated all relevant documentation to include conditions collection

## [0.1.0] - 2025-01-08 (Initial Pre-release)

### Initial Release
- TypeScript MCP server with MongoDB integration
- Patient management with relationship tracking
- Provider, visit, prescription, lab, and treatment tools
- Active health summary as MCP resource
- Provenance tracking on all entities
- Base care manager prompt
- Comprehensive documentation

