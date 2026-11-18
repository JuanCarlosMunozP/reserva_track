import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, CalendarPlus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { PageHeader, Panel, PrimaryButton, StatusBadge } from '../../components/domain/DomainUI';
import { reservaTrackService } from '../../services/reservaTrack.service';
import type { Reservation, Space } from '../../types/reservaTrack';

const dayLabels = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

function mondayFor(offset: number) {
  const date = new Date();
  const daysUntilMonday = date.getDay() === 0 ? 1 : 1 - date.getDay();
  date.setDate(date.getDate() + daysUntilMonday + offset * 7);
  date.setHours(12, 0, 0, 0);
  return date;
}

function dateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function AvailabilityPage() {
  const navigate = useNavigate();
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [spaceFilter, setSpaceFilter] = useState('all');
  const [weekOffset, setWeekOffset] = useState(0);

  useEffect(() => {
    void Promise.all([reservaTrackService.reservations(), reservaTrackService.spaces()]).then(([rows, spaceRows]) => {
      setReservations(rows);
      setSpaces(spaceRows);
    });
  }, []);

  const monday = mondayFor(weekOffset);
  const days = dayLabels.map((label, index) => {
    const date = new Date(monday);
    date.setDate(monday.getDate() + index);
    return { label, date, key: dateKey(date) };
  });
  const monthLabel = monday.toLocaleDateString('es-CO', { month: 'long', year: 'numeric' });
  const visibleReservations = reservations.filter((row) => row.status !== 'rejected' && row.status !== 'canceled' && (spaceFilter === 'all' || String(row.spaceId) === spaceFilter));

  return (
    <>
      <PageHeader eyebrow="Agenda" title="Disponibilidad" description="Consulta la ocupación de los espacios por fecha." action={<PrimaryButton onClick={() => navigate('/reservas')}><CalendarPlus size={15} /> Solicitar reserva</PrimaryButton>} />
      <Panel className="mb-4">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div><h2 className="text-[15px] font-extrabold capitalize text-[#172b4d]">{monthLabel}</h2><p className="mt-1 text-[11px] text-[#718096]">Agenda semanal de espacios</p></div>
          <div className="flex items-center gap-2">
            <select aria-label="Filtrar por espacio" className="rounded-[9px] border border-[#dce3ed] bg-white px-3 py-2 text-xs text-[#243247]" value={spaceFilter} onChange={(event) => setSpaceFilter(event.target.value)}><option value="all">Todos los espacios</option>{spaces.map((space) => <option key={space.id} value={space.id}>{space.name}</option>)}</select>
            <button type="button" aria-label="Semana anterior" onClick={() => setWeekOffset((offset) => offset - 1)} className="grid size-9 place-items-center rounded-lg bg-[#edf2f8] text-[#172b4d]"><ChevronLeft size={17} /></button>
            <button type="button" onClick={() => setWeekOffset(0)} className="rounded-lg bg-[#edf2f8] px-3 py-2 text-xs font-bold text-[#172b4d]">Hoy</button>
            <button type="button" aria-label="Semana siguiente" onClick={() => setWeekOffset((offset) => offset + 1)} className="grid size-9 place-items-center rounded-lg bg-[#edf2f8] text-[#172b4d]"><ChevronRight size={17} /></button>
          </div>
        </div>
        <div className="overflow-x-auto pb-2">
          <div className="grid min-w-[780px] grid-cols-7 gap-2">
            {days.map((day) => {
              const events = visibleReservations.filter((reservation) => reservation.date === day.key);
              return <article key={day.key} className="min-h-[170px] rounded-[9px] border border-[#e5eaf1] bg-[#f8faff] p-2.5">
                <h3 className="mb-2 border-b border-[#e5eaf1] pb-2 text-xs font-extrabold text-[#172b4d]">{day.label} <span className="ml-1 font-normal text-[#718096]">{day.date.getDate()}</span></h3>
                {events.map((event) => <div key={event.id} className="mb-2 rounded-md border-l-2 border-[#2563eb] bg-[#e7efff] p-2 text-[10px] text-[#2455a0]"><strong>{event.startTime} · {event.spaceName}</strong><p className="mt-0.5 truncate">{event.applicantName}</p></div>)}
                {!events.length && <span className="text-[10px] text-[#a3adba]">Sin reservas</span>}
              </article>;
            })}
          </div>
        </div>
      </Panel>
      <Panel>
        <div className="mb-3"><h2 className="text-[15px] font-extrabold text-[#172b4d]">Ocupación registrada</h2><p className="mt-1 text-[11px] text-[#718096]">Reservas aprobadas y solicitudes pendientes</p></div>
        <div className="space-y-2">{visibleReservations.map((reservation) => <div key={reservation.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-[#eef1f5] py-3 last:border-0"><div><p className="text-xs font-bold text-[#293a52]">{reservation.spaceName} · {reservation.applicantName}</p><p className="mt-1 text-[11px] text-[#718096]">{new Date(`${reservation.date}T12:00:00`).toLocaleDateString('es-CO')} · {reservation.startTime}–{reservation.endTime}</p></div><StatusBadge status={reservation.status} /></div>)}</div>
      </Panel>
    </>
  );
}