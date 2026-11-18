import axios from 'axios';
import { api as apiClient } from '../lib/api';
import { DEMO_FALLBACK_ENABLED } from '../lib/featureFlags';
import type {
  AppUser,
  Branch,
  Reservation,
  ReservationInput,
  ReservationStatus,
  Responsibility,
  Space,
  SpaceInput,
} from '../types/reservaTrack';

const STORAGE = {
  spaces: 'reservatrack.demo.spaces',
  branches: 'reservatrack.demo.branches',
  reservations: 'reservatrack.demo.reservations',
  users: 'reservatrack.demo.users',
  responsibilities: 'reservatrack.demo.responsibilities',
};

const initialSpaces: Space[] = [
  { id: 7, name: 'Aula 101', description: 'Aula para clases y actividades académicas.', category: 'classroom', capacity: 35, location: 'Bloque académico · Piso 1', isActive: true, responsibleNames: [] },
  { id: 1, name: 'Laboratorio de Sistemas', description: 'Equipos para prácticas de programación.', category: 'laboratory', capacity: 30, location: 'Bloque académico · Piso 2', isActive: true, responsibleNames: ['Andrés López'] },
  { id: 2, name: 'Auditorio principal', description: 'Auditorio para eventos y reuniones institucionales.', category: 'auditory', capacity: 120, location: 'Edificio central', isActive: true, responsibleNames: ['María Pérez'] },
  { id: 3, name: 'Gimnasio', description: 'Zona deportiva y actividades institucionales.', category: 'gym', capacity: 45, location: 'Zona deportiva', isActive: true, responsibleNames: [] },
  { id: 4, name: 'Sala de estudio', description: 'Espacio de trabajo colaborativo.', category: 'study_room', capacity: 20, location: 'Biblioteca', isActive: true, responsibleNames: [] },
  { id: 5, name: 'Laboratorio de Ciencias', description: 'Laboratorio para prácticas académicas.', category: 'laboratory', capacity: 28, location: 'Bloque académico · Piso 1', isActive: true, responsibleNames: ['Andrés López'] },
  { id: 6, name: 'Sala audiovisual', description: 'Sala equipada para proyecciones.', category: 'study_room', capacity: 25, location: 'Bloque cultural', isActive: false, responsibleNames: [] },
];

const initialBranches: Branch[] = [{ id: 1, name: 'Sede Central' }];

const initialReservations: Reservation[] = [
  { id: 41, code: 'RT-2026-041', userId: 2, applicantName: 'Laura Gómez', applicantType: 'student', applicantCourse: 'Ingeniería de Sistemas', spaceId: 1, spaceName: 'Laboratorio de Sistemas', date: '2026-11-03', startTime: '08:00', endTime: '10:00', status: 'pending', reason: 'Práctica de programación' },
  { id: 40, code: 'RT-2026-040', userId: 3, applicantName: 'Andrés López', applicantType: 'teacher', spaceId: 2, spaceName: 'Auditorio principal', date: '2026-11-03', startTime: '10:00', endTime: '12:00', status: 'approved', reason: 'Reunión académica' },
  { id: 39, code: 'RT-2026-039', userId: 4, applicantName: 'María Pérez', applicantType: 'personal_administrator', applicantArea: 'Administrativa', spaceId: 3, spaceName: 'Gimnasio', date: '2026-11-04', startTime: '14:00', endTime: '16:00', status: 'pending', reason: 'Actividad deportiva' },
  { id: 38, code: 'RT-2026-038', userId: 5, applicantName: 'David Rojas', applicantType: 'student', applicantCourse: 'Ingeniería Industrial', spaceId: 4, spaceName: 'Sala de estudio', date: '2026-11-02', startTime: '09:00', endTime: '11:00', status: 'rejected', reason: 'Trabajo colaborativo' },
  { id: 37, code: 'RT-2026-037', userId: 6, applicantName: 'Camila Torres', applicantType: 'student', applicantCourse: 'Ciencias Naturales', spaceId: 5, spaceName: 'Laboratorio de Ciencias', date: '2026-11-05', startTime: '07:00', endTime: '09:00', status: 'approved', reason: 'Práctica de laboratorio' },
  { id: 36, code: 'RT-2026-036', userId: 7, applicantName: 'Carlos Martínez', applicantType: 'personal_administrator', applicantArea: 'Administrativa', spaceId: 1, spaceName: 'Laboratorio de Sistemas', date: '2026-11-06', startTime: '08:00', endTime: '10:00', status: 'approved', reason: 'Proyecto de clase' },
  { id: 35, code: 'RT-2026-035', userId: 7, applicantName: 'Carlos Martínez', spaceId: 4, spaceName: 'Sala de estudio', date: '2026-11-08', startTime: '12:00', endTime: '14:00', status: 'pending', reason: 'Trabajo en equipo' },
  { id: 34, code: 'RT-2026-034', userId: 7, applicantName: 'Carlos Martínez', spaceId: 2, spaceName: 'Auditorio principal', date: '2026-10-29', startTime: '15:00', endTime: '16:00', status: 'canceled', reason: 'Reunión cancelada' },
];

