import { MongoClient, Db, Collection } from 'mongodb';
import type {
  Dependent,
  PhiVaultEntry,
  Provider,
  Visit,
  Prescription,
  Lab,
  Treatment,
  Condition,
  Allergy,
  Immunization,
  VitalSigns,
  Procedure,
  Imaging,
  Insurance,
  ActiveSummary,
} from './types.js';

export class Database {
  private client: MongoClient;
  private db: Db | null = null;
  private readonly configuredDbName?: string;

  constructor(uri: string, dbName?: string) {
    this.client = new MongoClient(uri);
    this.configuredDbName = dbName;
  }

  async connect(): Promise<void> {
    await this.client.connect();
    const resolvedDbName =
      this.configuredDbName ?? process.env.HEALTH_RECORD_DB_NAME ?? 'health_record';
    this.db = this.client.db(resolvedDbName);
    console.error('Connected to MongoDB');
  }

  async disconnect(): Promise<void> {
    await this.client.close();
  }

  getDb(): Db {
    if (!this.db) {
      throw new Error('Database not connected');
    }
    return this.db;
  }

  get dependents(): Collection<Dependent> {
    return this.getDb().collection<Dependent>('dependents');
  }

  get phiVault(): Collection<PhiVaultEntry> {
    return this.getDb().collection<PhiVaultEntry>('phi_vault');
  }

  get providers(): Collection<Provider> {
    return this.getDb().collection<Provider>('providers');
  }

  get visits(): Collection<Visit> {
    return this.getDb().collection<Visit>('visits');
  }

  get prescriptions(): Collection<Prescription> {
    return this.getDb().collection<Prescription>('prescriptions');
  }

  get labs(): Collection<Lab> {
    return this.getDb().collection<Lab>('labs');
  }

  get treatments(): Collection<Treatment> {
    return this.getDb().collection<Treatment>('treatments');
  }

  get conditions(): Collection<Condition> {
    return this.getDb().collection<Condition>('conditions');
  }

  get allergies(): Collection<Allergy> {
    return this.getDb().collection<Allergy>('allergies');
  }

  get immunizations(): Collection<Immunization> {
    return this.getDb().collection<Immunization>('immunizations');
  }

  get vitalSigns(): Collection<VitalSigns> {
    return this.getDb().collection<VitalSigns>('vital_signs');
  }

  get procedures(): Collection<Procedure> {
    return this.getDb().collection<Procedure>('procedures');
  }

  get imaging(): Collection<Imaging> {
    return this.getDb().collection<Imaging>('imaging');
  }

  get insurance(): Collection<Insurance> {
    return this.getDb().collection<Insurance>('insurance');
  }

  get activeSummaries(): Collection<ActiveSummary> {
    return this.getDb().collection<ActiveSummary>('active_summaries');
  }

  async createIndexes(): Promise<void> {
    await this.dependents.createIndex({ external_ref: 1 });
    await this.dependents.createIndex({ record_identifier: 1 });
    await this.dependents.createIndex({ archived: 1 });
    await this.phiVault.createIndex({ dependent_id: 1 }, { unique: true });

    const phiVaultEntries = this.getDb().collection('phi_vault_entries');
    await phiVaultEntries.createIndex({ dependent_id: 1 });
    await phiVaultEntries.createIndex({ resource_id: 1 });
    await phiVaultEntries.createIndex({ field_path: 1 });
    await phiVaultEntries.createIndex({ resource_type: 1, field_path: 1, dependent_id: 1 });
    await phiVaultEntries.createIndex({ updated_at: -1 });
    
    await this.visits.createIndex({ dependent_id: 1, created_at: -1 });
    await this.prescriptions.createIndex({ dependent_id: 1, created_at: -1 });
    await this.prescriptions.createIndex({ dependent_id: 1, medication_name: 1, start_date: 1 });
    await this.labs.createIndex({ dependent_id: 1, created_at: -1 });
    await this.labs.createIndex({ dependent_id: 1, test_name: 1, collected_at: 1 });
    await this.treatments.createIndex({ dependent_id: 1, created_at: -1 });
    await this.conditions.createIndex({ dependent_id: 1, created_at: -1 });
    await this.conditions.createIndex({ dependent_id: 1, status: 1 });
    await this.allergies.createIndex({ dependent_id: 1, created_at: -1 });
    await this.allergies.createIndex({ dependent_id: 1, type: 1 });
    await this.immunizations.createIndex({ dependent_id: 1, date_administered: -1 });
    await this.immunizations.createIndex({ dependent_id: 1, vaccine_name: 1 });
    await this.vitalSigns.createIndex({ dependent_id: 1, recorded_at: -1 });
    await this.procedures.createIndex({ dependent_id: 1, date_performed: -1 });
    await this.procedures.createIndex({ dependent_id: 1, procedure_type: 1 });
    await this.imaging.createIndex({ dependent_id: 1, study_date: -1 });
    await this.imaging.createIndex({ dependent_id: 1, modality: 1 });
    await this.insurance.createIndex({ dependent_id: 1, coverage_type: 1 });
    
    await this.activeSummaries.createIndex({ dependent_id: 1 }, { unique: true });
    
    console.error('Database indexes created');
  }
}

