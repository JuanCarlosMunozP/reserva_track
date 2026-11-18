import type { FormEvent, ReactNode } from 'react';
import { X } from 'lucide-react';
import type { ReservationStatus } from '../../types/reservaTrack';

export function PageHeader({ eyebrow, title, description, action }: {
  eyebrow: string;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-6 flex items-start justify-between gap-5 max-sm:flex-col">
      <div>
        <div className="mb-1.5 text-[11px] font-extrabold uppercase tracking-[1px] text-[#2563eb]">{eyebrow}</div>
        <h1 className="m-0 text-[27px] font-extrabold leading-tight text-[#172b4d]">{title}</h1>
        <p className="mt-2 text-[13px] text-[#718096]">{description}</p>
      </div>
      {action}
    </div>
  );
}

export function PrimaryButton({ children, onClick, type = 'button' }: {
  children: ReactNode;
  onClick?: () => void;
  type?: 'button' | 'submit';
}) {
  return <button type={type} onClick={onClick} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-[9px] bg-[#2563eb] px-4 py-2.5 text-xs font-bold text-white transition-colors hover:bg-[#1d4ed8]">{children}</button>;
}

export function Panel({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-[14px] border border-[#e5eaf1] bg-white p-5 shadow-[0_2px_8px_rgba(20,40,70,.025)] ${className}`}>{children}</section>;
}

export function StatusBadge({ status }: { status: ReservationStatus | 'active' | 'inactive' }) {
  const styles = status === 'approved' || status === 'active'
    ? 'bg-[#e8f7f0] text-[#16865b]'
    : status === 'pending'
      ? 'bg-[#fff4dc] text-[#a96908]'
      : 'bg-[#ffebee] text-[#c43d4b]';
  const labels = { approved: 'Aprobada', pending: 'Pendiente', rejected: 'Rechazada', canceled: 'Cancelada', active: 'Activo', inactive: 'Inactivo' };
  return <span className={`inline-flex rounded-full px-2 py-1 text-[10px] font-extrabold ${styles}`}>{labels[status]}</span>;
}

export function Modal({ open, title, onClose, onSubmit, children, submitLabel }: {
  open: boolean;
  title: string;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  children: ReactNode;
  submitLabel: string;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-[#10213c]/55 p-4" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <form role="dialog" aria-modal="true" aria-label={title} onSubmit={onSubmit} className="my-6 w-full max-w-[500px] rounded-[14px] bg-white p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between gap-4">
          <h2 className="text-lg font-extrabold text-[#172b4d]">{title}</h2>
          <button type="button" aria-label="Cerrar" onClick={onClose} className="grid size-9 place-items-center rounded-lg text-[#718096] hover:bg-[#f1f4f8]"><X size={18} /></button>
        </div>
        <div className="space-y-3">{children}</div>
        <div className="mt-6 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-[9px] bg-[#edf2f8] px-4 py-2.5 text-xs font-bold text-[#172b4d]">Cancelar</button>
          <PrimaryButton type="submit">{submitLabel}</PrimaryButton>
        </div>
      </form>
    </div>
  );
}

export function FormField({ label, children }: { label: string; children: ReactNode }) {
  return <label className="block text-xs font-bold text-[#34445b]">{label}<span className="mt-1.5 block">{children}</span></label>;
}

export const inputClass = 'w-full rounded-[9px] border border-[#dce3ed] bg-white px-3 py-2.5 text-sm text-[#243247] outline-none focus:border-[#8eb2ff]';