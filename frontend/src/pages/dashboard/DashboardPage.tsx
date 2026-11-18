import { useNavigate } from 'react-router-dom';
import { ArrowRight, CalendarCheck2, Clock3, Plus, UsersRound, Building2 } from 'lucide-react';
import { ReportsSection } from '../../components/domain/ReportsSection';
import { useAuth } from '../../context/AuthContext';
import { canCreateReservation } from '../../lib/permissions';

const requests = [
  { code: 'RT-2026-041', person: 'Laura Gómez', initials: 'LG', space: 'Laboratorio de Sistemas', date: '03 nov 2026', time: '08:00 – 10:00', status: 'Pendiente' },
  { code: 'RT-2026-040', person: 'Andrés López', initials: 'AL', space: 'Auditorio principal', date: '03 nov 2026', time: '10:00 – 12:00', status: 'Aprobada' },
  { code: 'RT-2026-039', person: 'María Pérez', initials: 'MP', space: 'Gimnasio', date: '04 nov 2026', time: '14:00 – 16:00', status: 'Pendiente' },
  { code: 'RT-2026-038', person: 'David Rojas', initials: 'DR', space: 'Sala de estudio', date: '02 nov 2026', time: '09:00 – 11:00', status: 'Rechazada' },
];

const activity = [
  { title: 'Reserva aprobada', detail: 'Auditorio principal · Andrés López', time: 'Hoy, 09:42 a. m.', color: 'bg-[#2563eb]' },
  { title: 'Nueva solicitud', detail: 'Laboratorio de Sistemas · Laura Gómez', time: 'Hoy, 08:15 a. m.', color: 'bg-[#d99b32]' },
  { title: 'Espacio actualizado', detail: 'Gimnasio · Capacidad verificada', time: 'Ayer, 03:20 p. m.', color: 'bg-[#16a36a]' },
  { title: 'Usuario registrado', detail: 'Nuevo usuario institucional', time: 'Ayer, 11:05 a. m.', color: 'bg-[#9b7bd1]' },
];

const stats = [
  { label: 'Espacios registrados', value: '06', note: '5 activos · 1 inactivo', icon: Building2 },
  { label: 'Reservas del mes', value: '48', note: '12 solicitudes esta semana', icon: CalendarCheck2 },
  { label: 'Pendientes de revisión', value: '2', note: 'Requieren aprobación', icon: Clock3 },
  { label: 'Usuarios activos', value: '126', note: 'Estudiantes, docentes y personal', icon: UsersRound },
];

function StatusBadge({ status }: { status: string }) {
  const styles = status === 'Aprobada'
    ? 'bg-[#e8f7f0] text-[#16865b]'
    : status === 'Pendiente'
      ? 'bg-[#fff4dc] text-[#a96908]'
      : 'bg-[#ffebee] text-[#c43d4b]';
  return <span className={`inline-flex rounded-full px-2 py-1 text-[10px] font-extrabold ${styles}`}>{status}</span>;
}

