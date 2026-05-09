import type { DbAction } from "./index";

export type ExecutionStatus = "success" | "failed";

export interface ExecutionEventPayload {
  tableName: string;
  action: DbAction;
  profile?: string | string[];
  params: any;
  duration: number;
  status: ExecutionStatus;
  error?: any;
  traceId: string;
  spanId: string;
}

export type SecurityEventType = "field_trim" | "action_denied" | "unknown_operator";

export interface SecurityEventPayload {
  type: SecurityEventType;
  tableName: string;
  message: string;
  fields?: string[];
  profiles?: string[];
  action?: DbAction;
}

export interface ErrorEventPayload {
  error: any;
  tableName?: string;
  action?: DbAction;
  traceId?: string;
}

export interface MutationEventPayload {
  tableName: string;
  action: "softDelete" | "restore" | "hardDelete";
  records: any[];
  traceId: string;
}

export type CastorEvents = {
  execution: ExecutionEventPayload;
  security: SecurityEventPayload;
  parser: { rawQuery: any; reason: string; isModified: boolean };
  error: ErrorEventPayload;
  "soft-deleted": MutationEventPayload;
  restored: MutationEventPayload;
  "hard-deleted": MutationEventPayload;
};
