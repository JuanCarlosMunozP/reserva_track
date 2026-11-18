import { useEffect, useState, type FormEvent } from 'react';
import { BookOpen, Building2, Dumbbell, Eye, Microscope, Monitor, Plus, Search, Pencil, Presentation, School, X } from 'lucide-react';
import { FormField, inputClass, Modal, PageHeader, Panel, PrimaryButton, StatusBadge } from '../../components/domain/DomainUI';
import { getApiErrorMessage } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { canEditAssignedSpaces, canManageAllSpaces } from '../../lib/permissions';
import { reservaTrackService } from '../../services/reservaTrack.service';
import type { Responsibility, Space, SpaceCategory, SpaceInput } from '../../types/reservaTrack';

const categoryLabels: Record<SpaceCategory, string> = {
  laboratory: 'Laboratorio', classroom: 'Aula', auditory: 'Auditorio', gym: 'Deportivo', study_room: 'Sala', other: 'Otro',
};
const categoryIcons = { laboratory: Microscope, classroom: School, auditory: Presentation, gym: Dumbbell, study_room: BookOpen, other: Building2 };
const emptyForm: SpaceInput = { name: '', description: '', category: 'laboratory', capacity: 20, location: '', is_active: true };

export function SpacesPage() {
  const { usuario } = useAuth();
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [responsibilities, setResponsibilities] = useState<Responsibility[]>([]);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [open, setOpen] = useState(false);
  const [detailsSpace, setDetailsSpace] = useState<Space | null>(null);
  const [branchOpen, setBranchOpen] = useState(false);
  const [branchName, setBranchName] = useState('');
  const [branchError, setBranchError] = useState('');
  const [editing, setEditing] = useState<number>();
  const [form, setForm] = useState<SpaceInput>(emptyForm);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    void Promise.all([reservaTrackService.spaces(), reservaTrackService.responsibilities()]).then(([spaceRows, responsibilityRows]) => {
      setSpaces(spaceRows);
      setResponsibilities(responsibilityRows);
    });
  }, []);

  const canManageSpaces = canManageAllSpaces(usuario);
  const canEditSpace = (spaceId: number) => canManageSpaces || (
    canEditAssignedSpaces(usuario) && responsibilities.some((item) =>
      item.userId === usuario?.id && item.spaceId === spaceId && item.isActive,
    )
  );

  const visible = spaces.filter((space) => {
    const matchesText = `${space.name} ${space.location} ${space.description}`.toLowerCase().includes(query.toLowerCase());
    const matchesStatus = filter === 'all' || (filter === 'active' ? space.isActive : !space.isActive);
    return matchesText && matchesStatus;
  });

  function startCreate() {
    setError('');
    setEditing(undefined);
    setForm(emptyForm);
    setOpen(true);
  }

  function startEdit(space: Space) {
    setError('');
    setEditing(space.id);
    setForm({ name: space.name, description: space.description, category: space.category, capacity: space.capacity, location: space.location, is_active: space.isActive });
    setOpen(true);
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    try {
      const saved = await reservaTrackService.saveSpace(form, editing);
      setSpaces(saved);
      setOpen(false);
      setNotice(editing ? 'Espacio actualizado.' : 'Espacio registrado.');
      window.setTimeout(() => setNotice(''), 2400);
    } catch (saveError) {
      setError(getApiErrorMessage(saveError, 'No se pudo guardar el espacio.'));
    }
  }

  async function saveBranch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBranchError('');
    try {
      const branches = await reservaTrackService.registerBranch(branchName);
      const created = branches[0];
      setBranchOpen(false);
      setBranchName('');
      setNotice(`Sede "${created.name}" registrada.`);
      window.setTimeout(() => setNotice(''), 2400);
    } catch (saveError) {
      setBranchError(getApiErrorMessage(saveError, 'No se pudo registrar la sede.'));
    }
  }

  return (
    <>
      <PageHeader eyebrow="Catálogo" title="Espacios institucionales" description="Consulta los ambientes disponibles para reservar." action={canManageSpaces ? <PrimaryButton onClick={startCreate}><Plus size={15} /> Registrar espacio</PrimaryButton> : undefined} />
      <div className="mb-4 flex flex-wrap gap-2.5">
        <label className="relative min-w-55 flex-1 sm:max-w-sm"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8793a5]" /><input className={`${inputClass} pl-9`} placeholder="Buscar espacio…" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
        <select className={`${inputClass} w-auto min-w-36.25`} value={filter} onChange={(event) => setFilter(event.target.value)}><option value="all">Todos los estados</option><option value="active">Activos</option><option value="inactive">Inactivos</option></select>
      </div>
      {error && <p role="alert" className="mb-4 rounded-lg bg-[#ffebee] px-4 py-3 text-xs font-semibold text-[#b42335]">{error}</p>}
      {notice && <p role="status" className="mb-4 rounded-lg bg-[#e8f7f0] px-4 py-3 text-xs font-semibold text-[#16865b]">{notice}</p>}
      {visible.length ? <div className="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-3">
        {visible.map((space) => {
          const Icon = categoryIcons[space.category] ?? Monitor;
          return <article key={space.id} className="rounded-[14px] border border-[#e5eaf1] bg-white p-4 shadow-[0_2px_8px_rgba(20,40,70,.025)]">
            <div className="mb-3 grid h-26.25 place-items-center rounded-[10px] bg-[#e6eefb] text-[#315c9e]"><Icon size={34} strokeWidth={1.7} /></div>
            <div className="flex items-start justify-between gap-3"><div><h2 className="text-sm font-extrabold text-[#172b4d]">{space.name}</h2><p className="mt-1 text-[11px] text-[#718096]">{space.location}</p></div><StatusBadge status={space.isActive ? 'active' : 'inactive'} /></div>
            <div className="mt-3 border-t border-[#e5eaf1] pt-3 text-xs text-[#718096]">{categoryLabels[space.category]} · Cap. {space.capacity}</div>
            {space.responsibleNames.length > 0 && <p className="mt-1 text-[11px] text-[#718096]">Responsable: {space.responsibleNames.join(', ')}</p>}
            <div className="mt-3 flex flex-wrap justify-end gap-1">
              <button type="button" onClick={() => setDetailsSpace(space)} className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-bold text-[#2563eb] hover:bg-[#eaf1ff]"><Eye size={14} /> Ver detalles</button>
              {canEditSpace(space.id) && <button type="button" onClick={() => startEdit(space)} className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-bold text-[#2563eb] hover:bg-[#eaf1ff]"><Pencil size={14} /> Editar</button>}
              {canManageSpaces && <button type="button" onClick={() => { setBranchName(''); setBranchError(''); setBranchOpen(true); }} className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-bold text-[#2563eb] hover:bg-[#eaf1ff]"><Building2 size={14} /> Registrar sede</button>}
            </div>
          </article>;
        })}
      </div> : <Panel><div className="py-8 text-center text-sm text-[#718096]">No se encontraron espacios.</div></Panel>}
      <Modal open={open} title={editing ? 'Editar espacio' : 'Registrar espacio'} onClose={() => setOpen(false)} onSubmit={save} submitLabel={editing ? 'Guardar cambios' : 'Guardar espacio'}>
        <FormField label="Nombre del espacio"><input className={inputClass} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required /></FormField>
        <FormField label="Categoría"><select className={inputClass} value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value as SpaceCategory })}><option value="laboratory">Laboratorio</option><option value="classroom">Aula</option><option value="auditory">Auditorio</option><option value="gym">Deportivo</option><option value="study_room">Sala</option><option value="other">Otro</option></select></FormField>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2"><FormField label="Capacidad"><input className={inputClass} type="number" min="1" value={form.capacity} onChange={(event) => setForm({ ...form, capacity: Number(event.target.value) })} required /></FormField><FormField label="Ubicación"><input className={inputClass} value={form.location} onChange={(event) => setForm({ ...form, location: event.target.value })} required /></FormField></div>
        <FormField label="Descripción"><textarea className={`${inputClass} min-h-20 resize-y`} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></FormField>
        <FormField label="Estado"><select className={inputClass} value={String(form.is_active)} onChange={(event) => setForm({ ...form, is_active: event.target.value === 'true' })}><option value="true">Activo</option><option value="false">Inactivo</option></select></FormField>
      </Modal>
      {detailsSpace && <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-[#10213c]/55 p-4" onMouseDown={(event) => event.target === event.currentTarget && setDetailsSpace(null)}>
        <section role="dialog" aria-modal="true" aria-labelledby="space-details-title" className="my-6 w-full max-w-[500px] rounded-[14px] bg-white p-6 shadow-2xl">
          <div className="mb-5 flex items-center justify-between gap-4">
            <h2 id="space-details-title" className="text-lg font-extrabold text-[#172b4d]">Detalle del espacio</h2>
            <button type="button" aria-label="Cerrar" onClick={() => setDetailsSpace(null)} className="grid size-9 place-items-center rounded-lg text-[#718096] hover:bg-[#f1f4f8]"><X size={18} /></button>
          </div>
          <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2"><dt className="text-xs font-bold text-[#718096]">Nombre</dt><dd className="mt-1 text-sm font-semibold text-[#172b4d]">{detailsSpace.name}</dd></div>
            <div><dt className="text-xs font-bold text-[#718096]">Categoría</dt><dd className="mt-1 text-sm text-[#243247]">{categoryLabels[detailsSpace.category]}</dd></div>
            <div><dt className="text-xs font-bold text-[#718096]">Capacidad</dt><dd className="mt-1 text-sm text-[#243247]">{detailsSpace.capacity} personas</dd></div>
            <div className="sm:col-span-2"><dt className="text-xs font-bold text-[#718096]">Ubicación</dt><dd className="mt-1 text-sm text-[#243247]">{detailsSpace.location}</dd></div>
            <div className="sm:col-span-2"><dt className="text-xs font-bold text-[#718096]">Descripción</dt><dd className="mt-1 text-sm text-[#243247]">{detailsSpace.description || 'Sin descripción'}</dd></div>
            <div className="sm:col-span-2"><dt className="text-xs font-bold text-[#718096]">Responsables</dt><dd className="mt-1 text-sm text-[#243247]">{detailsSpace.responsibleNames.length ? detailsSpace.responsibleNames.join(', ') : 'Sin responsable asignado'}</dd></div>
            <div><dt className="text-xs font-bold text-[#718096]">Estado</dt><dd className="mt-1"><StatusBadge status={detailsSpace.isActive ? 'active' : 'inactive'} /></dd></div>
          </dl>
          <div className="mt-6 flex justify-end"><button type="button" onClick={() => setDetailsSpace(null)} className="rounded-[9px] bg-[#edf2f8] px-4 py-2.5 text-xs font-bold text-[#172b4d]">Cerrar</button></div>
        </section>
      </div>}
      <Modal open={branchOpen} title="Registrar sede" onClose={() => setBranchOpen(false)} onSubmit={saveBranch} submitLabel="Registrar sede">
        {branchError && <p role="alert" className="rounded-lg bg-[#ffebee] px-3 py-2 text-xs font-semibold text-[#b42335]">{branchError}</p>}
        <FormField label="Nombre de la sede"><input className={inputClass} value={branchName} onChange={(event) => setBranchName(event.target.value)} maxLength={100} required autoFocus /></FormField>
      </Modal>
    </>
  );
}
