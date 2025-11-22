'use client';

import { useState, useEffect, useRef } from 'react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';

interface FormField {
  name: string;
  label: string;
  type: 'text' | 'textarea' | 'select' | 'date';
  required?: boolean;
  options?: { value: string; label: string }[];
  placeholder?: string;
}

interface ResourceFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: Record<string, any>) => Promise<void>;
  resourceType: string;
  mode: 'create' | 'edit';
  initialData?: Record<string, any>;
  dependentId: string;
}

// Define form fields for each resource type
const RESOURCE_FORM_FIELDS: Record<string, FormField[]> = {
  visits: [
    { name: 'date', label: 'Date', type: 'date', placeholder: 'YYYY-MM-DD' },
    {
      name: 'type',
      label: 'Type',
      type: 'select',
      options: [
        { value: 'office', label: 'Office Visit' },
        { value: 'er', label: 'Emergency Room' },
        { value: 'telehealth', label: 'Telehealth' },
        { value: 'inpatient', label: 'Inpatient' },
        { value: 'other', label: 'Other' },
      ]
    },
    { name: 'reason', label: 'Reason', type: 'text', placeholder: 'Reason for visit' },
    { name: 'notes', label: 'Notes', type: 'textarea', placeholder: 'Additional notes' },
  ],
  prescriptions: [
    { name: 'medication_name', label: 'Medication Name', type: 'text', required: true, placeholder: 'e.g., Amoxicillin' },
    { name: 'dose', label: 'Dose', type: 'text', placeholder: 'e.g., 500mg' },
    { name: 'frequency', label: 'Frequency', type: 'text', placeholder: 'e.g., twice daily' },
    { name: 'start_date', label: 'Start Date', type: 'date', placeholder: 'YYYY-MM-DD' },
    { name: 'stop_date', label: 'Stop Date', type: 'date', placeholder: 'YYYY-MM-DD' },
    {
      name: 'status',
      label: 'Status',
      type: 'select',
      options: [
        { value: 'active', label: 'Active' },
        { value: 'stopped', label: 'Stopped' },
        { value: 'completed', label: 'Completed' },
      ]
    },
  ],
  labs: [
    { name: 'test_name', label: 'Test Name', type: 'text', required: true, placeholder: 'e.g., Complete Blood Count' },
    { name: 'result_date', label: 'Result Date', type: 'date', placeholder: 'YYYY-MM-DD' },
    {
      name: 'status',
      label: 'Status',
      type: 'select',
      options: [
        { value: 'pending', label: 'Pending' },
        { value: 'final', label: 'Final' },
        { value: 'cancelled', label: 'Cancelled' },
      ]
    },
    { name: 'result_value', label: 'Result Value', type: 'text', placeholder: 'e.g., 4.5' },
    { name: 'result_unit', label: 'Unit', type: 'text', placeholder: 'e.g., mg/dL' },
  ],
  lab: [ // Alias for labs
    { name: 'test_name', label: 'Test Name', type: 'text', required: true, placeholder: 'e.g., Complete Blood Count' },
    { name: 'result_date', label: 'Result Date', type: 'date', placeholder: 'YYYY-MM-DD' },
    {
      name: 'status',
      label: 'Status',
      type: 'select',
      options: [
        { value: 'pending', label: 'Pending' },
        { value: 'final', label: 'Final' },
        { value: 'cancelled', label: 'Cancelled' },
      ]
    },
    { name: 'result_value', label: 'Result Value', type: 'text', placeholder: 'e.g., 4.5' },
    { name: 'result_unit', label: 'Unit', type: 'text', placeholder: 'e.g., mg/dL' },
  ],
  conditions: [
    { name: 'name', label: 'Condition Name', type: 'text', required: true, placeholder: 'e.g., Hypertension' },
    { name: 'diagnosis_date', label: 'Diagnosis Date', type: 'date', placeholder: 'YYYY-MM-DD' },
    {
      name: 'status',
      label: 'Status',
      type: 'select',
      options: [
        { value: 'active', label: 'Active' },
        { value: 'resolved', label: 'Resolved' },
        { value: 'chronic', label: 'Chronic' },
      ]
    },
    { name: 'notes', label: 'Notes', type: 'textarea', placeholder: 'Additional notes' },
  ],
  allergies: [
    { name: 'allergen', label: 'Allergen', type: 'text', required: true, placeholder: 'e.g., Penicillin' },
    {
      name: 'severity',
      label: 'Severity',
      type: 'select',
      options: [
        { value: 'mild', label: 'Mild' },
        { value: 'moderate', label: 'Moderate' },
        { value: 'severe', label: 'Severe' },
      ]
    },
    {
      name: 'reaction',
      label: 'Reaction',
      type: 'text',
      placeholder: 'e.g., Rash, hives'
    },
    { name: 'notes', label: 'Notes', type: 'textarea', placeholder: 'Additional notes' },
  ],
  immunizations: [
    { name: 'vaccine_name', label: 'Vaccine Name', type: 'text', required: true, placeholder: 'e.g., COVID-19' },
    { name: 'administration_date', label: 'Administration Date', type: 'date', required: true, placeholder: 'YYYY-MM-DD' },
    { name: 'lot_number', label: 'Lot Number', type: 'text', placeholder: 'Lot number' },
    { name: 'manufacturer', label: 'Manufacturer', type: 'text', placeholder: 'Manufacturer name' },
    { name: 'notes', label: 'Notes', type: 'textarea', placeholder: 'Additional notes' },
  ],
  vital_signs: [
    { name: 'measurement_date', label: 'Measurement Date', type: 'date', required: true, placeholder: 'YYYY-MM-DD' },
    { name: 'blood_pressure_systolic', label: 'Blood Pressure Systolic', type: 'text', placeholder: 'e.g., 120' },
    { name: 'blood_pressure_diastolic', label: 'Blood Pressure Diastolic', type: 'text', placeholder: 'e.g., 80' },
    { name: 'heart_rate', label: 'Heart Rate', type: 'text', placeholder: 'BPM' },
    { name: 'temperature', label: 'Temperature', type: 'text', placeholder: '°F or °C' },
    { name: 'weight', label: 'Weight', type: 'text', placeholder: 'lbs or kg' },
    { name: 'height', label: 'Height', type: 'text', placeholder: 'inches or cm' },
    { name: 'oxygen_saturation', label: 'Oxygen Saturation', type: 'text', placeholder: '%' },
  ],
  procedures: [
    { name: 'procedure_name', label: 'Procedure Name', type: 'text', required: true, placeholder: 'e.g., Colonoscopy' },
    { name: 'procedure_date', label: 'Procedure Date', type: 'date', placeholder: 'YYYY-MM-DD' },
    { name: 'notes', label: 'Notes', type: 'textarea', placeholder: 'Procedure details and notes' },
  ],
  imaging: [
    { name: 'study_type', label: 'Study Type', type: 'text', required: true, placeholder: 'e.g., X-Ray Chest' },
    { name: 'study_date', label: 'Study Date', type: 'date', placeholder: 'YYYY-MM-DD' },
    { name: 'findings', label: 'Findings', type: 'textarea', placeholder: 'Radiology findings' },
    { name: 'impression', label: 'Impression', type: 'textarea', placeholder: 'Radiologist impression' },
  ],
  treatments: [
    { name: 'title', label: 'Treatment Name', type: 'text', required: true, placeholder: 'e.g., Physical Therapy' },
    { name: 'start_date', label: 'Start Date', type: 'date', placeholder: 'YYYY-MM-DD' },
    { name: 'end_date', label: 'End Date', type: 'date', placeholder: 'YYYY-MM-DD' },
    {
      name: 'status',
      label: 'Status',
      type: 'select',
      options: [
        { value: 'active', label: 'Active' },
        { value: 'completed', label: 'Completed' },
        { value: 'discontinued', label: 'Discontinued' },
      ]
    },
    { name: 'notes', label: 'Notes', type: 'textarea', placeholder: 'Treatment details' },
  ],
  insurance: [
    { name: 'provider_name', label: 'Provider Name', type: 'text', required: true, placeholder: 'Insurance company name' },
    { name: 'policy_number', label: 'Policy Number', type: 'text', placeholder: 'Policy number' },
    { name: 'group_number', label: 'Group Number', type: 'text', placeholder: 'Group number' },
    {
      name: 'coverage_type',
      label: 'Coverage Type',
      type: 'select',
      options: [
        { value: 'individual', label: 'Individual' },
        { value: 'family', label: 'Family' },
        { value: 'medicare', label: 'Medicare' },
        { value: 'medicaid', label: 'Medicaid' },
      ]
    },
    { name: 'effective_date', label: 'Effective Date', type: 'date', placeholder: 'YYYY-MM-DD' },
    { name: 'expiration_date', label: 'Expiration Date', type: 'date', placeholder: 'YYYY-MM-DD' },
  ],
};

