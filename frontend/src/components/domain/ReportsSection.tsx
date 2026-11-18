import { useEffect, useState } from 'react';
import { ChartNoAxesColumn, Clock3, Percent, Sparkles } from 'lucide-react';
import { Panel } from './DomainUI';
import { reservaTrackService } from '../../services/reservaTrack.service';
import type { Reservation, Space } from '../../types/reservaTrack';

export function ReportsSection() {
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [spaces, setSpaces] = useState<Space[]>([]);

  useEffect(() => {
    void Promise.all([reservaTrackService.reservations(), reservaTrackService.spaces()]).then(([rows, spaceRows]) => {
      setReservations(rows);
      setSpaces(spaceRows);
    });
  }, []);

  const approved = reservations.filter((row) => row.status === 'approved').length;
  const reviewed = approved + reservations.filter((row) => row.status === 'rejected').length;
  const approvalRate = reviewed ? Math.round((approved / reviewed) * 100) : 0;
  const mostRequestedSpace = spaces
    .map((space) => ({ space, count: reservations.filter((row) => row.spaceId === space.id).length }))
    .sort((a, b) => b.count - a.count)[0];
  const bookedHours = reservations
    .filter((row) => row.status === 'approved')
    .reduce((sum, row) => sum + Number(row.endTime.slice(0, 2)) - Number(row.startTime.slice(0, 2)), 0);
  const states = [
    { label: 'Aprobadas', value: approved, color: 'bg-[#16865b]' },
    { label: 'Pendientes', value: reservations.filter((row) => row.status === 'pending').length, color: 'bg-[#d99b32]' },
    { label: 'Rechazadas', value: reservations.filter((row) => row.status === 'rejected').length, color: 'bg-[#c43d4b]' },
  ];
  const maximum = Math.max(1, ...states.map((item) => item.value));
  const categoryStats = [
    { label: 'Laboratorios', category: 'laboratory' },
    { label: 'Aulas', category: 'classroom' },
    { label: 'Auditorios', category: 'auditory' },
    { label: 'Deportivos', category: 'gym' },
    { label: 'Salas', category: 'study_room' },
  ].map((item) => {
    const categorySpaces = spaces.filter((space) => space.category === item.category);
    const useCount = reservations.filter((row) => categorySpaces.some((space) => space.id === row.spaceId)).length;
    return { label: item.label, percent: reservations.length ? Math.round((useCount / reservations.length) * 100) : 0 };
  });

  const stats = [
    { label: 'Total solicitudes', value: reservations.length, note: 'Todos los registros', icon: ChartNoAxesColumn },
    { label: 'Tasa de aprobación', value: `${approvalRate}%`, note: 'Solicitudes revisadas', icon: Percent },
    { label: 'Espacio más solicitado', value: mostRequestedSpace?.space.name ?? 'Sin datos', note: `${mostRequestedSpace?.count ?? 0} reservas`, icon: Sparkles },
    { label: 'Horas reservadas', value: `${bookedHours} h`, note: 'Reservas aprobadas', icon: Clock3 },
  ];

  return (
    <section aria-label="Estadísticas de reservas" className="mt-5">
      <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map(({ label, value, note, icon: Icon }) => (
          <article key={label} className="rounded-[14px] border border-[#e5eaf1] bg-white p-4.5 shadow-[0_2px_8px_rgba(20,40,70,.025)]">
            <div className="flex items-center justify-between gap-2 text-xs font-semibold text-[#718096]">
              {label}<span className="grid size-8.5 place-items-center rounded-[10px] bg-[#eaf1ff] text-[#315c9e]"><Icon size={16} /></span>
            </div>
            <p className="my-2 text-[25px] font-extrabold text-[#172b4d]">{value}</p>
            <p className="text-[11px] text-[#718096]">{note}</p>
          </article>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Panel>
          <h2 className="text-[15px] font-extrabold text-[#172b4d]">Reservas por estado</h2>
          <p className="mt-1 text-[11px] text-[#718096]">Distribución de solicitudes registradas</p>
          <div className="mt-6 flex h-55 items-end gap-5 border-b border-[#e5eaf1] px-3">
            {states.map((item) => (
              <div key={item.label} className="flex h-full flex-1 flex-col items-center justify-end">
                <div className={`w-full max-w-22.5 rounded-t-lg ${item.color}`} style={{ height: `${Math.max(8, (item.value / maximum) * 76)}%` }} />
                <strong className="mt-2 text-xs text-[#172b4d]">{item.label}</strong>
                <span className="text-[10px] text-[#718096]">{item.value}</span>
              </div>
            ))}
          </div>
        </Panel>
        <Panel>
          <h2 className="text-[15px] font-extrabold text-[#172b4d]">Uso por categoría</h2>
          <p className="mt-1 text-[11px] text-[#718096]">Participación en las reservas registradas</p>
          <div className="mt-4 space-y-5">
            {categoryStats.map((item) => (
              <div key={item.label}>
                <div className="mb-1.5 flex justify-between text-[11px]"><strong>{item.label}</strong><span className="text-[#718096]">{item.percent}%</span></div>
                <div className="h-2 overflow-hidden rounded-full bg-[#edf1f7]">
                  <div className="h-full rounded-full bg-[#3472d9] transition-all" style={{ width: `${item.percent}%` }} />
                </div>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </section>
  );
}
