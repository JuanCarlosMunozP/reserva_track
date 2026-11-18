import { useEffect, useState, type FormEvent } from 'react';
import { Link2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { getApiErrorMessage } from '../../lib/api';
import { FormField, inputClass, Modal, PageHeader, Panel, PrimaryButton, StatusBadge } from '../../components/domain/DomainUI';
import { reservaTrackService } from '../../services/reservaTrack.service';
import type { AppUser, Responsibility, Space } from '../../types/reservaTrack';

export function ResponsibilitiesPage() {
  const { usuario } = useAuth();
  const isAdministrator = !usuario || usuario.is_superuser || usuario.role === 'admin';
  const [users, setUsers] = useState<AppUser[]>([]);
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [responsibilities, setResponsibilities] = useState<Responsibility[]>([]);
  const [assignOpen, setAssignOpen] = useState(false);
  const [userId, setUserId] = useState(0);
  const [spaceId, setSpaceId] = useState(0);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    void Promise.all([
      reservaTrackService.users(),
      reservaTrackService.spaces(),
      reservaTrackService.responsibilities(),
    ]).then(([userRows, spaceRows, assignmentRows]) => {
      const activeUsers = userRows.filter((user) => user.role === 'usuario' && user.isActive);
      const activeSpaces = spaceRows.filter((space) => space.isActive);
      const assignedSpaceIds = new Set(
        assignmentRows.filter((item) => item.userId === usuario?.id && item.isActive).map((item) => item.spaceId),
      );
      setUsers(activeUsers);
      setSpaces(isAdministrator ? activeSpaces : activeSpaces.filter((space) => assignedSpaceIds.has(space.id)));
      setResponsibilities(assignmentRows);
      setUserId(activeUsers[0]?.id ?? 0);
      const selectableSpaces = isAdministrator ? activeSpaces : activeSpaces.filter((space) => assignedSpaceIds.has(space.id));
      setSpaceId(selectableSpaces[0]?.id ?? 0);
    });
  }, [isAdministrator, usuario?.id]);

  async function assign(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    const user = users.find((item) => item.id === Number(userId));
    const space = spaces.find((item) => item.id === Number(spaceId));
    if (!user || !space) return;
    try {
      setResponsibilities(await reservaTrackService.assignResponsibility(user, space));
      setAssignOpen(false);
      setNotice('Responsable asignado al espacio.');
      window.setTimeout(() => setNotice(''), 2400);
    } catch (assignError) {
      setError(getApiErrorMessage(assignError, 'No se pudo asignar el responsable.'));
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Administración"
        title="Responsables"
        description="Consulta las asignaciones y gestiona los espacios que tienes a cargo."
        action={<PrimaryButton onClick={() => setAssignOpen(true)}><Link2 size={15} /> Asignar responsable</PrimaryButton>}
      />
      {error && <p role="alert" className="mb-4 rounded-lg bg-[#ffebee] px-4 py-3 text-xs font-semibold text-[#b42335]">{error}</p>}
      {notice && <p role="status" className="mb-4 rounded-lg bg-[#e8f7f0] px-4 py-3 text-xs font-semibold text-[#16865b]">{notice}</p>}
      <Panel>
        <div className="mb-3"><h2 className="text-[15px] font-extrabold text-[#172b4d]">Asignaciones operativas</h2><p className="mt-1 text-[11px] text-[#718096]">{responsibilities.length} responsables</p></div>
        <div className="overflow-x-auto"><table className="w-full min-w-[580px] text-left"><thead><tr className="border-b border-[#e5eaf1] text-[10px] uppercase tracking-[.6px] text-[#8793a5]"><th className="px-2.5 py-3">Responsable</th><th className="px-2.5 py-3">Espacio asignado</th><th className="px-2.5 py-3">Fecha de asignación</th><th className="px-2.5 py-3">Estado</th></tr></thead><tbody>{responsibilities.map((item) => <tr key={item.id} className="border-b border-[#eef1f5] last:border-0"><td className="px-2.5 py-3 text-xs">{item.userName}</td><td className="px-2.5 py-3 text-xs">{item.spaceName}</td><td className="px-2.5 py-3 text-xs">{new Date(`${item.assignmentDate}T12:00:00`).toLocaleDateString('es-CO')}</td><td className="px-2.5 py-3"><StatusBadge status={item.isActive ? 'active' : 'inactive'} /></td></tr>)}</tbody></table></div>
        {!responsibilities.length && <p className="py-8 text-center text-sm text-[#718096]">No hay asignaciones para mostrar.</p>}
      </Panel>
      <Modal open={assignOpen} title="Asignar responsable" onClose={() => setAssignOpen(false)} onSubmit={assign} submitLabel="Asignar espacio">
        <FormField label="Responsable"><select className={inputClass} value={userId} onChange={(event) => setUserId(Number(event.target.value))} required>{users.map((user) => <option key={user.id} value={user.id}>{user.firstName} {user.lastName}</option>)}</select></FormField>
        <FormField label="Espacio"><select className={inputClass} value={spaceId} onChange={(event) => setSpaceId(Number(event.target.value))} required>{spaces.map((space) => <option key={space.id} value={space.id}>{space.name}</option>)}</select></FormField>
      </Modal>
    </>
  );
}