import { useEffect, useState } from 'react';
import { CalendarClock } from 'lucide-react';
import { Panel, StatusBadge } from './DomainUI';
import { useAuth } from '../../context/AuthContext';
import { reservaTrackService } from '../../services/reservaTrack.service';
import type { Reservation, Responsibility } from '../../types/reservaTrack';

type HistoryMode = 'student' | 'teacher';

function ReservationTable({ rows, showApplicant }: { rows: Reservation[]; showApplicant: boolean }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-170 text-left">
        <thead>
          <tr className="border-b border-[#e5eaf1] text-[10px] uppercase tracking-[.6px] text-[#8793a5]">
            <th className="px-2.5 py-3">Código</th>
            {showApplicant && <th className="px-2.5 py-3">Solicitante</th>}
            <th className="px-2.5 py-3">Espacio</th>
            <th className="px-2.5 py-3">Fecha y hora</th>
            <th className="px-2.5 py-3">Motivo</th>
            <th className="px-2.5 py-3">Estado</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-b border-[#eef1f5] last:border-0">
              <td className="px-2.5 py-3 text-xs font-bold">{row.code}</td>
              {showApplicant && <td className="px-2.5 py-3 text-xs">{row.applicantName}</td>}
              <td className="px-2.5 py-3 text-xs">{row.spaceName}</td>
              <td className="px-2.5 py-3 text-xs">
                {new Date(`${row.date}T12:00:00`).toLocaleDateString('es-CO')}
                <div className="mt-0.5 text-[10px] text-[#718096]">{row.startTime} – {row.endTime}</div>
              </td>
              <td className="px-2.5 py-3 text-xs">{row.reason}</td>
              <td className="px-2.5 py-3"><StatusBadge status={row.status} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function HistorySection({ mode }: { mode: HistoryMode }) {
  const { usuario } = useAuth();
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [responsibilities, setResponsibilities] = useState<Responsibility[]>([]);
  const [period, setPeriod] = useState('all');

  useEffect(() => {
    let active = true;
    const load = mode === 'teacher'
      ? Promise.all([reservaTrackService.reservations(), reservaTrackService.responsibilities()])
      : reservaTrackService.reservations().then((rows) => [rows, [] as Responsibility[]] as const);
    void load.then(([rows, assignments]) => {
      if (!active) return;
      setReservations(rows);
      setResponsibilities(assignments);
    });
    return () => { active = false; };
  }, [mode]);

  const assignedSpaceIds = new Set(
    responsibilities.filter((item) => item.userId === usuario?.id && item.isActive).map((item) => item.spaceId),
  );
  const today = new Date().toISOString().slice(0, 10);
  const inPeriod = (reservation: Reservation) => period === 'all' || reservation.date >= today;
  const ownRows = reservations.filter((reservation) => reservation.userId === (usuario?.id ?? 7));
  const teacherRows = reservations.filter((reservation) => assignedSpaceIds.has(reservation.spaceId));
  const studentRequests = teacherRows.filter((reservation) => reservation.applicantType === 'student' && inPeriod(reservation));
  const teacherOwnRequests = teacherRows.filter((reservation) => reservation.userId === usuario?.id && inPeriod(reservation));
  const visibleOwnRows = ownRows.filter(inPeriod);
  const courseGroups = Array.from(
    studentRequests.reduce((groups, reservation) => {
      const course = reservation.applicantCourse?.trim() || 'Curso sin especificar';
      groups.set(course, [...(groups.get(course) ?? []), reservation]);
      return groups;
    }, new Map<string, Reservation[]>()),
  ).sort(([left], [right]) => left.localeCompare(right, 'es'));
  const count = (rows: Reservation[], status: Reservation['status']) => rows.filter((reservation) => reservation.status === status).length;
  const stats = mode === 'student'
    ? [
        { label: 'Solicitudes realizadas', value: ownRows.length, note: 'En el periodo actual' },
        { label: 'Aprobadas', value: count(ownRows, 'approved'), note: 'Reservas confirmadas' },
        { label: 'Pendientes', value: count(ownRows, 'pending'), note: 'En revisión' },
        { label: 'Canceladas', value: count(ownRows, 'canceled'), note: 'Por el solicitante' },
      ]
    : [
        { label: 'Solicitudes de estudiantes', value: teacherRows.filter((row) => row.applicantType === 'student').length, note: 'En espacios asignados' },
        { label: 'Pendientes', value: count(studentRequests, 'pending'), note: 'En revisión' },
        { label: 'Aprobadas', value: count(studentRequests, 'approved'), note: 'Reservas confirmadas' },
        { label: 'Área docente', value: usuario?.area || 'Sin área', note: 'Solicitudes asignadas' },
      ];
  const visibleCount = mode === 'student' ? visibleOwnRows.length : studentRequests.length + teacherOwnRequests.length;

  return (
    <section aria-label="Historial de reservas" className="mt-5">
      <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => (
          <article key={stat.label} className="rounded-[14px] border border-[#e5eaf1] bg-white p-4.5 shadow-[0_2px_8px_rgba(20,40,70,.025)]">
            <p className="text-xs font-semibold text-[#718096]">{stat.label}</p>
            <p className={`my-2 font-extrabold text-[#172b4d] ${typeof stat.value === 'number' ? 'text-[27px]' : 'text-lg'}`}>{typeof stat.value === 'number' ? String(stat.value).padStart(2, '0') : stat.value}</p>
            <p className="text-[11px] text-[#718096]">{stat.note}</p>
          </article>
        ))}
      </div>
      <Panel>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-[15px] font-extrabold text-[#172b4d]">{mode === 'student' ? 'Mis solicitudes' : 'Solicitudes de estudiantes'}</h2>
            <p className="mt-1 text-[11px] text-[#718096]">{visibleCount} reservas{mode === 'teacher' ? ` · Área: ${usuario?.area || 'Sin área asignada'}` : ''}</p>
          </div>
          <select className="rounded-[9px] border border-[#dce3ed] bg-white px-3 py-2 text-xs" value={period} onChange={(event) => setPeriod(event.target.value)}>
            <option value="all">Todas</option>
            <option value="upcoming">Próximas</option>
          </select>
        </div>
        {mode === 'student' && visibleOwnRows.length > 0 && <ReservationTable rows={visibleOwnRows} showApplicant={false} />}
        {mode === 'teacher' && courseGroups.map(([course, rows]) => (
          <section key={course} className="mt-4 border-t border-[#eef1f5] pt-4">
            <h3 className="mb-2 text-xs font-extrabold text-[#315c9e]">Curso: {course}</h3>
            <ReservationTable rows={rows} showApplicant />
          </section>
        ))}
        {mode === 'teacher' && teacherOwnRequests.length > 0 && (
          <section className="mt-4 border-t border-[#eef1f5] pt-4">
            <h3 className="mb-2 text-xs font-extrabold text-[#315c9e]">Mis solicitudes · Área: {usuario?.area || 'Sin área asignada'}</h3>
            <ReservationTable rows={teacherOwnRequests} showApplicant={false} />
          </section>
        )}
        {visibleCount === 0 && (
          <div className="grid min-h-44 place-items-center text-center text-sm text-[#718096]">
            <div><CalendarClock className="mx-auto mb-2 text-[#91a5c4]" size={26} />{mode === 'student' ? 'Todavía no tienes reservas en este periodo.' : 'No hay solicitudes en tus espacios asignados.'}</div>
          </div>
        )}
      </Panel>
    </section>
  );
}