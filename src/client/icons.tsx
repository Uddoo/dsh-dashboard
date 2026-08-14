/** Small currentColor SVG set matching the accepted 1.5px outline treatment. */

import type { SVGProps } from 'react'

type IconProps = SVGProps<SVGSVGElement> & { size?: number }

function Icon({ size = 18, children, ...props }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden {...props}>
      {children}
    </svg>
  )
}

export const BoardIcon = (props: IconProps) => <Icon {...props}><path d="M4 5h6v14H4zM14 5h6v8h-6zM14 16h6v3h-6z" /></Icon>
export const HomeIcon = (props: IconProps) => <Icon {...props}><path d="m3 11 9-8 9 8" /><path d="M5 10v10h14V10M9 20v-6h6v6" /></Icon>
export const CubeIcon = (props: IconProps) => <Icon {...props}><path d="m12 3 8 4.5v9L12 21l-8-4.5v-9z" /><path d="m4 7.5 8 4.5 8-4.5M12 12v9" /></Icon>
export const FlowIcon = (props: IconProps) => <Icon {...props}><circle cx="6" cy="6" r="2" /><circle cx="18" cy="6" r="2" /><circle cx="6" cy="18" r="2" /><path d="M8 6h8M6 8v8M8 18h7a3 3 0 0 0 3-3v-1" /></Icon>
export const PlayIcon = (props: IconProps) => <Icon {...props}><path d="m8 5 11 7-11 7z" /></Icon>
export const ShieldIcon = (props: IconProps) => <Icon {...props}><path d="M12 3 4.5 6v5c0 4.8 3 8.2 7.5 10 4.5-1.8 7.5-5.2 7.5-10V6z" /><path d="m9.5 12 1.7 1.7 3.7-4" /></Icon>
export const ChartIcon = (props: IconProps) => <Icon {...props}><path d="M5 20V10M12 20V4M19 20v-7M3 20h18" /></Icon>
export const SettingsIcon = (props: IconProps) => <Icon {...props}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.6v-.2h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z" /></Icon>
export const HelpIcon = (props: IconProps) => <Icon {...props}><circle cx="12" cy="12" r="9" /><path d="M9.8 9a2.4 2.4 0 1 1 3.6 2.1c-.9.5-1.4 1-1.4 2.2M12 17h.01" /></Icon>
export const FilterIcon = (props: IconProps) => <Icon {...props}><path d="M4 6h16M7 12h10M10 18h4" /></Icon>
export const DisplayIcon = (props: IconProps) => <Icon {...props}><path d="M4 7h8M16 7h4M4 17h4M12 17h8" /><circle cx="14" cy="7" r="2" /><circle cx="10" cy="17" r="2" /></Icon>
export const ChevronIcon = (props: IconProps) => <Icon {...props}><path d="m8 10 4 4 4-4" /></Icon>
export const RefreshIcon = (props: IconProps) => <Icon {...props}><path d="M20 7v5h-5M4 17v-5h5" /><path d="M18.2 9A7 7 0 0 0 6.1 6.1L4 8M5.8 15A7 7 0 0 0 17.9 17.9L20 16" /></Icon>
export const PauseIcon = (props: IconProps) => <Icon {...props}><path d="M8 5v14M16 5v14" /></Icon>
export const MoreIcon = (props: IconProps) => <Icon {...props}><circle cx="5" cy="12" r="1" fill="currentColor" stroke="none" /><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" /><circle cx="19" cy="12" r="1" fill="currentColor" stroke="none" /></Icon>
export const CloseIcon = (props: IconProps) => <Icon {...props}><path d="m6 6 12 12M18 6 6 18" /></Icon>
export const ExternalIcon = (props: IconProps) => <Icon {...props}><path d="M14 4h6v6M20 4l-9 9" /><path d="M18 13v6H5V6h6" /></Icon>
export const CopyIcon = (props: IconProps) => <Icon {...props}><rect x="8" y="8" width="11" height="11" rx="2" /><path d="M16 8V5H5v11h3" /></Icon>
export const StopIcon = (props: IconProps) => <Icon {...props}><rect x="7" y="7" width="10" height="10" rx="1" fill="currentColor" stroke="none" /></Icon>
export const PlusIcon = (props: IconProps) => <Icon {...props}><path d="M12 5v14M5 12h14" /></Icon>
export const EditIcon = (props: IconProps) => <Icon {...props}><path d="m4 16-.8 4 4-.8L18.5 7.9a2.1 2.1 0 0 0-3-3Z" /><path d="m14 6 4 4M3.2 20H9" /></Icon>
export const TrashIcon = (props: IconProps) => <Icon {...props}><path d="M4 7h16M9 7V4h6v3M6.5 7l.8 13h9.4l.8-13M10 11v5M14 11v5" /></Icon>

/** Compact blue whale-like product mark; clicking it returns to Harness. */
export function DeepSeekMark() {
  return (
    <svg className="dshd-brand-mark" width="38" height="30" viewBox="0 0 42 32" aria-hidden>
      <path fill="currentColor" d="M5 14.5c2.5-5.8 9.1-8.3 15.3-5.4 3-4.3 8-5.5 13.4-3.2-2.2.8-3.7 2.2-4.6 4.2 3.2.4 5.8 2.2 7.7 4.7-2.1-.9-4.1-.9-6.2-.1-.4 8.2-6.4 13.2-14.8 12.7C8.2 27 3.2 22.7 2 16.4c2.8 2 5.6 2.5 8.5 1.7A9.7 9.7 0 0 1 5 14.5Zm11.5 1.1c0 2.3 1.8 4.1 4.1 4.1s4.1-1.8 4.1-4.1h-8.2Z" />
      <circle cx="25.8" cy="11.8" r="1.2" fill="white" />
    </svg>
  )
}
