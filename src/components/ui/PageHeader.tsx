/**
 * Every page's header (2026-10-20 redesign): a 26px title, an optional line
 * beneath it, the page's one primary action on the right, and view tabs under
 * it when the page has views. Phones stack the button full width under the
 * title.
 */

import Link from "next/link";

import Icon, { type IconName } from "@/components/ui/Icon";
import { BUTTON_PRIMARY, PAGE_LEAD, PAGE_TITLE } from "@/components/ui/styles";

export type PageTab = { key: string; label: string; icon?: IconName };

export default function PageHeader({
  title,
  lead,
  action,
  tabs,
}: {
  title: React.ReactNode;
  lead?: React.ReactNode;
  action?: { href: string; label: string };
  tabs?: React.ReactNode;
}) {
  return (
    <div className="mb-4">
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
        <div className="flex min-w-0 flex-[1_1_320px] flex-col gap-1.5">
          <h1 className={PAGE_TITLE}>{title}</h1>
          {lead && <p className={PAGE_LEAD}>{lead}</p>}
        </div>
        {action && (
          <Link href={action.href} className={`${BUTTON_PRIMARY} w-full sm:w-auto`}>
            <Icon name="plus" />
            {action.label}
          </Link>
        )}
      </div>
      {tabs}
    </div>
  );
}

/** The view tabs row: underlined current tab, frosted strip. */
export function ViewTabs<T extends string>({
  tabs,
  current,
  onChange,
  label,
}: {
  tabs: { key: T; label: string; icon?: IconName }[];
  current: T;
  onChange: (key: T) => void;
  label: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={label}
      className="glass mt-4 flex gap-5 overflow-x-auto rounded-[10px] px-3 shadow-[inset_0_-1px_0_#E6E8EC] [scrollbar-width:none]"
    >
      {tabs.map((tab) => {
        const on = tab.key === current;
        return (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onChange(tab.key)}
            className={`flex h-11 shrink-0 items-center gap-1.5 border-b-2 px-0.5 text-sm whitespace-nowrap lg:h-10 ${
              on ? "border-accent font-medium text-ink" : "border-transparent text-ink-2 hover:text-ink"
            }`}
          >
            {tab.icon && <Icon name={tab.icon} />}
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
