import { useEffect, useState, type FormEvent } from 'react';
import { Plus, Search, UserRound } from 'lucide-react';
import { FormField, inputClass, Modal, PageHeader, Panel, PrimaryButton, StatusBadge } from '../../components/domain/DomainUI';
import { getApiErrorMessage } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { reservaTrackService } from '../../services/reservaTrack.service';
import type { AppUser } from '../../types/reservaTrack';

const typeLabels: Record<AppUser['type'], string> = { student: 'Estudiante', teacher: 'Docente', personal_administrator: 'Personal administrativo' };
const btn = 'rounded-md px-2 py-1 text-[11px] font-semibold hover:bg-[#edf2fb]';
const emptyNew = () => ({ username: '', email: '', first_name: '', last_name: '', type: 'student' as AppUser['type'], role: 'usuario' as AppUser['role'], password: '' });

export function UsersPage() {
  const { usuario } = useAuth();
  const isSuperuser = Boolean(usuario?.is_superuser);
  const [users, setUsers] = useState<AppUser[]>([]);
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [creating, setCreating] = useState(false);
  const [newUser, setNewUser] = useState(emptyNew());
  const [passwordFor, setPasswordFor] = useState<AppUser | null>(null);
  const [newPassword, setNewPassword] = useState('');

  useEffect(() => { void reservaTrackService.users().then(setUsers); }, []);

  const visibleUsers = users.filter((user) => `${user.firstName} ${user.lastName} ${user.email} ${user.type}`.toLowerCase().includes(query.toLowerCase()));

  async function run(action: () => Promise<void>, fallback: string, done?: string) {
    setError('');
    try {
      await action();
      if (done) { setNotice(done); window.setTimeout(() => setNotice(''), 2600); }
    } catch (failure) {
      setError(getApiErrorMessage(failure, fallback));
    }
  }

  const toggleActive = (user: AppUser) => run(async () => {
    const saved = await reservaTrackService.setUserActive(user.id, !user.isActive);
    setUsers((rows) => rows.map((row) => (row.id === saved.id ? saved : row)));
  }, 'No se pudo actualizar el usuario.');

  const changeRole = (user: AppUser, role: AppUser['role']) => run(async () => {
    const saved = await reservaTrackService.setUserRole(user.id, role);
    setUsers((rows) => rows.map((row) => (row.id === saved.id ? saved : row)));
  }, 'No se pudo cambiar el rol.', 'Rol actualizado.');

  const remove = (user: AppUser) => run(async () => {
    setUsers(await reservaTrackService.deleteUser(user.id));
  }, 'No se pudo eliminar el usuario.', 'Usuario eliminado (o desactivado si tiene reservas).');

  async function submitCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await run(async () => {
      setUsers(await reservaTrackService.createUser(newUser));
      setCreating(false);
      setNewUser(emptyNew());
    }, 'No se pudo crear el usuario.', 'Usuario creado.');
  }

  async function submitPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!passwordFor) return;
    await run(async () => {
      await reservaTrackService.setUserPassword(passwordFor.id, newPassword);
      setPasswordFor(null);
      setNewPassword('');
    }, 'No se pudo restablecer la contraseña.', 'Contraseña restablecida.');
  }

  return (
    <>
      <PageHeader eyebrow="Administración" title="Usuarios" description="Consulta las cuentas, activa o desactiva su acceso y restablece contraseñas." action={isSuperuser ? <PrimaryButton onClick={() => setCreating(true)}><Plus size={16} /> Nuevo usuario</PrimaryButton> : undefined} />
      {error && <p role="alert" className="mb-4 rounded-lg bg-[#ffebee] px-4 py-3 text-xs font-semibold text-[#b42335]">{error}</p>}
      {notice && <p role="status" className="mb-4 rounded-lg bg-[#e8f7f0] px-4 py-3 text-xs font-semibold text-[#16865b]">{notice}</p>}
      <Panel className="mb-4">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-[15px] font-extrabold text-[#172b4d]">Usuarios registrados</h2><p className="mt-1 text-[11px] text-[#718096]">{users.length} cuentas</p></div><label className="relative w-full sm:max-w-xs"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8793a5]" /><input className={`${inputClass} pl-9`} placeholder="Buscar usuario…" value={query} onChange={(event) => setQuery(event.target.value)} /></label></div>
        <div className="overflow-x-auto"><table className="w-full min-w-[680px] text-left"><thead><tr className="border-b border-[#e5eaf1] text-[10px] uppercase tracking-[.6px] text-[#8793a5]"><th className="px-2.5 py-3">Usuario</th><th className="px-2.5 py-3">Tipo</th><th className="px-2.5 py-3">Rol</th><th className="px-2.5 py-3">Estado</th><th className="px-2.5 py-3">Acciones</th></tr></thead><tbody>{visibleUsers.map((user) => {
          const name = `${user.firstName} ${user.lastName}`;
          return <tr key={user.id} className="border-b border-[#eef1f5] last:border-0"><td className="px-2.5 py-3"><div className="flex items-center gap-2.5"><span className="grid size-9 place-items-center rounded-[10px] bg-[#edf2fb] text-[#34588c]"><UserRound size={16} /></span><span><strong className="block text-xs text-[#293a52]">{name}</strong><span className="mt-0.5 block text-[10px] text-[#718096]">{user.email}</span></span></div></td><td className="px-2.5 py-3 text-xs">{typeLabels[user.type]}</td>
            <td className="px-2.5 py-3 text-xs">{isSuperuser ? <select aria-label={`Rol de ${name}`} className={`${inputClass} w-auto`} value={user.role} onChange={(event) => void changeRole(user, event.target.value as AppUser['role'])}><option value="usuario">Usuario</option><option value="admin">Administrador</option></select> : user.role === 'admin' ? 'Administrador' : 'Usuario'}</td>
            <td className="px-2.5 py-3"><StatusBadge status={user.isActive ? 'active' : 'inactive'} /></td>
            <td className="px-2.5 py-3"><button type="button" aria-label={`${user.isActive ? 'Desactivar' : 'Activar'} ${name}`} onClick={() => void toggleActive(user)} className={`${btn} text-[#34588c]`}>{user.isActive ? 'Desactivar' : 'Activar'}</button><button type="button" aria-label={`Restablecer contraseña de ${name}`} onClick={() => setPasswordFor(user)} className={`${btn} text-[#34588c]`}>Contraseña</button>{isSuperuser && <button type="button" aria-label={`Eliminar ${name}`} onClick={() => void remove(user)} className={`${btn} text-[#c43d4b]`}>Eliminar</button>}</td></tr>;
        })}</tbody></table></div>
      </Panel>
      <Modal open={creating} title="Nuevo usuario" onClose={() => setCreating(false)} onSubmit={submitCreate} submitLabel="Crear usuario">
        <div className="grid grid-cols-2 gap-3"><FormField label="Nombre"><input className={inputClass} value={newUser.first_name} onChange={(event) => setNewUser({ ...newUser, first_name: event.target.value })} required /></FormField><FormField label="Apellido"><input className={inputClass} value={newUser.last_name} onChange={(event) => setNewUser({ ...newUser, last_name: event.target.value })} required /></FormField></div>
        <FormField label="Usuario"><input className={inputClass} value={newUser.username} onChange={(event) => setNewUser({ ...newUser, username: event.target.value })} required /></FormField>
        <FormField label="Correo"><input className={inputClass} type="email" value={newUser.email} onChange={(event) => setNewUser({ ...newUser, email: event.target.value })} required /></FormField>
        <div className="grid grid-cols-2 gap-3"><FormField label="Tipo"><select className={inputClass} value={newUser.type} onChange={(event) => setNewUser({ ...newUser, type: event.target.value as AppUser['type'] })}>{Object.entries(typeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></FormField><FormField label="Rol"><select className={inputClass} value={newUser.role} onChange={(event) => setNewUser({ ...newUser, role: event.target.value as AppUser['role'] })}><option value="usuario">Usuario</option><option value="admin">Administrador</option></select></FormField></div>
        <FormField label="Contraseña"><input className={inputClass} type="password" minLength={10} value={newUser.password} onChange={(event) => setNewUser({ ...newUser, password: event.target.value })} required /></FormField>
      </Modal>
      <Modal open={passwordFor !== null} title={`Restablecer contraseña de ${passwordFor?.firstName ?? ''} ${passwordFor?.lastName ?? ''}`} onClose={() => { setPasswordFor(null); setNewPassword(''); }} onSubmit={submitPassword} submitLabel="Restablecer">
        <FormField label="Nueva contraseña"><input className={inputClass} type="password" minLength={10} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} required /></FormField>
      </Modal>
    </>
  );
}