export function ResourceForm({
  isOpen,
  onClose,
  onSubmit,
  resourceType,
  mode,
  initialData = {},
  dependentId,
}: ResourceFormProps) {
  const [formData, setFormData] = useState<Record<string, any>>(initialData);
  const [loading, setLoading] = useState(false);
  const prevInitialDataIdRef = useRef<string | undefined>(initialData?._id);

  const fields = RESOURCE_FORM_FIELDS[resourceType] || [];

  useEffect(() => {
    // Only update formData when the dialog opens or when initialData ID changes
    if (isOpen) {
      const currentId = initialData?._id;
      if (currentId !== prevInitialDataIdRef.current) {
        const hydratedData = { ...initialData };
        if (['labs', 'lab'].includes(resourceType)) {
          const firstResult = Array.isArray(initialData?.results)
            ? initialData.results[0]
            : undefined;
          if (firstResult) {
            hydratedData.result_value ??= firstResult.value ?? '';
            hydratedData.result_unit ??= firstResult.unit ?? '';
          }
        }
        setFormData(hydratedData);
        prevInitialDataIdRef.current = currentId;
      }
    } else {
      // Reset form data when dialog closes
      setFormData({});
      prevInitialDataIdRef.current = undefined;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, initialData?._id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      let payload = { ...formData };

      if (['labs', 'lab'].includes(resourceType)) {
        const resultValue = String(formData.result_value ?? '').trim();
        const resultUnit = String(formData.result_unit ?? '').trim();
        const testName = String(formData.test_name ?? '').trim();

        if (resultValue || resultUnit) {
          const resultEntry: Record<string, string> = {};
          if (testName) {
            resultEntry.test = testName;
          }
          if (resultValue) {
            resultEntry.value = resultValue;
          }
          if (resultUnit) {
            resultEntry.unit = resultUnit;
          }
          payload = { ...payload, results: [resultEntry] };
        }

        delete payload.result_value;
        delete payload.result_unit;
      }

      await onSubmit(payload);
      onClose();
      setFormData({});
    } catch (error) {
      console.error('Error submitting form:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (name: string, value: string) => {
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const renderField = (field: FormField) => {
    const value = formData[field.name] || '';

    switch (field.type) {
      case 'textarea':
        return (
          <Textarea
            id={field.name}
            value={value}
            onChange={(e) => handleInputChange(field.name, e.target.value)}
            placeholder={field.placeholder}
            required={field.required}
          />
        );
      case 'select':
        return (
          <Select value={value} onValueChange={(value) => handleInputChange(field.name, value)}>
            <SelectTrigger>
              <SelectValue placeholder={`Select ${field.label.toLowerCase()}`} />
            </SelectTrigger>
            <SelectContent>
              {field.options?.map(option => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        );
      default:
        return (
          <Input
            id={field.name}
            type={field.type}
            value={value}
            onChange={(e) => handleInputChange(field.name, e.target.value)}
            placeholder={field.placeholder}
            required={field.required}
          />
        );
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[600px] max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {mode === 'create' ? 'Create' : 'Edit'} {resourceType.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
          </DialogTitle>
          <DialogDescription>
            {mode === 'create'
              ? `Add a new ${resourceType.replace('_', ' ')} record.`
              : `Update the ${resourceType.replace('_', ' ')} record.`
            }
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            {fields.map(field => (
              <div key={field.name} className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor={field.name} className="text-right">
                  {field.label}
                  {field.required && <span className="text-red-500 ml-1">*</span>}
                </Label>
                <div className="col-span-3">
                  {renderField(field)}
                </div>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Saving...' : mode === 'create' ? 'Create' : 'Update'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
