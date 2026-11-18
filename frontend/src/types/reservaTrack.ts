export type SpaceCategory = 'laboratory' | 'classroom' | 'auditory' | 'gym' | 'study_room' | 'other';
export type ReservationStatus = 'pending' | 'approved' | 'rejected' | 'canceled';

export interface Branch {
  id: number;
  name: string;
}

export interface Space {
  id: number;
  name: string;
  description: string;
  category: SpaceCategory;
  capacity: number;
  location: string;
  isActive: boolean;
  responsibleNames: string[];
}

export interface Reservation {
  id: number;
  code: string;
  userId: number;
  applicantName: string;
  applicantType?: 'student' | 'teacher' | 'personal_administrator';
  applicantCourse?: string;
  applicantArea?: string;
  spaceId: number;
  spaceName: string;
  date: string;
  startTime: string;
  endTime: string;
  status: ReservationStatus;
  reason: string;
  subject?: string;
  group?: string;
  attendees?: number | null;
}

export interface AppUser {
  id: number;
  username: string;
  firstName: string;
  lastName: string;
  email: string;
  course?: string;
  area?: string;
  type: 'student' | 'teacher' | 'personal_administrator';
  role: 'admin' | 'usuario';
  isActive: boolean;
}

export interface Responsibility {
  id: number;
  userId: number;
  userName: string;
  spaceId: number;
  spaceName: string;
  isActive: boolean;
  assignmentDate: string;
}

export interface ReservationInput {
  space: number;
  date: string;
  start_time: string;
  end_time: string;
  reason: string;
  subject?: string;
  group?: string;
  attendees?: number | null;
}

export interface SpaceInput {
  name: string;
  description: string;
  category: SpaceCategory;
  capacity: number;
  location: string;
  is_active: boolean;
}
