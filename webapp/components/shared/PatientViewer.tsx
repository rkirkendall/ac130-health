'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';
import { ScrollArea } from './ui/scroll-area';
import type { Patient, RecordCount } from './types';
import { formatDateValue, formatFieldValue, formatTitleCandidate } from './utils';

interface PatientViewerProps {
  apiBaseUrl?: string;
}

const FIELD_LABEL_OVERRIDES: Record<string, string> = {
  name: 'Name',
  full_name: 'Name',
  patient_name: 'Patient Name',
  provider_name: 'Provider Name',
  dob: 'Date of Birth',
  date_of_birth: 'Date of Birth',
  sex: 'Sex',
  gender: 'Gender',
  created_at: 'Created At',
  updated_at: 'Updated At',
  external_ref: 'External Reference',
};

const HIDDEN_FIELD_KEYS = new Set([
  '_id',
  'id',
  'patient_id',
  'record_id',
  'created_by',
  'updated_by',
  'database_id',
]);

const shouldHideField = (key: string) => {
  const lower = key.toLowerCase();
  if (HIDDEN_FIELD_KEYS.has(lower)) {
    return true;
  }
  return lower === 'id' || lower.endsWith('_id');
};

const hasRenderableValue = (value: string | null | undefined) => {
  if (value === null || value === undefined) {
    return false;
  }
  const trimmed = value.toString().trim();
  if (!trimmed) {
    return false;
  }
  return trimmed.toLowerCase() !== 'n/a';
};

async function parseJsonResponse<T>(res: Response): Promise<T | null> {
  if (!res.ok) {
    const message = await res.text().catch(() => '');
    throw new Error(
      `Request failed with ${res.status} ${res.statusText}${
        message ? ` - ${message}` : ''
      }`,
    );
  }

  const text = await res.text();
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as T;
  } catch (error) {
    throw new Error('Unexpected non-JSON response');
  }
}

