'use client';

import { forwardRef, useId } from 'react';
import { FieldError, Input, Label } from '@mzn/ui';

type Props = React.InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  error?: string;
  hint?: string;
};

/** Labelled input with accessible error/hint wiring. */
export const FormField = forwardRef<HTMLInputElement, Props>(
  ({ label, error, hint, id, ...props }, ref) => {
    const auto = useId();
    const inputId = id ?? auto;
    const errorId = `${inputId}-error`;
    const hintId = `${inputId}-hint`;
    return (
      <div className="mb-4">
        <Label htmlFor={inputId}>{label}</Label>
        <Input
          ref={ref}
          id={inputId}
          aria-invalid={error ? true : undefined}
          aria-describedby={
            [error ? errorId : null, hint ? hintId : null].filter(Boolean).join(' ') || undefined
          }
          {...props}
        />
        {hint ? (
          <p id={hintId} className="mt-1 text-sm text-muted">
            {hint}
          </p>
        ) : null}
        <FieldError id={errorId}>{error}</FieldError>
      </div>
    );
  },
);
FormField.displayName = 'FormField';
