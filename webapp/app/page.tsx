'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { Patient, RecordCount } from '@/lib/types';

export default function Home() {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [selectedPatient, setSelectedPatient] = useState<string>('');
  const [recordCounts, setRecordCounts] = useState<RecordCount[]>([]);
  const [selectedRecordType, setSelectedRecordType] = useState<string>('');
  const [records, setRecords] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Fetch patients on mount
  useEffect(() => {
    fetch('/api/patients')
      .then(res => res.json())
      .then(data => {
        setPatients(data);
        if (data.length > 0) {
          setSelectedPatient(data[0]._id);
        }
        setLoading(false);
      })
      .catch(err => {
        console.error('Error fetching patients:', err);
        setLoading(false);
      });
  }, []);

  // Fetch record counts when patient changes
  useEffect(() => {
    if (selectedPatient) {
      fetch(`/api/patients/${selectedPatient}/counts`)
        .then(res => res.json())
        .then(data => {
          setRecordCounts(data);
          // Always select the first record type (Health Summary) by default
          if (data.length > 0) {
            setSelectedRecordType(data[0].type);
          }
        })
        .catch(err => console.error('Error fetching counts:', err));
    }
  }, [selectedPatient]);

  // Fetch records when record type changes
  useEffect(() => {
    if (selectedPatient && selectedRecordType) {
      fetch(`/api/patients/${selectedPatient}/records/${selectedRecordType}`)
        .then(res => res.json())
        .then(data => setRecords(data))
        .catch(err => console.error('Error fetching records:', err));
    }
  }, [selectedPatient, selectedRecordType]);

  const getPatientName = (patient: Patient) => {
    if (patient.name?.given || patient.name?.family) {
      return `${patient.name.given || ''} ${patient.name.family || ''}`.trim();
    }
    return patient.external_ref || 'Unknown Patient';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-lg">Loading...</p>
      </div>
    );
  }

  if (patients.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-lg">No patients found in database.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen">
      {/* Header with Patient Selector */}
      <header className="border-b bg-background">
        <div className="flex items-center p-4 gap-4">
          <img src="/ac-130-logo.png" alt="AC130 Health" className="h-10 w-10" />
          <h1 className="text-xl font-bold">Health Records</h1>
          <div className="w-64 ml-auto">
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
                    <span className={`text-xs px-2 py-1 rounded-full ${
                      selectedRecordType === type
                        ? 'bg-primary-foreground text-primary'
                        : 'bg-muted text-muted-foreground'
                    }`}>
                      {count}
                    </span>
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
              
              {records.length === 0 ? (
                <Card>
                  <CardContent className="p-6">
                    <p className="text-muted-foreground">No records found.</p>
                  </CardContent>
                </Card>
              ) : selectedRecordType === 'active_summaries' ? (
                <div className="space-y-4">
                  {records.map((record, index) => (
                    <Card key={record._id || index}>
                      <CardHeader>
                        <CardTitle className="text-lg">Health Summary</CardTitle>
                        <p className="text-sm text-muted-foreground">
                          Last updated: {new Date(record.updated_at).toLocaleString()}
                        </p>
                      </CardHeader>
                      <CardContent>
                        <div className="prose prose-sm max-w-none">
                          <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed">
                            {record.summary_text}
                          </pre>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : selectedRecordType === 'labs' ? (
                <div className="space-y-4">
                  {records.map((record, index) => (
                    <Card key={record._id || index}>
                      <CardHeader>
                        <CardTitle className="text-lg">{record.test_name}</CardTitle>
                        <div className="flex gap-4 text-sm text-muted-foreground">
                          {record.result_date && <span>Date: {record.result_date}</span>}
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
                  {records.map((record, index) => (
                    <Card key={record._id || index}>
                      <CardHeader>
                        <CardTitle className="text-lg">
                          {record.medication_name ||
                            record.test_name ||
                            record.name ||
                            record.allergen ||
                            record.vaccine_name ||
                            record.procedure_name ||
                            record.study_type ||
                            record.provider_name ||
                            record.title ||
                            `Record ${index + 1}`}
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="grid grid-cols-2 gap-4">
                          {Object.entries(record).map(([key, value]) => {
                            // Skip internal fields and patient_id
                            if (key === '_id' || key === 'patient_id' || key === 'created_by' || key === 'updated_by') {
                              return null;
                            }
                            
                            // Format the value
                            let displayValue: string;
                            if (typeof value === 'object' && value !== null) {
                              displayValue = JSON.stringify(value, null, 2);
                            } else if (value === null || value === undefined) {
                              displayValue = 'N/A';
                            } else {
                              displayValue = String(value);
                            }

                            return (
                              <div key={key} className="space-y-1">
                                <p className="text-sm font-medium text-muted-foreground">
                                  {key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                                </p>
                                <p className="text-sm whitespace-pre-wrap break-words">
                                  {displayValue}
                                </p>
                              </div>
                            );
                          })}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          </ScrollArea>
        </main>
      </div>
    </div>
  );
}
