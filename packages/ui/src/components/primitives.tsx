import * as React from 'react';
import { cn } from '../cn';

export const Card = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn('rounded-card border border-border bg-surface p-5 shadow-sm', className)}
    {...props}
  />
);

export const CardTitle = ({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) => (
  <h2 className={cn('mb-3 text-lg font-semibold text-ink', className)} {...props} />
);

export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, ...props }, ref) => (
  <input
    ref={ref}
    className={cn(
      'min-h-touch w-full rounded-control border border-border bg-surface px-3 text-base text-ink placeholder:text-muted focus-visible:outline-3 focus-visible:outline-offset-1 focus-visible:outline-accent aria-[invalid=true]:border-danger',
      className,
    )}
    {...props}
  />
));
Input.displayName = 'Input';

export const Select = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(({ className, ...props }, ref) => (
  <select
    ref={ref}
    className={cn(
      'min-h-touch w-full rounded-control border border-border bg-surface px-3 text-base text-ink focus-visible:outline-3 focus-visible:outline-accent',
      className,
    )}
    {...props}
  />
));
Select.displayName = 'Select';

export const Label = ({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) => (
  <label className={cn('mb-1 block text-sm font-medium text-ink', className)} {...props} />
);

export const FieldError = ({ id, children }: { id: string; children?: React.ReactNode }) =>
  children ? (
    <p id={id} role="alert" className="mt-1 text-sm text-danger">
      {children}
    </p>
  ) : null;

type Tone = 'success' | 'warning' | 'danger' | 'neutral' | 'info';
const toneClass: Record<Tone, string> = {
  success: 'bg-success-soft text-success',
  warning: 'bg-warning-soft text-warning',
  danger: 'bg-danger-soft text-danger',
  neutral: 'bg-bg text-ink',
  info: 'bg-primary-soft text-primary',
};

/**
 * Status badge. Status is never conveyed by color alone: the visible label is
 * mandatory and an optional icon glyph reinforces it.
 */
export const Badge = ({
  tone = 'neutral',
  label,
  icon,
}: {
  tone?: Tone;
  label: string;
  icon?: React.ReactNode;
}) => (
  <span
    className={cn(
      'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-sm font-medium',
      toneClass[tone],
    )}
  >
    {icon ? <span aria-hidden="true">{icon}</span> : null}
    {label}
  </span>
);

export const Alert = ({
  tone = 'info',
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { tone?: Tone }) => (
  <div
    role={tone === 'danger' ? 'alert' : 'status'}
    className={cn('rounded-control p-3 text-sm', toneClass[tone], className)}
    {...props}
  />
);
