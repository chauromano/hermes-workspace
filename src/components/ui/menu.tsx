'use client'

import { Menu } from '@base-ui/react/menu'
import { cn } from '@/lib/utils'

type MenuRootProps = React.ComponentProps<typeof Menu.Root>

function MenuRoot({ children, ...props }: MenuRootProps) {
  return <Menu.Root {...props}>{children}</Menu.Root>
}

type MenuTriggerProps = React.ComponentProps<typeof Menu.Trigger>

function MenuTrigger({ className, ...props }: MenuTriggerProps) {
  return <Menu.Trigger className={cn(className)} {...props} />
}

type MenuContentProps = {
  className?: string
  side?: 'top' | 'bottom' | 'left' | 'right'
  align?: 'start' | 'center' | 'end'
  children: React.ReactNode
}

function MenuContent({
  className,
  side = 'bottom',
  align = 'end',
  children,
}: MenuContentProps) {
  return (
    <Menu.Portal>
      <Menu.Positioner side={side} align={align}>
        <Menu.Popup
          className={cn(
            'min-w-[110px] rounded-lg p-1 text-sm shadow-lg',
            className,
          )}
          style={{
            background: 'var(--theme-card)',
            color: 'var(--theme-text)',
            border: '1px solid var(--theme-border)',
            boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            opacity: 1,
            zIndex: 9999,
          }}
        >
          {children}
        </Menu.Popup>
      </Menu.Positioner>
    </Menu.Portal>
  )
}

type MenuItemProps = React.ComponentProps<typeof Menu.Item>

function MenuItem({ className, ...props }: MenuItemProps) {
  return (
    <Menu.Item
      className={cn(
        'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm select-none font-[450]',
        className,
      )}
      style={{
        color: 'var(--theme-text)',
      }}
      onMouseEnter={(e) => {
        ;(e.currentTarget as HTMLElement).style.background =
          'var(--theme-card2)'
      }}
      onMouseLeave={(e) => {
        ;(e.currentTarget as HTMLElement).style.background = 'transparent'
      }}
      {...props}
    />
  )
}

type MenuSubmenuRootProps = React.ComponentProps<typeof Menu.SubmenuRoot>

function MenuSubmenuRoot({ children, ...props }: MenuSubmenuRootProps) {
  return <Menu.SubmenuRoot {...props}>{children}</Menu.SubmenuRoot>
}

type MenuSubmenuTriggerProps = React.ComponentProps<typeof Menu.SubmenuTrigger>

function MenuSubmenuTrigger({ className, ...props }: MenuSubmenuTriggerProps) {
  return (
    <Menu.SubmenuTrigger
      className={cn(
        'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm select-none font-[450] cursor-pointer',
        className,
      )}
      style={{
        color: 'var(--theme-text)',
      }}
      onMouseEnter={(e) => {
        ;(e.currentTarget as HTMLElement).style.background =
          'var(--theme-card2)'
      }}
      onMouseLeave={(e) => {
        ;(e.currentTarget as HTMLElement).style.background = 'transparent'
      }}
      {...props}
    />
  )
}

function MenuSubmenuContent({
  className,
  side = 'right',
  align = 'start',
  children,
}: MenuContentProps) {
  return (
    <Menu.Portal>
      <Menu.Positioner side={side} align={align}>
        <Menu.Popup
          className={cn(
            'min-w-[140px] rounded-lg p-1 text-sm shadow-lg',
            className,
          )}
          style={{
            background: 'var(--theme-card)',
            color: 'var(--theme-text)',
            border: '1px solid var(--theme-border)',
            boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            opacity: 1,
            zIndex: 10000,
          }}
        >
          {children}
        </Menu.Popup>
      </Menu.Positioner>
    </Menu.Portal>
  )
}

function MenuSeparator({ className }: { className?: string }) {
  return (
    <div
      role="separator"
      className={cn(
        'my-1 h-px bg-primary-200/60 dark:bg-neutral-800/80',
        className,
      )}
    />
  )
}

export {
  MenuRoot,
  MenuTrigger,
  MenuContent,
  MenuItem,
  MenuSeparator,
  MenuSubmenuRoot,
  MenuSubmenuTrigger,
  MenuSubmenuContent,
}
