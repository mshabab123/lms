import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../cn';

export const buttonVariants = cva(
  'inline-flex min-h-touch items-center justify-center gap-2 rounded-control px-4 text-base font-medium transition-colors focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:pointer-events-none disabled:opacity-60',
  {
    variants: {
      variant: {
        primary: 'bg-primary text-on-primary hover:bg-primary/90',
        accent: 'bg-accent text-on-accent hover:bg-accent/90',
        outline: 'border border-border bg-surface text-ink hover:bg-primary-soft',
        ghost: 'text-ink hover:bg-primary-soft',
        danger: 'bg-danger text-white hover:bg-danger/90',
      },
      size: { md: '', sm: 'min-h-9 px-3 text-sm', icon: 'w-touch px-0' },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, type, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp
        ref={ref}
        className={cn(buttonVariants({ variant, size }), className)}
        {...(asChild ? {} : { type: type ?? 'button' })}
        {...props}
      />
    );
  },
);
Button.displayName = 'Button';
