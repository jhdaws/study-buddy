"use client";

/**
 * "Blocked students" on /profile (US-22): the signed-in student's own
 * blocks, each with Unblock. The only place a block can be undone besides
 * the roster it was made from -- listMyBlocks() (src/lib/blocks.ts) is the
 * only reader of this list; nobody but the blocker can ever see it.
 */

import { useActionState } from "react";

import { unblockUser, type BlockActionState } from "@/app/blocks/actions";
import { BUTTON_SECONDARY, FORM_ERROR, PANEL, SECTION_TITLE } from "@/components/ui/styles";
import type { BlockedUser } from "@/lib/blocks";
import { formatInitial } from "@/lib/format";

const NOTHING_YET: BlockActionState = {};

function UnblockRow({ userId, displayName }: BlockedUser) {
  const [state, unblock, pending] = useActionState(unblockUser.bind(null, userId), NOTHING_YET);
  const name = displayName ?? "A student";

  return (
    <li className="flex min-h-12 items-center gap-3 py-2">
      <span
        aria-hidden
        className="grid size-9 shrink-0 place-items-center rounded-full bg-paper text-sm font-bold text-ink"
      >
        {formatInitial(displayName)}
      </span>
      <span className="min-w-0 flex-1 truncate text-[15px] font-semibold text-ink">{name}</span>
      <form action={unblock}>
        <button type="submit" disabled={pending} className={`${BUTTON_SECONDARY} shrink-0 px-3`}>
          {pending ? "Unblocking…" : "Unblock"}
        </button>
      </form>
      {state.error && (
        <p role="alert" className={`${FORM_ERROR} basis-full`}>
          {state.error}
        </p>
      )}
    </li>
  );
}

export default function BlockedStudentsList({ blocks }: { blocks: BlockedUser[] }) {
  if (blocks.length === 0) return null;

  return (
    <section aria-labelledby="blocked-students-heading" className="mt-8">
      <h2 id="blocked-students-heading" className={`${SECTION_TITLE} mb-2`}>
        Blocked students
      </h2>
      <p className="mb-2 text-sm text-ink-2">
        They can&apos;t join sessions you host, and you won&apos;t see sessions or study
        requests from them. They are never told they&apos;re blocked.
      </p>
      <ul className={`${PANEL} divide-y divide-line px-4`}>
        {blocks.map((block) => (
          <UnblockRow key={block.userId} {...block} />
        ))}
      </ul>
    </section>
  );
}
