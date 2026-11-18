/**
 * Eventos que llegan por el canal WS `/ws/notifications/`.
 *
 * El backend usa el campo `type` como discriminador. Hoy hay un solo evento;
 * cuando se sumen más, se modela como union discriminada para que cada
 * consumidor reciba el tipo correcto al hacer narrowing.
 */
export interface ScheduleEmailSentEvent {
  type: "schedule_email_sent";
  schedule_id: number;
  equipment_asset_tag: string;
  /** ISO date (YYYY-MM-DD). */
  scheduled_date: string;
  branch_name: string;
  subject: string;
  /** ISO datetime. */
  sent_at: string;
}

export interface OverdueMaintenanceEvent {
  type: "overdue_maintenance";
  schedule_id: number;
  equipment_asset_tag: string;
  equipment_name: string;
  /** ISO date (YYYY-MM-DD). */
  scheduled_date: string;
  days_overdue: number;
  kind: string;
}

/** Nueva solicitud de reserva (llega a administradores y responsables del espacio). */
export interface ReservationCreatedEvent {
  type: "reservation_created";
  reservation_id: number;
  code: string;
  space_name: string;
  /** ISO date (YYYY-MM-DD). */
  date: string;
  start_time: string;
  end_time: string;
  status: string;
}

/** Resultado de la revisión (llega solo al solicitante). */
export interface ReservationReviewedEvent {
  type: "reservation_reviewed";
  reservation_id: number;
  code: string;
  space_name: string;
  date: string;
  start_time: string;
  end_time: string;
  status: "approved" | "rejected";
}

export type NotificationEvent =
  | ScheduleEmailSentEvent
  | OverdueMaintenanceEvent
  | ReservationCreatedEvent
  | ReservationReviewedEvent;