export function DashboardPage() {
  const navigate = useNavigate();
  const { usuario } = useAuth();

  return (
    <>
      <div className="mb-6 flex items-start justify-between gap-5">
        <div>
          <div className="mb-1.5 text-[11px] font-extrabold uppercase tracking-[1px] text-[#2563eb]">Resumen general</div>
          <h1 className="m-0 text-[27px] font-extrabold leading-tight text-[#172b4d]">Panel principal</h1>
          <p className="mt-2 text-[13px] text-[#718096]">Consulta el estado de los espacios y las solicitudes de reserva.</p>
        </div>
        {canCreateReservation(usuario) && <button type="button" onClick={() => navigate('/reservas')} className="inline-flex shrink-0 items-center gap-2 rounded-[9px] bg-[#2563eb] px-4 py-2.5 text-xs font-bold text-white hover:bg-[#1d4ed8]">
          <Plus size={15} /> Nueva reserva
        </button>}
      </div>

      <section className="mb-5.5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4 xl:gap-4">
        {stats.map(({ label, value, note, icon: Icon }) => (
          <article key={label} className="rounded-[14px] border border-[#e5eaf1] bg-white p-4.5 shadow-[0_2px_8px_rgba(20,40,70,.025)]">
            <div className="flex items-center justify-between gap-2 text-xs font-semibold text-[#718096]">
              {label}<span className="grid size-8.5 shrink-0 place-items-center rounded-[10px] bg-[#eaf1ff] text-[#315c9e]"><Icon size={17} /></span>
            </div>
            <div className="my-2 text-[27px] font-extrabold text-[#172b4d]">{value}</div>
            <div className="text-[11px] text-[#718096]">{note}</div>
          </article>
        ))}
      </section>

      <div className="grid grid-cols-1 gap-4.25 xl:grid-cols-[1.45fr_1fr]">
        <section className="mb-4.25 min-w-0 rounded-[14px] border border-[#e5eaf1] bg-white p-5 shadow-[0_2px_8px_rgba(20,40,70,.025)]">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div><h2 className="text-[15px] font-extrabold text-[#172b4d]">Solicitudes recientes</h2><p className="mt-1 text-[11px] text-[#718096]">Últimos movimientos registrados</p></div>
            <button type="button" onClick={() => navigate('/reservas')} className="inline-flex items-center gap-1 rounded-[9px] bg-[#edf2f8] px-3 py-2 text-xs font-bold text-[#172b4d] hover:bg-[#e1e9f3]">Ver todas <ArrowRight size={14} /></button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-155 border-collapse text-left">
              <thead><tr className="border-b border-[#e5eaf1] text-[10px] uppercase tracking-[.6px] text-[#8793a5]">
                <th className="px-2.5 py-3 font-semibold">Código</th><th className="px-2.5 py-3 font-semibold">Solicitante</th><th className="px-2.5 py-3 font-semibold">Espacio</th><th className="px-2.5 py-3 font-semibold">Fecha y hora</th><th className="px-2.5 py-3 font-semibold">Estado</th>
              </tr></thead>
              <tbody>{requests.map((request) => (
                <tr key={request.code} className="border-b border-[#eef1f5] last:border-0">
                  <td className="px-2.5 py-3 text-xs font-bold text-[#293a52]">{request.code}</td>
                  <td className="px-2.5 py-3"><div className="flex items-center gap-2"><span className="grid size-7.25 place-items-center rounded-[9px] bg-[#edf2fb] text-[10px] font-extrabold text-[#34588c]">{request.initials}</span><span className="text-xs">{request.person}</span></div></td>
                  <td className="px-2.5 py-3 text-xs">{request.space}</td>
                  <td className="px-2.5 py-3 text-xs">{request.date}<div className="mt-0.5 text-[10px] text-[#718096]">{request.time}</div></td>
                  <td className="px-2.5 py-3"><StatusBadge status={request.status} /></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </section>

        <section className="mb-4.25 rounded-[14px] border border-[#e5eaf1] bg-white p-5 shadow-[0_2px_8px_rgba(20,40,70,.025)]">
          <div className="mb-2"><h2 className="text-[15px] font-extrabold text-[#172b4d]">Actividad reciente</h2><p className="mt-1 text-[11px] text-[#718096]">Eventos de la plataforma</p></div>
          {activity.map((item) => (
            <div key={item.title} className="flex gap-3 border-b border-[#eef1f5] py-3 last:border-0">
              <span className={`mt-1.5 size-2.25 shrink-0 rounded-full ${item.color}`} />
              <div><strong className="text-xs text-[#243247]">{item.title}</strong><p className="mt-1 text-[11px] text-[#718096]">{item.detail}<br />{item.time}</p></div>
            </div>
          ))}
        </section>
      </div>
      <ReportsSection />
    </>
  );
}
