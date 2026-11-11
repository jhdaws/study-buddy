"use client";

/**
 * One roster entry's Block/Unblock button (US-22), beside Report. Posts to
 * blockUser()/unblockUser() (src/app/blocks/actions.ts) with
 * `useActionState`, the same pattern Join/Leave use. Its own component, not
 * inline in <SessionRoster>'s map, because each needs its own hook state --
 * two attendees cannot share one `useActionState` call.
 *
 * No confirmation step, like Leave: blocking is reversible (Unblock, here or
 * on /profile) and the database refuses only self-block, so there is nothing
 * destructive enough to ask twice about.
 */

import { useActionState } from "react";

import { blockUser, unblockUser, type BlockActionState } from "@/app/blocks/actions";
import { FORM_ERROR } from "@/components/ui/styles";

export type BlockButtonProps = {
  userId: string;
  /** As the roster shows it; null for a profile with no name yet. */
  displayName: string | null;
  isBlocked: boolean;
};

const NOTHING_YET: BlockActionState = {};

export default function BlockButton({ userId, displayName, isBlocked }: BlockButtonProps) {
  const [blockState, block, blocking] = useActionState(blockUser.bind(null, userId), NOTHING_YET);
  const [unblockState, unblock, unblocking] = useActionState(
    unblockUser.bind(null, userId),
    NOTHING_YET,
  );

  const error = isBlocked ? unblockState.error : blockState.error;
  const pending = blocking || unblocking;
  const name = displayName ?? "this student";

  return (
    <>
      <form action={isBlocked ? unblock : block}>
        <button
          type="submit"
          disabled={pending}
          aria-label={`${isBlocked ? "Unblock" : "Block"} ${name}`}
          className="inline-flex min-h-11 shrink-0 items-center rounded-lg px-2 text-sm font-semibold text-ink-2 hover:bg-paper hover:text-danger-on-light disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isBlocked ? (unblocking ? "Unblocking…" : "Unblock") : blocking ? "Blocking…" : "Block"}
        </button>
      </form>
      {error && (
        <p role="alert" className={`${FORM_ERROR} mt-1`}>
          {error}
        </p>
      )}
    </>
  );
}
