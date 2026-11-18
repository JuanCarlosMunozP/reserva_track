import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, UserPlus } from 'lucide-react';
import { FormField, inputClass, PrimaryButton } from '../../components/domain/DomainUI';
import { getApiErrorMessage } from '../../lib/api';
import { reservaTrackService } from '../../services/reservaTrack.service';
import type { AppUser } from '../../types/reservaTrack';

export function RegistrationPage() {
  const navigate = useNavigate();
  const [userType, setUserType] = useState<AppUser['type']>('student');
  const [message, setMessage] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage('');
    setIsSaving(true);
    const form = new FormData(event.currentTarget);
    try {
      await reservaTrackService.register({
        username: String(form.get('username')),
        first_name: String(form.get('first_name')),
        last_name: String(form.get('last_name')),
        email: String(form.get('email')),
        type: userType,
        course: String(form.get('course') ?? '').trim(),
        area: String(form.get('area') ?? '').trim(),
        password: String(form.get('password')),
      });
      navigate('/', { replace: true, state: { notice: 'Tu cuenta se registró correctamente.' } });
    } catch (error) {
      setMessage(getApiErrorMessage(error, 'No se pudo completar el registro. Revisa los datos e inténtalo nuevamente.'));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <main className="grid min-h-dvh place-items-center bg-[#f4f7fb] px-4 py-10">
      <section className="w-full max-w-130 rounded-[14px] border border-[#e5eaf1] bg-white p-7 shadow-[0_10px_30px_rgba(23,43,77,.10)]">
        <Link to="/" className="mb-7 inline-flex items-center gap-2 text-xs font-bold text-[#315c9e]"><ArrowLeft size={15} /> Volver al panel</Link>
        <div className="mb-6 flex items-center gap-3">
          <span className="grid size-11 place-items-center rounded-xl bg-[#eaf1ff] text-[#2563eb]"><UserPlus size={20} /></span>
          <div><p className="text-[11px] font-extrabold uppercase tracking-[1px] text-[#2563eb]">ReservaTrack</p><h1 className="text-xl font-extrabold text-[#172b4d]">Registrarse</h1></div>
        </div>
        {message && <p role="alert" className="mb-4 rounded-lg bg-[#ffebee] p-3 text-xs text-[#b42335]">{message}</p>}
        <form onSubmit={submit} className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <FormField label="Nombres"><input className={inputClass} name="first_name" autoComplete="given-name" required /></FormField>
            <FormField label="Apellidos"><input className={inputClass} name="last_name" autoComplete="family-name" required /></FormField>
          </div>
          <FormField label="Usuario"><input className={inputClass} name="username" autoComplete="username" required /></FormField>
          <FormField label="Correo institucional"><input className={inputClass} name="email" type="email" autoComplete="email" required /></FormField>
          <FormField label="Tipo de usuario"><select className={inputClass} name="type" value={userType} onChange={(event) => setUserType(event.target.value as AppUser['type'])}><option value="student">Estudiante</option><option value="teacher">Docente</option><option value="personal_administrator">Personal administrativo</option></select></FormField>
          {userType === 'student' && <FormField label="Curso"><input className={inputClass} name="course" maxLength={120} /></FormField>}
          {userType === 'teacher' && <FormField label="Área"><input className={inputClass} name="area" maxLength={120} /></FormField>}
          {userType === 'personal_administrator' && <FormField label="Área"><input className={inputClass} name="area" maxLength={120} /></FormField>}
          <FormField label="Contraseña"><input className={inputClass} name="password" type="password" autoComplete="new-password" minLength={10} title="Mínimo 10 caracteres; evita contraseñas comunes." required /></FormField>
          <PrimaryButton type="submit"><UserPlus size={15} />{isSaving ? 'Creando cuenta…' : 'Registrarme'}</PrimaryButton>
        </form>
      </section>
    </main>
  );
}