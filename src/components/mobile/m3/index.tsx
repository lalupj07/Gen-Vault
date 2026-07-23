'use client';

import { type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export function GlassSurface({
  children,
  className,
  as: Tag = 'div',
}: {
  children: ReactNode;
  className?: string;
  as?: 'div' | 'section' | 'article' | 'ul';
}) {
  return <Tag className={cn('m3-glass', className)}>{children}</Tag>;
}

export function M3Section({
  title,
  description,
  children,
  className,
}: {
  title?: string;
  description?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('m3-glass p-4 space-y-3', className)}>
      {(title || description) && (
        <header className="space-y-0.5">
          {title && <h3 className="m3-title-md">{title}</h3>}
          {description && <p className="text-xs text-[color:var(--md-on-surface-variant)]">{description}</p>}
        </header>
      )}
      {children}
    </section>
  );
}

export function M3NavBar({ children, className, 'aria-label': ariaLabel }: {
  children: ReactNode;
  className?: string;
  'aria-label'?: string;
}) {
  return (
    <nav
      className={cn('m3-nav-bar relative flex items-center justify-around h-[4.25rem] px-1', className)}
      aria-label={ariaLabel}
    >
      {children}
    </nav>
  );
}

export function M3Fab({
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={cn(
        'm3-fab w-14 h-14 min-h-[44px] min-w-[44px] flex items-center justify-center transition-[transform,filter] duration-200 hover:brightness-110',
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function M3ListItem({
  title,
  subtitle,
  leading,
  trailing,
  onClick,
  className,
}: {
  title: string;
  subtitle?: string;
  leading?: ReactNode;
  trailing?: ReactNode;
  onClick?: () => void;
  className?: string;
}) {
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={cn(
          'w-full flex items-center gap-3 min-h-[64px] px-4 text-left transition-colors duration-200',
          'hover:bg-[color-mix(in_srgb,var(--md-primary)_8%,transparent)]',
          className,
        )}
      >
        {leading}
        <span className="flex-1 min-w-0">
          <span className="block m3-title-md truncate">{title}</span>
          {subtitle && (
            <span className="block text-xs text-[color:var(--md-on-surface-variant)] truncate mt-0.5">
              {subtitle}
            </span>
          )}
        </span>
        {trailing}
      </button>
    );
  }
  return (
    <div className={cn('w-full flex items-center gap-3 min-h-[64px] px-4', className)}>
      {leading}
      <span className="flex-1 min-w-0">
        <span className="block m3-title-md truncate">{title}</span>
        {subtitle && (
          <span className="block text-xs text-[color:var(--md-on-surface-variant)] truncate mt-0.5">
            {subtitle}
          </span>
        )}
      </span>
      {trailing}
    </div>
  );
}

export function M3ChipRow({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]', className)}>
      {children}
    </div>
  );
}

export function M3Chip({
  active,
  children,
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  return (
    <button
      type="button"
      data-active={active ? 'true' : 'false'}
      className={cn('m3-chip flex-shrink-0 transition-colors duration-200', className)}
      {...props}
    >
      {children}
    </button>
  );
}

export function M3TextField({
  label,
  className,
  multiline,
  ...props
}: (InputHTMLAttributes<HTMLInputElement> | TextareaHTMLAttributes<HTMLTextAreaElement>) & {
  label?: string;
  multiline?: boolean;
}) {
  const id = props.id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);
  return (
    <label className="block space-y-1.5">
      {label && (
        <span className="block text-xs text-[color:var(--md-on-surface-variant)]">{label}</span>
      )}
      {multiline ? (
        <textarea
          id={id}
          className={cn('m3-field py-3 min-h-[96px] resize-none', className)}
          {...(props as TextareaHTMLAttributes<HTMLTextAreaElement>)}
        />
      ) : (
        <input
          id={id}
          className={cn('m3-field', className)}
          {...(props as InputHTMLAttributes<HTMLInputElement>)}
        />
      )}
    </label>
  );
}

export function M3IconWell({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        'w-11 h-11 rounded-[var(--m3-radius-md)] flex items-center justify-center flex-shrink-0',
        'bg-[color:var(--md-primary-container)] text-[color:var(--md-on-primary-container)]',
        className,
      )}
    >
      {children}
    </span>
  );
}
