import type { ReactNode } from 'react';
import { Tab, TabGroup, TabList, TabPanel, TabPanels } from '@headlessui/react';
import { cn } from './cn.ts';

export type TabItem = {
  id: string;
  label: ReactNode;
  icon?: ReactNode;
  /** A count or a status after the label. */
  badge?: ReactNode;
  content: ReactNode;
  disabled?: boolean;
};

type TabsProps = {
  tabs: TabItem[];
  /** Controlled: the index shown. Leave it out and the tabs keep their own. */
  selectedIndex?: number;
  defaultIndex?: number;
  onChange?: (index: number) => void;
  /** underline: sections of a card. segmented: a switch between two or three views. */
  variant?: 'underline' | 'segmented';
  /** The accessible name of the tab list. */
  label?: string;
  className?: string;
  panelClassName?: string;
};

const LIST = {
  underline: 'flex gap-5 overflow-x-auto border-b border-border',
  segmented: 'inline-flex max-w-full gap-1 overflow-x-auto rounded-lg border border-border bg-surface p-1',
};

const TAB = {
  underline:
    'relative flex h-10 shrink-0 items-center gap-2 text-sm font-medium whitespace-nowrap text-muted transition-colors duration-120 data-hover:text-text data-selected:text-text data-disabled:cursor-not-allowed data-disabled:opacity-45 after:absolute after:inset-x-0 after:-bottom-px after:h-0.5 after:rounded-full after:bg-transparent data-selected:after:bg-accent',
  segmented:
    'flex h-8 shrink-0 items-center gap-2 rounded-md border border-transparent px-3 text-sm font-medium whitespace-nowrap text-muted transition-colors duration-120 data-hover:text-text data-selected:border-border-strong data-selected:bg-surface-3 data-selected:text-text data-disabled:cursor-not-allowed data-disabled:opacity-45',
};

/** Arrows move between tabs, Home and End jump, and each panel is labelled by its tab. */
export function Tabs({ tabs, selectedIndex, defaultIndex, onChange, variant = 'underline', label, className, panelClassName }: TabsProps) {
  return (
    <TabGroup data-ui="tabs" selectedIndex={selectedIndex} defaultIndex={defaultIndex} onChange={onChange} className={cn('flex min-w-0 flex-col', className)}>
      <TabList aria-label={label} className={LIST[variant]}>
        {tabs.map(tab => (
          <Tab key={tab.id} disabled={tab.disabled} className={TAB[variant]}>
            {tab.icon && <span className="flex [&>svg]:size-4">{tab.icon}</span>}
            {tab.label}
            {tab.badge !== undefined && <span className="rounded-full bg-text/6 px-1.5 text-xs leading-5 text-muted nums">{tab.badge}</span>}
          </Tab>
        ))}
      </TabList>
      <TabPanels className={cn(variant === 'underline' ? 'pt-4' : 'pt-3', panelClassName)}>
        {tabs.map(tab => (
          <TabPanel key={tab.id} className="rounded-md focus-visible:outline-offset-4">
            {tab.content}
          </TabPanel>
        ))}
      </TabPanels>
    </TabGroup>
  );
}