const initialUsers: AppUser[] = [
  { id: 2, username: 'laura.gomez', firstName: 'Laura', lastName: 'Gómez', email: 'laura.gomez@institucion.edu.co', course: 'Ingeniería de Sistemas', type: 'student', role: 'usuario', isActive: true },
  { id: 3, username: 'andres.lopez', firstName: 'Andrés', lastName: 'López', email: 'andres.lopez@institucion.edu.co', area: 'Ciencias', type: 'teacher', role: 'usuario', isActive: true },
  { id: 4, username: 'maria.perez', firstName: 'María', lastName: 'Pérez', email: 'maria.perez@institucion.edu.co', area: 'Administrativa', type: 'personal_administrator', role: 'usuario', isActive: true },
  { id: 7, username: 'carlos.martinez', firstName: 'Carlos', lastName: 'Martínez', email: 'carlos.martinez@institucion.edu.co', type: 'personal_administrator', role: 'admin', isActive: true },
];

const initialResponsibilities: Responsibility[] = [
  { id: 1, userId: 3, userName: 'Andrés López', spaceId: 1, spaceName: 'Laboratorio de Sistemas', assignmentDate: '2026-10-15', isActive: true },
  { id: 2, userId: 4, userName: 'María Pérez', spaceId: 2, spaceName: 'Auditorio principal', assignmentDate: '2026-10-20', isActive: true },
  { id: 3, userId: 3, userName: 'Andrés López', spaceId: 5, spaceName: 'Laboratorio de Ciencias', assignmentDate: '2026-10-22', isActive: true },
];

function demoData<T>(key: string, initial: T[]): T[] {
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const saved = JSON.parse(raw) as T[];
      if (Array.isArray(saved) && saved.length > 0) return saved;
    }
  } catch {
    localStorage.removeItem(key);
  }
  localStorage.setItem(key, JSON.stringify(initial));
  return initial;
}

function saveDemo<T>(key: string, data: T[]) {
  localStorage.setItem(key, JSON.stringify(data));
  return data;
}

function demoSpaces(): Space[] {
  const rows = demoData(STORAGE.spaces, initialSpaces);
  const demoClassroom = initialSpaces.find((space) => space.category === 'classroom');
  if (demoClassroom && !rows.some((space) => space.category === 'classroom')) {
    const classroom = { ...demoClassroom, id: Math.max(0, ...rows.map((space) => space.id)) + 1 };
    return saveDemo(STORAGE.spaces, [classroom, ...rows]);
  }
  return rows;
}

