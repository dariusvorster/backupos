type Props = {
  size?: number
  className?: string
}

export function LogoMark({ size = 48, className }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="BackupOS"
    >
      <rect width="48" height="48" rx="16" fill="#1A1206" />
      <rect x="6"  y="6"  width="16" height="16" rx="2" fill="#F5A623" />
      <rect x="26" y="6"  width="16" height="16" rx="2" fill="#854F0B" />
      <rect x="6"  y="26" width="16" height="16" rx="2" fill="#854F0B" />
      <rect x="26" y="26" width="16" height="16" rx="2" fill="#C77A14" />
      <rect x="18" y="18" width="12" height="12" rx="2" fill="#FEF5E0" />
    </svg>
  )
}