export function PatientViewer({ apiBaseUrl = '' }: PatientViewerProps) {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [selectedPatient, setSelectedPatient] = useState<string>('');
  const [recordCounts, setRecordCounts] = useState<RecordCount[]>([]);
  const [selectedRecordType, setSelectedRecordType] = useState<string>('');
  const [records, setRecords] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Fetch patients on mount
  useEffect(() => {
    fetch(`${apiBaseUrl}/api/patients`)
      .then(parseJsonResponse<Patient[]>)
      .then(data => {
        const list = Array.isArray(data) ? data : [];
        setPatients(list);
        if (list.length > 0) {
          setSelectedPatient(list[0]._id);
        }
        setLoading(false);
      })
      .catch(err => {
        console.error('Error fetching patients:', err);
        setLoading(false);
      });
  }, [apiBaseUrl]);

  // Fetch record counts when patient changes
  useEffect(() => {
    if (selectedPatient) {
      fetch(`${apiBaseUrl}/api/patients/${selectedPatient}/counts`)
        .then(parseJsonResponse<RecordCount[]>)
        .then(data => {
          const counts = Array.isArray(data) ? data : [];
          setRecordCounts(counts);
          // Always select the first record type (Patient Profile) by default
          if (counts.length > 0) {
            setSelectedRecordType(counts[0].type);
          } else {
            setSelectedRecordType('');
          }
        })
        .catch(err => console.error('Error fetching counts:', err));
    }
  }, [selectedPatient, apiBaseUrl]);

  // Fetch records when record type changes
  useEffect(() => {
    if (selectedPatient && selectedRecordType) {
      fetch(`${apiBaseUrl}/api/patients/${selectedPatient}/records/${selectedRecordType}`)
        .then(parseJsonResponse<any[]>)
        .then(data => setRecords(Array.isArray(data) ? data : []))
        .catch(err => console.error('Error fetching records:', err));
    }
  }, [selectedPatient, selectedRecordType, apiBaseUrl]);

  const getPatientName = (patient: Patient) => {
    if (patient.name?.given || patient.name?.family) {
      return `${patient.name.given || ''} ${patient.name.family || ''}`.trim();
    }
    return patient.external_ref || 'Unknown Patient';
  };

  const selectedPatientDetails = patients.find(patient => patient._id === selectedPatient);

  const renderHealthSummary = () => {
    if (!selectedPatientDetails) {
      return (
        <Card>
          <CardContent className="p-6">
            <p className="text-muted-foreground">Select a patient to view their health summary.</p>
          </CardContent>
        </Card>
      );
    }

    const contactParts = [
      selectedPatientDetails.contact?.email,
      selectedPatientDetails.contact?.phone,
    ].filter((part): part is string => Boolean(part));

    const patientFields = [
      { label: 'Patient Name', value: getPatientName(selectedPatientDetails) },
      { label: 'Date of Birth', value: formatDateValue(selectedPatientDetails.dob) },
      { label: 'Sex', value: selectedPatientDetails.sex },
      { label: 'Contact', value: contactParts.join(' • ') || null },
      { label: 'External Reference', value: selectedPatientDetails.external_ref },
      { label: 'Created', value: formatDateValue(selectedPatientDetails.created_at) },
      { label: 'Updated', value: formatDateValue(selectedPatientDetails.updated_at) },
    ].filter(field => hasRenderableValue(field.value));

    const latestSummary = records[0];

    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Patient Profile</CardTitle>
          {latestSummary ? (
            <p className="text-sm text-muted-foreground">
              Health summary updated {formatDateValue(latestSummary.updated_at) ?? 'N/A'}
            </p>
          ) : null}
        </CardHeader>
        <CardContent className="space-y-6">
          {patientFields.length > 0 ? (
            <div className="space-y-4">
              {patientFields.map(field => (
                <div key={field.label} className="space-y-1">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {field.label}
                  </p>
                  <p className="text-sm">{field.value}</p>
                </div>
              ))}
            </div>
          ) : null}

          {records.length > 0 ? (
            <div className="space-y-4">
              <p className="text-sm font-semibold text-slate-900">Health Summary</p>
              {records.map((record, index) => (
                <div key={record._id || index} className="rounded-lg border border-slate-200 p-4">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    Last updated {formatDateValue(record.updated_at) ?? 'N/A'}
                  </p>
                  <pre className="mt-2 whitespace-pre-wrap font-sans text-sm leading-relaxed">
                    {record.summary_text}
                  </pre>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No health summary has been recorded for this patient.
            </p>
          )}
        </CardContent>
      </Card>
    );
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-lg">Loading...</p>
      </div>
    );
  }

  if (patients.length === 0) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-lg">No patients found in database.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen">
      {/* Header with Patient Selector */}
      <header className="border-b bg-background">
        <div className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Patient
            </p>
            <div className="w-full min-w-0 sm:w-64">
              <Select value={selectedPatient} onValueChange={setSelectedPatient}>
                <SelectTrigger>
                  <SelectValue placeholder="Select patient" />
                </SelectTrigger>
                <SelectContent>
                  {patients.map(patient => (
                    <SelectItem key={patient._id} value={patient._id}>
                      {getPatientName(patient)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside className="w-64 border-r bg-background">
          <ScrollArea className="h-full">
            <div className="p-4 space-y-2">
              <h2 className="font-semibold mb-4">Record Types</h2>
              {recordCounts.map(({ type, label, count }) => (
                <button
                  key={type}
                  onClick={() => setSelectedRecordType(type)}
                  className={`w-full text-left px-3 py-2 rounded-md transition-colors ${
                    selectedRecordType === type
                      ? 'bg-primary text-primary-foreground'
                      : 'hover:bg-muted'
                  }`}
                >
                  <div className="flex justify-between items-center">
                    <span className="text-sm">{label}</span>
                    {typeof count === 'number' ? (
                      <span
                        className={`text-xs px-2 py-1 rounded-full ${
                          selectedRecordType === type
                            ? 'bg-primary-foreground text-primary'
                            : 'bg-muted text-muted-foreground'
                        }`}
                      >
                        {count}
                      </span>
                    ) : null}
                  </div>
                </button>
              ))}
            </div>
          </ScrollArea>
        </aside>

        {/* Main View */}
        <main className="flex-1 overflow-hidden">
          <ScrollArea className="h-full">
            <div className="p-6">
              <h2 className="text-2xl font-bold mb-6">
                {recordCounts.find(r => r.type === selectedRecordType)?.label || 'Records'}
              </h2>

              {selectedRecordType === 'active_summaries' ? (
                renderHealthSummary()
              ) : records.length === 0 ? (
                <Card>
                  <CardContent className="p-6">
                    <p className="text-muted-foreground">No records found.</p>
                  </CardContent>
                </Card>
              ) : selectedRecordType === 'labs' ? (
                <div className="space-y-4">
                  {records.map((record, index) => (
                    <Card key={record._id || index}>
                      <CardHeader>
                        <CardTitle className="text-lg">{record.test_name}</CardTitle>
                        <div className="flex gap-4 text-sm text-muted-foreground">
                          {record.result_date && <span>Date: {formatDateValue(record.result_date) ?? record.result_date}</span>}
                          {record.status && <span>Status: {record.status}</span>}
                        </div>
                      </CardHeader>
                      <CardContent>
                        {record.results && Array.isArray(record.results) && record.results.length > 0 ? (
                          <div className="overflow-x-auto">
                            <table className="w-full border-collapse">
                              <thead>
                                <tr className="border-b">
                                  <th className="text-left py-2 px-3 text-sm font-medium">Test</th>
                                  <th className="text-left py-2 px-3 text-sm font-medium">Value</th>
                                  <th className="text-left py-2 px-3 text-sm font-medium">Unit</th>
                                  <th className="text-left py-2 px-3 text-sm font-medium">Reference Range</th>
                                  <th className="text-left py-2 px-3 text-sm font-medium">Flag</th>
                                </tr>
                              </thead>
                              <tbody>
                                {record.results.map((result: any, idx: number) => (
                                  <tr key={idx} className="border-b last:border-0">
                                    <td className="py-2 px-3 text-sm">{result.test}</td>
                                    <td className="py-2 px-3 text-sm font-medium">{result.value ?? 'N/A'}</td>
                                    <td className="py-2 px-3 text-sm">{result.unit ?? ''}</td>
                                    <td className="py-2 px-3 text-sm text-muted-foreground">{result.reference_range ?? 'N/A'}</td>
                                    <td className="py-2 px-3 text-sm">
                                      {result.flag && (
                                        <span className={`px-2 py-1 rounded text-xs font-medium ${
                                          result.flag.toLowerCase() === 'high' ? 'bg-red-100 text-red-800' :
                                          result.flag.toLowerCase() === 'low' ? 'bg-blue-100 text-blue-800' :
                                          'bg-yellow-100 text-yellow-800'
                                        }`}>
                                          {result.flag}
                                        </span>
                                      )}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        ) : record.components && Array.isArray(record.components) && record.components.length > 0 ? (
                          <div className="overflow-x-auto">
                            <table className="w-full border-collapse">
                              <thead>
                                <tr className="border-b">
                                  <th className="text-left py-2 px-3 text-sm font-medium">Component</th>
                                  <th className="text-left py-2 px-3 text-sm font-medium">Value</th>
                                  <th className="text-left py-2 px-3 text-sm font-medium">Unit</th>
                                  <th className="text-left py-2 px-3 text-sm font-medium">Reference Range</th>
                                </tr>
                              </thead>
                              <tbody>
                                {record.components.map((component: any, idx: number) => (
                                  <tr key={idx} className="border-b last:border-0">
                                    <td className="py-2 px-3 text-sm">{component.name}</td>
                                    <td className="py-2 px-3 text-sm font-medium">{component.value ?? 'N/A'}</td>
                                    <td className="py-2 px-3 text-sm">{component.unit ?? ''}</td>
                                    <td className="py-2 px-3 text-sm text-muted-foreground">{component.reference_range ?? 'N/A'}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        ) : (
                          <p className="text-muted-foreground">No results available</p>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : (
                <div className="space-y-4">
                  {records.map((record, index) => {
                    const titleCandidate =
                      [
                        record.medication_name,
                        record.test_name,
                        record.condition_name,
                        record.clinical_status,
                        record.display,
                        record.name,
                        record.allergen,
                        record.vaccine_name,
                        record.procedure_name,
                        record.study_type,
                        record.provider_name,
                        record.title,
                      ]
                        .map(value => formatTitleCandidate(value))
                        .find((value): value is string => Boolean(value)) ??
                      formatTitleCandidate(record) ??
                      `Record ${index + 1}`;

                    return (
                      <Card key={record._id || index}>
                        <CardHeader>
                          <CardTitle className="text-lg">
                            {titleCandidate}
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="space-y-4">
                            {Object.entries(record)
                              .map(([key, value]) => {
                                if (shouldHideField(key)) {
                                  return null;
                                }

                                const displayValue = formatFieldValue(key, value);
                                if (!hasRenderableValue(displayValue)) {
                                  return null;
                                }

                                const label =
                                  FIELD_LABEL_OVERRIDES[key.toLowerCase()] ??
                                  key
                                    .replace(/_/g, ' ')
                                    .replace(/\b\w/g, l => l.toUpperCase());

                                return { key, label, displayValue };
                              })
                              .filter(
                                (entry): entry is { key: string; label: string; displayValue: string } =>
                                  Boolean(entry),
                              )
                              .map(({ key, label, displayValue }, index) => (
                                <div
                                  key={key}
                                  className={`space-y-1 border-t border-slate-100 pt-4 ${
                                    index === 0 ? 'border-t-0 pt-0' : ''
                                  }`}
                                >
                                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                    {label}
                                  </p>
                                  <p className="text-sm whitespace-pre-wrap break-words">
                                    {displayValue}
                                  </p>
                                </div>
                              ))}
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
            </div>
          </ScrollArea>
        </main>
      </div>
    </div>
  );
}