function isDemoFallback(error: unknown) {
  if (!DEMO_FALLBACK_ENABLED) return false; // producción: los errores se muestran, no se simulan
  if (!axios.isAxiosError(error)) return false;
  const status = error.response?.status;
  return status === undefined || [401, 403, 404, 500, 502, 503, 504].includes(status);
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await apiClient.request<T>({
    url: `/${path}`,
    method: init?.method ?? 'GET',
    data: init?.body,
  });
  return response.data;
}

function results<T>(payload: T[] | { results: T[] }) {
  return Array.isArray(payload) ? payload : payload.results;
}

type Row = Record<string, unknown>;
type Page = Row[] | { results: Row[]; next?: string | null };

/** Lee todas las páginas de un listado paginado (la API pagina de 20 en 20 por defecto). */
async function fetchAll(path: string): Promise<Row[]> {
  const sep = path.includes('?') ? '&' : '?';
  const rows: Row[] = [];
  let url: string | null = `${path}${sep}page_size=200`;
  for (let guard = 0; url && guard < 100; guard += 1) {
    const payload: Page = await api<Page>(url);
    rows.push(...results(payload));
    const next: string | null | undefined = Array.isArray(payload) ? null : payload.next;
    // `next` es una URL absoluta: se conserva solo la parte relativa a la API.
    url = next ? next.replace(/^.*\/api\/v1\//, '') : null;
  }
  return rows;
}

/** Con el modo demo desactivado una lista vacía es una lista vacía. */
function orDemo<T>(rows: T[], demo: () => T[]) {
  return rows.length || !DEMO_FALLBACK_ENABLED ? rows : demo();
}

function fromSpace(row: Record<string, unknown>): Space {
  return {
    id: Number(row.id), name: String(row.name), description: String(row.description ?? ''),
    category: row.category as Space['category'], capacity: Number(row.capacity),
    location: String(row.location ?? ''), isActive: Boolean(row.is_active),
    responsibleNames: (row.responsible_names as string[]) ?? [],
  };
}

function fromBranch(row: Record<string, unknown>): Branch {
  return { id: Number(row.id), name: String(row.name) };
}

function fromReservation(row: Record<string, unknown>): Reservation {
  return {
    id: Number(row.id), code: String(row.code), userId: Number(row.user),
    applicantName: String(row.applicant_name ?? ''), applicantType: row.applicant_type as Reservation['applicantType'],
    applicantCourse: String(row.applicant_course ?? ''),
    applicantArea: String(row.applicant_area ?? ''), spaceId: Number(row.space),
    spaceName: String(row.space_name ?? ''), date: String(row.date),
    startTime: String(row.start_time).slice(0, 5), endTime: String(row.end_time).slice(0, 5),
    status: row.status as ReservationStatus, reason: String(row.reason),
    subject: String(row.subject ?? ''), group: String(row.group ?? ''),
    attendees: row.attendees == null ? null : Number(row.attendees),
  };
}

function fromUser(row: Record<string, unknown>): AppUser {
  return {
    id: Number(row.id), username: String(row.username), firstName: String(row.first_name),
    lastName: String(row.last_name), email: String(row.email), course: String(row.course ?? ''),
    area: String(row.area ?? ''), type: row.type as AppUser['type'],
    role: row.role as AppUser['role'], isActive: Boolean(row.is_active),
  };
}

export interface NewUserInput {
  username: string; email: string; first_name: string; last_name: string;
  type: AppUser['type']; role: AppUser['role']; password: string;
}

export const reservaTrackService = {
  async registerBranch(name: string) {
    try {
      const row = await api<Record<string, unknown>>('branches/', {
        method: 'POST',
        body: JSON.stringify({ name }),
      });
      const created = fromBranch(row);
      const branches = demoData(STORAGE.branches, initialBranches);
      return saveDemo(STORAGE.branches, [created, ...branches.filter((branch) => branch.id !== created.id)]);
    } catch (error) {
      if (!isDemoFallback(error)) throw error;
      const branches = demoData(STORAGE.branches, initialBranches);
      const created: Branch = {
        id: Math.max(0, ...branches.map((branch) => branch.id)) + 1,
        name: name.trim(),
      };
      return saveDemo(STORAGE.branches, [created, ...branches]);
    }
  },

  async spaces() {
    try {
      const rows = await fetchAll('spaces/');
      return rows.length ? saveDemo(STORAGE.spaces, rows.map(fromSpace)) : orDemo<Space>([], demoSpaces);
    } catch (error) {
      if (!isDemoFallback(error)) throw error;
      return demoSpaces();
    }
  },

  async saveSpace(input: SpaceInput, id?: number) {
    try {
      const row = await api<Record<string, unknown>>(id ? `spaces/${id}/` : 'spaces/', {
        method: id ? 'PATCH' : 'POST', body: JSON.stringify(input),
      });
      const saved = fromSpace(row);
      return saveDemo(STORAGE.spaces, [saved, ...(await this.spaces()).filter((space) => space.id !== saved.id)]);
    } catch (error) {
      if (!isDemoFallback(error)) throw error;
      const rows = demoSpaces();
      const saved: Space = { ...input, id: id ?? Math.max(0, ...rows.map((space) => space.id)) + 1, isActive: input.is_active, responsibleNames: [] };
      return saveDemo(STORAGE.spaces, [saved, ...rows.filter((space) => space.id !== id)]);
    }
  },

  async reservations() {
    try {
      const rows = await fetchAll('reservations/');
      return rows.length ? saveDemo(STORAGE.reservations, rows.map(fromReservation)) : orDemo<Reservation>([], () => demoData(STORAGE.reservations, initialReservations));
    } catch (error) {
      if (!isDemoFallback(error)) throw error;
      return demoData(STORAGE.reservations, initialReservations);
    }
  },

  async createReservation(input: ReservationInput, space: Space) {
    try {
      const row = await api<Record<string, unknown>>('reservations/', { method: 'POST', body: JSON.stringify(input) });
      const saved = fromReservation(row);
      return saveDemo(STORAGE.reservations, [saved, ...(await this.reservations())]);
    } catch (error) {
      if (!isDemoFallback(error)) throw error;
      const rows = demoData(STORAGE.reservations, initialReservations);
      const id = Math.max(0, ...rows.map((item) => item.id)) + 1;
      const saved: Reservation = {
        id, code: `RT-2026-${String(id).padStart(3, '0')}`, userId: 7,
        applicantName: 'Carlos Martínez', spaceId: space.id, spaceName: space.name,
        date: input.date, startTime: input.start_time, endTime: input.end_time,
        status: 'pending', reason: input.reason || `${input.subject ?? ''} · ${input.group ?? ''}`,
        subject: input.subject, group: input.group, attendees: input.attendees,
      };
      return saveDemo(STORAGE.reservations, [saved, ...rows]);
    }
  },

  async reviewReservation(id: number, status: 'approved' | 'rejected') {
    try {
      const action = status === 'approved' ? 'approve' : 'reject';
      const row = await api<Record<string, unknown>>(`reservations/${id}/${action}/`, { method: 'POST' });
      const saved = fromReservation(row);
      return saveDemo(STORAGE.reservations, (await this.reservations()).map((item) => item.id === id ? saved : item));
    } catch (error) {
      if (!isDemoFallback(error)) throw error;
      return saveDemo(STORAGE.reservations, demoData(STORAGE.reservations, initialReservations).map((item) => item.id === id ? { ...item, status } : item));
    }
  },

  async cancelReservation(id: number) {
    const row = await api<Record<string, unknown>>(`reservations/${id}/cancel/`, { method: 'POST' });
    const saved = fromReservation(row);
    return saveDemo(STORAGE.reservations, (await this.reservations()).map((item) => item.id === id ? saved : item));
  },

  async users() {
    try {
      const rows = await fetchAll('users/');
      return rows.length ? saveDemo(STORAGE.users, rows.map(fromUser)) : orDemo<AppUser>([], () => demoData(STORAGE.users, initialUsers));
    } catch (error) {
      if (!isDemoFallback(error)) throw error;
      return demoData(STORAGE.users, initialUsers);
    }
  },

  async updateReservation(id: number, input: Partial<ReservationInput>) {
    await api<Record<string, unknown>>(`reservations/${id}/`, { method: 'PATCH', body: JSON.stringify(input) });
    return this.reservations();
  },

  async createUser(input: NewUserInput) {
    await api<Record<string, unknown>>('users/', { method: 'POST', body: JSON.stringify(input) });
    return this.users();
  },

  async setUserRole(id: number, role: AppUser['role']) {
    const row = await api<Record<string, unknown>>(`users/${id}/`, { method: 'PATCH', body: JSON.stringify({ role }) });
    return fromUser(row);
  },

  async deleteUser(id: number) {
    await api(`users/${id}/`, { method: 'DELETE' });
    return this.users();
  },

  async setUserPassword(id: number, newPassword: string) {
    await api(`users/${id}/set_password/`, { method: 'POST', body: JSON.stringify({ new_password: newPassword }) });
  },

  async setUserActive(id: number, isActive: boolean) {
    const row = await api<Record<string, unknown>>(`users/${id}/`, { method: 'PATCH', body: JSON.stringify({ is_active: isActive }) });
    return fromUser(row);
  },

  async responsibilities() {
    try {
      const rows = await fetchAll('responsibilities/');
      const mapped = rows.map((row) => ({
        id: Number(row.id), userId: Number(row.user), userName: String(row.user_name),
        spaceId: Number(row.space), spaceName: String(row.space_name),
        isActive: Boolean(row.is_active), assignmentDate: String(row.assignment_date).slice(0, 10),
      }));
      return mapped.length ? saveDemo(STORAGE.responsibilities, mapped) : orDemo<Responsibility>([], () => demoData(STORAGE.responsibilities, initialResponsibilities));
    } catch (error) {
      if (!isDemoFallback(error)) throw error;
      return demoData(STORAGE.responsibilities, initialResponsibilities);
    }
  },

  async assignResponsibility(user: AppUser, space: Space) {
    try {
      await api('responsibilities/', {
        method: 'POST',
        body: JSON.stringify({ user: user.id, space: space.id, is_active: true }),
      });
      return this.responsibilities();
    } catch (error) {
      if (!isDemoFallback(error)) throw error;
      const rows = demoData(STORAGE.responsibilities, initialResponsibilities);
      const saved: Responsibility = {
        id: Math.max(0, ...rows.map((row) => row.id)) + 1,
        userId: user.id, userName: `${user.firstName} ${user.lastName}`,
        spaceId: space.id, spaceName: space.name, isActive: true,
        assignmentDate: new Date().toISOString().slice(0, 10),
      };
      const updated = saveDemo(STORAGE.responsibilities, [saved, ...rows]);
      saveDemo(STORAGE.spaces, demoSpaces().map((row) => row.id === space.id ? { ...row, responsibleNames: [...row.responsibleNames, saved.userName] } : row));
      return updated;
    }
  },

  async register(input: { username: string; first_name: string; last_name: string; email: string; type: AppUser['type']; course?: string; area?: string; password: string }) {
    try {
      return fromUser(await api<Record<string, unknown>>('auth/register/', { method: 'POST', body: JSON.stringify(input) }));
    } catch (error) {
      if (!isDemoFallback(error)) throw error;
      const rows = demoData(STORAGE.users, initialUsers);
      const created: AppUser = {
        id: Math.max(0, ...rows.map((user) => user.id)) + 1,
        username: input.username, firstName: input.first_name, lastName: input.last_name,
        email: input.email, course: input.course, area: input.area,
        type: input.type, role: 'usuario', isActive: true,
      };
      saveDemo(STORAGE.users, [created, ...rows]);
      return created;
    }
  },
};
