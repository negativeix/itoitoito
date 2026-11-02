import { motion, type HTMLMotionProps } from 'motion/react'
import { forwardRef, type ReactNode } from 'react'
import { paperSpring } from '../lib/motion'

type Variant = 'primary' | 'secondary' | 'ghost'

type Props = Omit<HTMLMotionProps<'button'>, 'children'> & {
  variant?: Variant
  /** Fill the container width (default for primary/secondary). */
  block?: boolean
  children: ReactNode
}

const base =
  'inline-flex min-h-12 items-center justify-center gap-2 rounded-btn px-5 font-bold select-none transition-colors disabled:cursor-not-allowed'

const variants: Record<Variant, string> = {
  primary: 'h-14 bg-thread text-lg text-white shadow-card disabled:bg-surface-2 disabled:text-ink-muted disabled:shadow-none',
  secondary: 'h-14 border-2 border-line bg-surface text-lg text-ink disabled:text-ink-muted',
  ghost: 'text-base text-ink-muted hover:text-ink disabled:opacity-50',
}

/** Buttons. Rule: one `primary` per screen; everything else is secondary/ghost (§2.7). */
export const PrimaryButton = forwardRef<HTMLButtonElement, Props>(function PrimaryButton(
  { variant = 'primary', block = variant !== 'ghost', className = '', type = 'button', disabled, ...rest },
  ref,
) {
  return (
    <motion.button
      ref={ref}
      type={type}
      disabled={disabled}
      whileTap={disabled ? undefined : { scale: 0.97 }}
      transition={paperSpring}
      className={`${base} ${variants[variant]} ${block ? 'w-full' : ''} ${className}`}
      {...rest}
    />
  )
})
