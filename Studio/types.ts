
export enum UserRole {
  VIEWER = 'viewer',
  AUDITOR = 'auditor',
  ADMIN = 'admin',
  SUPERADMIN = 'superadmin'
}

export interface User {
  id: string;
  name: string;
  login: string;
  role: UserRole;
  password?: string;
}

export interface Transporter {
  id: string;
  name: string;
  season: string;
  vehicleCount: number;
}

export interface Vehicle {
  id: string;
  vehicle_no: string;
  truck_type: string;
  driver_name: string;
  driver_mobile: string;
  sl_no: string;
  transporter_id: string;
  transporter_name: string;
}

export interface Baseline {
  vehicle_id: string;
  season: string;
  doc_score: number;
  age_score: number;
  fitness_expiry?: string | null;
  insurance_expiry?: string | null;
}

export interface Evaluation {
  id: string;
  vehicle_id: string;
  season: string;
  score: number;
  rank: string;
  dq: boolean;
  payload: Record<string, string | number | string[]>;
  incidents: { note: string; severity: string }[];
  created_at: string;
}

export interface AuditLog {
  id: string;
  timestamp: string;
  who: string;
  role: UserRole;
  action: string;
}

export interface ReportRow {
  vehicle_id: string;
  vehicle_no: string;
  truck_type: string;
  driver_name: string;
  driver_mobile: string;
  sl_no: string;
  transporter_id: string;
  transporter_name: string;
  season: string;
  eval_score: number | null;
  eval_rank: string | null;
  eval_dq: number | null;
  eval_date: string | null;
  eval_payload?: Record<string, string | number | string[]> | null;
  doc_score: number | null;
  age_score: number | null;
}

export interface ConsolidatedReportRow {
  vehicle_id: string;
  vehicle_no: string;
  truck_type: string;
  driver_name: string;
  driver_mobile: string;
  sl_no: string;
  transporter_id: string;
  transporter_name: string;
  season: string;
  eval_avg_score: number | null;
  eval_count: number;
  dq_count: number;
  last_eval_rank: string | null;
  last_eval_dq: number | null;
  last_eval_date: string | null;
  doc_score: number | null;
  age_score: number | null;
}

export interface EvalConfigSection {
  title: string;
  points: number;
  items: EvalConfigItem[];
}

export interface EvalConfigItem {
  id: string;
  label: string;
  options: { label: string; val: number | string }[];
}
