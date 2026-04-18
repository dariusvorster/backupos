import type { CSSProperties, ButtonHTMLAttributes, ReactNode } from 'react'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'icon'
type Size    = 'sm' | 'md' | 'lg'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  children: ReactNode
}

const HEIGHT:  Record<Size,    string> = { sm: '28px', md: '36px', lg: '44px' }
const PADDING: Record<Size,    string> = { sm: '0 10px', md: '0 14px', lg: '0 18px' }
const FSIZE:   Record<Size,    string> = { sm: '12px',   md: '13px',   lg: '14px' }

const BG:    Record<Variant, string> = {
  primary:   'var(--accent)',
  secondary: 'var(--surf2)',
  ghost:     'transparent',
  danger:    'var(--err)',
  icon:      'transparent',
}
const COLOR: Record<Variant, string> = {
  primary:   'var(--accent-fg)',
  secondary: 'var(--fg)',
  ghost:     'var(--fg-mute)',
  danger:    'var(--white)',
  icon:      'var(--fg-mute)',
}
const BORDER: Record<Variant, string> = {
  primary:   'none',
  secondary: '1px solid var(--border)',
  ghost:     'none',
  danger:    'none',
  icon:      'none',
}

export function Button({ variant = 'secondary', size = 'md', children, style, ...rest }: ButtonProps) {
  const isIcon = variant === 'icon'
  const base: CSSProperties = {
    display:        'inline-flex',
    alignItems:     'center',
    justifyContent: 'center',
    gap:            6,
    height:         isIcon ? '32px' : HEIGHT[size],
    width:          isIcon ? '32px' : undefined,
    padding:        isIcon ? '0' : PADDING[size],
    borderRadius:   'var(--radius-sm)',
    fontSize:       isIcon ? '14px' : FSIZE[size],
    fontWeight:     500,
    fontFamily:     'var(--font-sans)',
    backgroundColor: BG[variant],
    color:           COLOR[variant],
    border:          BORDER[variant],
    cursor:          'pointer',
    transition:      'opacity 0.15s, background-color 0.15s',
    whiteSpace:      'nowrap',
  }

  return (
    <button style={{ ...base, ...style }} {...rest}>
      {children}
    </button>
  )
}
