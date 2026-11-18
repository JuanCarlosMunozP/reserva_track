import { useEffect, useState, type FormEvent } from 'react';
import { Check, Plus, Search, X } from 'lucide-react';
import { FormField, inputClass, Modal, PageHeader, Panel, PrimaryButton, StatusBadge } from '../../components/domain/DomainUI';
import { getApiErrorMessage } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { canCreateReservation, canReviewReservations } from '../../lib/permissions';
import { reservaTrackService } from '../../services/reservaTrack.service';
import type { Reservation, ReservationInput, Space, SpaceCategory } from '../../types/reservaTrack';

const emptyForm = (): ReservationInput => ({ space: 0, date: new Date().toISOString().slice(0, 10), start_time: '08:00', end_time: '10:00', reason: '', subject: '', group: '', attendees: null });
const statusNames: Record<string, string> = { all: 'Todos', pending: 'Pendiente', approved: 'Aprobada', rejected: 'Rechazada', canceled: 'Cancelada' };
const categoryNames: Record<SpaceCategory, string> = { laboratory: 'Laboratorio', classroom: 'Aula', auditory: 'Auditorio', gym: 'Deportivo', study_room: 'Sala', other: 'Otro' };

function displayDate(date: string) {
  return new Date(`${date}T12:00:00`).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function ReservationsPage({ timonelModule = false }: { timonelModule?: boolean }) {
  const { usuario } = useAuth();
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<ReservationInput>(emptyForm());
  const [editingId, setEditingId] = useState<number | null>(null);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    void Promise.all([reservaTrackService.reservations(), reservaTrackService.spaces()]).then(([rows, availableSpaces]) => {
      setReservations(rows);
      const activeSpaces = availableSpaces.filter((space) => space.isActive);
      setSpaces(activeSpaces);
      const requestSpaces = timonelModule
        ? activeSpaces.filter((space) => space.category === 'classroom' || space.category === 'laboratory' || space.category === 'auditory')
        : activeSpaces;
      if (requestSpaces.length) setForm((current) => ({ ...current, space: requestSpaces[0].id }));
    });
  }, [timonelModule]);

  const rows = reservations.filter((reservation) => {
    const matchesStatus = filter === 'all' || reservation.status === filter;
    const matchesQuery = `${reservation.code} ${reservation.applicantName} ${reservation.spaceName}`.toLowerCase().includes(query.toLowerCase());
    return matchesStatus && matchesQuery;
  });
  const canCreate = canCreateReservation(usuario);
  const canReview = !timonelModule && canReviewReservations(usuario);
  const requestSpaces = timonelModule
    ? spaces.filter((space) => space.category === 'classroom' || space.category === 'laboratory' || space.category === 'auditory')
    : spaces;
  const selectedSpace = requestSpaces.find((space) => space.id === Number(form.space));
  const needsAcademicDetails = selectedSpace?.category === 'laboratory' || selectedSpace?.category === 'auditory';
  const needsAttendees = selectedSpace?.category === 'auditory';

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    const space = spaces.find((item) => item.id === Number(form.space));
    if (!space || form.end_time <= form.start_time) return;
    try {
      if (editingId !== null) {
        setReservations(await reservaTrackService.updateReservation(editingId, { ...form, space: space.id }));
      } else {
        setReservations(await reservaTrackService.createReservation({ ...form, space: space.id }, space));
      }
      setOpen(false);
      setNotice(editingId !== null ? 'Solicitud actualizada.' : 'Solicitud creada y agregada a la lista.');
      setEditingId(null);
      window.setTimeout(() => setNotice(''), 2600);
    } catch (submitError) {
      setError(getApiErrorMessage(submitError, editingId !== null ? 'No se pudo actualizar la solicitud.' : 'No se pudo crear la solicitud.'));
    }
  }

  async function review(reservation: Reservation, status: 'approved' | 'rejected') {
    setError('');
    try {
      setReservations(await reservaTrackService.reviewReservation(reservation.id, status));
    } catch (reviewError) {
      setError(getApiErrorMessage(reviewError, 'No se pudo actualizar la reserva.'));
    }
  }

  async function cancel(reservation: Reservation) {
    setError('');
    try {
      setReservations(await reservaTrackService.cancelReservation(reservation.id));
      setNotice('Reserva cancelada.');
      window.setTimeout(() => setNotice(''), 2600);
    } catch (cancelError) {
      setError(getApiErrorMessage(cancelError, 'No se pudo cancelar la reserva.'));
    }
  }

  function startEdit(reservation: Reservation) {
    setError('');
    setEditingId(reservation.id);
    setForm({
      space: reservation.spaceId, date: reservation.date, start_time: reservation.startTime, end_time: reservation.endTime,
      reason: reservation.reason, subject: reservation.subject ?? '', group: reservation.group ?? '', attendees: reservation.attendees ?? null,
    });
    setOpen(true);
  }

  const isAdmin = Boolean(usuario?.is_superuser || usuario?.role === 'admin');
  const canEdit = (reservation: Reservation) =>
    isAdmin ? (reservation.status === 'pending' || reservation.status === 'approved') : reservation.status === 'pending' && reservation.userId === usuario?.id;

  const canCancel = (reservation: Reservation) =>
    (reservation.status === 'pending' || reservation.status === 'approved') &&
    (usuario?.is_superuser || usuario?.role === 'admin' || reservation.userId === usuario?.id);

  return (
    <>
      <PageHeader eyebrow={timonelModule ? 'Timonel · Docentes' : 'Operación'} title={timonelModule ? 'Reserva de aulas y espacios académicos' : 'Reservas'} description={timonelModule ? 'Solicita aulas, laboratorios y auditorios desde el módulo académico.' : 'Consulta las solicitudes de reserva de los espacios.'} action={canCreate && requestSpaces.length > 0 ? <PrimaryButton onClick={() => { setEditingId(null); setForm({ ...emptyForm(), space: requestSpaces[0].id }); setOpen(true); }}><Plus size={15} /> Solicitar espacio</PrimaryButton> : undefined} />
      <div className="mb-4 flex flex-wrap gap-2.5">
        <select className={`${inputClass} w-auto min-w-40`} value={filter} onChange={(event) => setFilter(event.target.value)}>{Object.entries(statusNames).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
        <label className="relative min-w-57.5 flex-1 sm:max-w-md"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8793a5]" /><input className={`${inputClass} pl-9`} placeholder="Buscar por código o solicitante…" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
      </div>
      {error && <p role="alert" className="mb-4 rounded-lg bg-[#ffebee] px-4 py-3 text-xs font-semibold text-[#b42335]">{error}</p>}
      {notice && <p role="status" className="mb-4 rounded-lg bg-[#e8f7f0] px-4 py-3 text-xs font-semibold text-[#16865b]">{notice}</p>}
      {!timonelModule && <Panel className="p-0">
        <div className="overflow-x-auto"><table className="w-full min-w-212.5 border-collapse text-left">
          <thead><tr className="border-b border-[#e5eaf1] text-[10px] uppercase tracking-[.6px] text-[#8793a5]">{['Código', 'Solicitante', 'Espacio', 'Fecha y hora', 'Estado', canReview ? 'Acciones' : 'Motivo'].map((head) => <th key={head} className="px-4 py-3 font-semibold">{head}</th>)}</tr></thead>
          <tbody>{rows.map((reservation) => <tr key={reservation.id} className="border-b border-[#eef1f5] last:border-0">
            <td className="px-4 py-3 text-xs font-bold text-[#293a52]">{reservation.code}</td>
            <td className="px-4 py-3 text-xs">{reservation.applicantName}</td>
            <td className="px-4 py-3 text-xs">{reservation.spaceName}{reservation.subject && <div className="mt-0.5 text-[10px] text-[#718096]">{reservation.subject} · {reservation.group}{reservation.attendees ? ` · ${reservation.attendees} asistentes` : ''}</div>}</td>
            <td className="px-4 py-3 text-xs">{displayDate(reservation.date)}<div className="mt-0.5 text-[10px] text-[#718096]">{reservation.startTime} – {reservation.endTime}</div></td>
            <td className="px-4 py-3"><StatusBadge status={reservation.status} /></td>
            <td className="px-4 py-3">{canReview && reservation.status === 'pending' ? <div className="flex gap-2"><button type="button" title="Aprobar" aria-label="Aprobar reserva" onClick={() => void review(reservation, 'approved')} className="grid size-8 place-items-center rounded-md text-[#16865b] hover:bg-[#e8f7f0]"><Check size={16} /></button><button type="button" title="Rechazar" aria-label="Rechazar reserva" onClick={() => void review(reservation, 'rejected')} className="grid size-8 place-items-center rounded-md text-[#c43d4b] hover:bg-[#ffebee]"><X size={16} /></button></div> : <span className="text-[11px] text-[#8793a5]">{reservation.reason}</span>}{canEdit(reservation) && <button type="button" aria-label="Editar reserva" onClick={() => startEdit(reservation)} className="ml-2 rounded-md px-2 py-1 text-[11px] font-semibold text-[#34588c] hover:bg-[#edf2fb]">Editar</button>}{canCancel(reservation) && <button type="button" aria-label="Cancelar reserva" onClick={() => void cancel(reservation)} className="ml-2 rounded-md px-2 py-1 text-[11px] font-semibold text-[#c43d4b] hover:bg-[#ffebee]">Cancelar</button>}</td>
          </tr>)}</tbody>
        </table></div>
        {!rows.length && <div className="p-8 text-center text-sm text-[#718096]">No hay solicitudes que coincidan con los filtros.</div>}
      </Panel>}
      <Modal open={open} title={editingId !== null ? 'Editar solicitud' : 'Solicitar nueva reserva'} onClose={() => { setOpen(false); setEditingId(null); }} onSubmit={submit} submitLabel={editingId !== null ? 'Guardar cambios' : 'Enviar solicitud'}>
        <FormField label="Espacio"><select className={inputClass} value={form.space} onChange={(event) => setForm({ ...form, space: Number(event.target.value), subject: '', group: '', attendees: null })} required><option value="" disabled>Selecciona un espacio</option>{requestSpaces.map((space) => <option key={space.id} value={space.id}>{categoryNames[space.category]} · {space.name} · {space.location}</option>)}</select></FormField>
        <FormField label="Fecha"><input className={inputClass} type="date" min={new Date().toISOString().slice(0, 10)} value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} required /></FormField>
        <div className="grid grid-cols-2 gap-3"><FormField label="Hora de inicio"><input className={inputClass} type="time" value={form.start_time} onChange={(event) => setForm({ ...form, start_time: event.target.value })} required /></FormField><FormField label="Hora de finalización"><input className={inputClass} type="time" value={form.end_time} onChange={(event) => setForm({ ...form, end_time: event.target.value })} required /></FormField></div>
        {needsAcademicDetails && <div className="grid grid-cols-1 gap-3 sm:grid-cols-2"><FormField label="Asignatura"><input className={inputClass} maxLength={160} value={form.subject ?? ''} onChange={(event) => setForm({ ...form, subject: event.target.value })} required /></FormField><FormField label="Grupo"><input className={inputClass} maxLength={100} value={form.group ?? ''} onChange={(event) => setForm({ ...form, group: event.target.value })} required /></FormField></div>}
        {needsAttendees && <FormField label="Cantidad de asistentes"><input className={inputClass} type="number" min="1" max={selectedSpace?.capacity} value={form.attendees ?? ''} onChange={(event) => setForm({ ...form, attendees: event.target.value ? Number(event.target.value) : null })} required /></FormField>}
        {selectedSpace && !needsAcademicDetails && <FormField label="Motivo"><textarea className={`${inputClass} min-h-20 resize-y`} maxLength={250} value={form.reason} onChange={(event) => setForm({ ...form, reason: event.target.value })} required /></FormField>}
        {needsAcademicDetails && <p className="text-[11px] text-[#718096]">La solicitud registrará la asignatura y el grupo como motivo académico.</p>}
        {!requestSpaces.length && <p role="status" className="text-xs text-[#a96908]">No hay aulas, laboratorios o auditorios activos disponibles para solicitar.</p>}
      </Modal>
    </>
  );
}
