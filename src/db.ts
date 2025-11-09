import { MongoClient, Db, Collection } from 'mongodb';
import type {
  Patient,
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
import { MongoPersistenceAdapter } from './persistence/mongo-persistence.js';
import type { ResourcePersistence } from './persistence/types.js';

export class Database {
  private client: MongoClient;
  private db: Db | null = null;
  private persistenceAdapter: MongoPersistenceAdapter | null = null;

  constructor(uri: string, dbName: string) {
    this.client = new MongoClient(uri);
  }

  async connect(): Promise<void> {
    await this.client.connect();
    const dbName = process.env.AC130_HEALTH_DB_NAME || 'ac130_health';
    this.db = this.client.db(dbName);
    this.persistenceAdapter = new MongoPersistenceAdapter(this.db);
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

  private getPersistenceAdapter(): MongoPersistenceAdapter {
    if (!this.persistenceAdapter) {
      throw new Error('Database not connected');
    }
    return this.persistenceAdapter;
  }

  getResourcePersistence(collectionName: string): ResourcePersistence {
    return this.getPersistenceAdapter().forCollection(collectionName);
  }

  get patients(): Collection<Patient> {
    return this.getDb().collection<Patient>('patients');
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
    await this.patients.createIndex({ external_ref: 1 });
    await this.patients.createIndex({ relationship: 1 });
    
    await this.visits.createIndex({ patient_id: 1, created_at: -1 });
    await this.prescriptions.createIndex({ patient_id: 1, created_at: -1 });
    await this.prescriptions.createIndex({ patient_id: 1, medication_name: 1, start_date: 1 });
    await this.labs.createIndex({ patient_id: 1, created_at: -1 });
    await this.labs.createIndex({ patient_id: 1, test_name: 1, collected_at: 1 });
    await this.treatments.createIndex({ patient_id: 1, created_at: -1 });
    await this.conditions.createIndex({ patient_id: 1, created_at: -1 });
    await this.conditions.createIndex({ patient_id: 1, status: 1 });
    await this.allergies.createIndex({ patient_id: 1, created_at: -1 });
    await this.allergies.createIndex({ patient_id: 1, type: 1 });
    await this.immunizations.createIndex({ patient_id: 1, date_administered: -1 });
    await this.immunizations.createIndex({ patient_id: 1, vaccine_name: 1 });
    await this.vitalSigns.createIndex({ patient_id: 1, recorded_at: -1 });
    await this.procedures.createIndex({ patient_id: 1, date_performed: -1 });
    await this.procedures.createIndex({ patient_id: 1, procedure_type: 1 });
    await this.imaging.createIndex({ patient_id: 1, study_date: -1 });
    await this.imaging.createIndex({ patient_id: 1, modality: 1 });
    await this.insurance.createIndex({ patient_id: 1, coverage_type: 1 });
    
    await this.activeSummaries.createIndex({ patient_id: 1 }, { unique: true });
    
    console.error('Database indexes created');
  }
}

