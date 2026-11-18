import { useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { canViewResponsibilitiesPage, canViewUsersPage } from '../../lib/permissions';
import {
  CalendarDays,
  ClipboardList,
  Grid2X2,
  Menu,
  ShieldCheck,
  UsersRound,
  X,
  Building2,
} from 'lucide-react';

const mainLinks = [
  { to: '/', label: 'Panel principal', icon: Grid2X2, end: true },
  { to: '/espacios', label: 'Espacios', icon: Building2 },
  { to: '/disponibilidad', label: 'Disponibilidad', icon: CalendarDays },
  { to: '/reservas', label: 'Reservas', icon: ClipboardList },
  { to: '/seguridad', label: 'Seguridad', icon: ShieldCheck },
];

export function ReservaLayout() {
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();
  const { usuario } = useAuth();
  const adminLinks = [
    ...(canViewUsersPage(usuario) ? [{ to: '/usuarios', label: 'Usuarios', icon: UsersRound }] : []),
    ...(canViewResponsibilitiesPage(usuario) ? [{ to: '/responsables', label: 'Responsables', icon: UsersRound }] : []),
  ];
  const displayName = usuario ? `${usuario.first_name} ${usuario.last_name}` : 'Timonel';
  const initials = displayName.split(/\s+/).map((part) => part[0]).slice(0, 2).join('').toUpperCase();
  const roleLabel = usuario?.is_superuser
    ? 'Ingeniero de software'
    : usuario?.role === 'admin'
      ? 'Administrador'
      : usuario?.type_display ?? 'Módulo institucional';

  if (location.pathname.startsWith('/timonel/')) {
    return <main className="min-h-screen bg-[#f4f7fb] px-[clamp(16px,2vw,28px)] py-5 text-[#243247]"><Outlet /></main>;
  }

  return (
    <div className="min-h-screen bg-[#f4f7fb] text-[#243247]">
      <header className="sticky top-0 z-30 flex h-[68px] items-center gap-4 border-b border-[#e5eaf1] bg-white px-5 md:px-7">
        <button
          type="button"
          aria-label={menuOpen ? 'Cerrar menú' : 'Abrir menú'}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((open) => !open)}
          className="grid size-10 place-items-center rounded-[11px] bg-[#eaf1ff] text-[#172b4d] hover:bg-[#dce8ff]"
        >
          {menuOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
        <NavLink to="/" className="flex items-center gap-2.5 font-extrabold text-[#172b4d]">
          <span className="grid size-[34px] place-items-center rounded-[10px] bg-[#2563eb] text-lg text-white">R</span>
          <span className="text-[19px]">ReservaTrack</span>
        </NavLink>
        <div className="flex-1" />
        <span className="hidden text-xs text-[#718096] sm:block">Plataforma institucional de reservas</span>
        <div className="flex items-center gap-2.5">
          <span className="grid size-9 place-items-center rounded-full bg-[#dce8ff] text-sm font-extrabold text-[#214d9a]">{initials}</span>
          <div className="hidden sm:block">
            <div className="text-[13px] font-bold leading-tight">{displayName}</div>
            <div className="mt-0.5 text-[11px] text-[#718096]">{roleLabel}</div>
          </div>
        </div>
      </header>

      {menuOpen && (
        <button
          type="button"
          aria-label="Cerrar menú"
          onClick={() => setMenuOpen(false)}
          className="fixed inset-x-0 bottom-0 top-[68px] z-20 bg-[#0f1c30]/25"
        />
      )}
      <aside className={`fixed bottom-0 left-0 top-[68px] z-20 flex w-[270px] flex-col overflow-y-auto bg-[#172b4d] px-[15px] py-[22px] text-[#dce6f5] shadow-xl transition-transform duration-200 ${menuOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <p className="px-3 pb-3 pt-2 text-[10px] font-extrabold uppercase tracking-[1.3px] text-[#91a5c4]">Menú principal</p>
        <nav className="space-y-1">
          {mainLinks.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              onClick={() => setMenuOpen(false)}
              className={({ isActive }) => `flex min-h-[48px] items-center gap-[13px] rounded-[10px] px-[13px] text-[13px] font-semibold transition-colors ${isActive ? 'bg-[#2c5da8] text-white' : 'text-[#dce6f5] hover:bg-[#29466f]'}`}
            >
              <Icon size={17} />{label}
            </NavLink>
          ))}
        </nav>
        {adminLinks.length > 0 && <>
          <p className="mt-7 px-3 pb-3 text-[10px] font-extrabold uppercase tracking-[1.3px] text-[#91a5c4]">Administración</p>
          <nav className="space-y-1">
            {adminLinks.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                onClick={() => setMenuOpen(false)}
                className={({ isActive }) => `flex min-h-[48px] items-center gap-[13px] rounded-[10px] px-[13px] text-[13px] font-semibold transition-colors ${isActive ? 'bg-[#2c5da8] text-white' : 'text-[#dce6f5] hover:bg-[#29466f]'}`}
              >
                <Icon size={17} />{label}
              </NavLink>
            ))}
          </nav>
        </>}
        <div className="mt-auto border-t border-[#385071] px-1 pt-4 text-[11px] leading-[1.6] text-[#9db0cc]">
          ReservaTrack · Prototipo funcional<br />Datos ficticios para demostración<br />Versión 1.0
        </div>
      </aside>

      <main className="min-h-[calc(100vh-68px)] px-[clamp(18px,3vw,42px)] py-[30px] pb-12">
        <Outlet />
      </main>
    </div>
  );
}
