"use client";

/**
 * In-session group chat (US-05), under the roster on the session page. C1.
 *
 * The page decides what the viewer gets -- chatAccess() in src/lib/chat.ts --
 * and passes the transcript in as props (listMessages(), src/lib/messages.ts):
 *
 *   - "hidden": not on the roster. A prompt to join, and no transcript: the
 *     page never loads one for them, and the database would return nothing
 *     if it tried (US-05b).
 *   - "open": the transcript and a send form.
 *   - "closed": the transcript, read-only (cancelled, or a week past the
 *     end; ADR 0008 rule 4).
 *
 * Live, like the roster: while the chat is open it listens for new messages
 * (subscribeToChat(), src/lib/live-roster.ts) and calls router.refresh(), so
 * what is shown is always what the database returned -- never a hand-applied
 * payload, so the sender's own message cannot appear twice. sendMessage()
 * revalidates the page for the sender without waiting for the event.
 *
 * Accessibility: the transcript is role="log" with aria-live="polite", so a
 * screen reader announces new messages without moving focus. Enter sends and
 * Shift+Enter is a new line; on a phone the Send button does it. The message
 * box is text-base so iOS does not zoom (ADR 0004).
 *
 * Times are formatted against `now` from the server render, so the server
 * and the browser print the same "Today"/"Yesterday".
 */

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useId, useRef, type KeyboardEvent } from "react";

import { sendMessage, type SendMessageState } from "@/app/sessions/actions";
import { BUTTON_PRIMARY, FIELD_ERROR, FORM_ERROR, PANEL, SECTION_TITLE } from "@/components/ui/styles";
import type { ChatAccess, ChatMessage } from "@/lib/chat";
import { formatMessageTime } from "@/lib/format";
import { CHAT_MESSAGE_MAX_LENGTH } from "@/lib/limits";
import { subscribeToChat } from "@/lib/live-roster";
import { createClient } from "@/lib/supabase/client";

export type SessionChatProps = {
  sessionId: string;
  viewerId: string;
  access: ChatAccess;
  /** Oldest first. Empty, and unused, when `access` is "hidden". */
  messages: ChatMessage[];
  /** The server render's clock, as an ISO instant. */
  now: string;
  /** For "hidden": whether the viewer could join right now (a seat is free). */
  joinable?: boolean;
  /** useActionState's starting state. `{}` on the page; tests pass others. */
  initialState?: SendMessageState;
};

export default function SessionChat({
  sessionId,
  viewerId,
  access,
  messages,
  now,
  joinable = false,
  initialState = {},
}: SessionChatProps) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(
    sendMessage.bind(null, sessionId),
    initialState,
  );
  const ids = { heading: useId(), body: useId(), error: useId() };
  const transcript = useRef<HTMLOListElement>(null);

  const open = access === "open";
  useEffect(() => {
    if (!open) return;
    return subscribeToChat(createClient(), sessionId, () => router.refresh());
  }, [open, sessionId, router]);

  // Keep the newest message in view as they arrive.
  const newest = messages.at(-1)?.id;
  useEffect(() => {
    const list = transcript.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [newest]);

  const bodyError = state.fieldErrors?.body?.[0];
  const error = bodyError ?? state.formError;

  const sendOnEnter = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    event.currentTarget.form?.requestSubmit();
  };

  return (
    <section aria-labelledby={ids.heading} className={`${PANEL} px-4 py-5 sm:px-6`}>
      <h2 id={ids.heading} className={SECTION_TITLE}>
        Chat
      </h2>

      {access === "hidden" ? (
        <p className="mt-2 text-[15px] text-ink-2">
          {joinable
            ? "Join to see the chat."
            : "Only people going to this session can see its chat."}
        </p>
      ) : (
        <>
          <ol
            ref={transcript}
            role="log"
            aria-live="polite"
            aria-labelledby={ids.heading}
            className="mt-3 flex max-h-[min(60vh,480px)] flex-col gap-3 overflow-y-auto"
          >
            {messages.length === 0 && (
              <li className="text-[15px] text-ink-2">
                {open ? "No messages yet. Say hello to the group." : "Nobody posted in this chat."}
              </li>
            )}
            {messages.map((message) => {
              const mine = message.authorId === viewerId;
              const name =
                message.authorId === null ? "Deleted user" : (message.authorDisplayName ?? "A student");
              return (
                <li key={message.id} className={`flex flex-col ${mine ? "items-end" : "items-start"}`}>
                  <p className="text-sm text-ink-2">
                    <span className="font-semibold text-ink">{mine ? "You" : name}</span>
                    {" · "}
                    <time dateTime={message.createdAt}>
                      {formatMessageTime(message.createdAt, new Date(now))}
                    </time>
                  </p>
                  <p
                    className={`mt-0.5 max-w-[85%] rounded-xl px-3.5 py-2 text-[15px] break-words whitespace-pre-wrap ${
                      mine ? "bg-brand text-white" : "bg-paper text-ink"
                    }`}
                  >
                    {message.body}
                  </p>
                </li>
              );
            })}
          </ol>

          {open ? (
            <form action={formAction} noValidate className="mt-4 flex flex-col gap-2">
              <label htmlFor={ids.body} className="sr-only">
                Message
              </label>
              <div className="flex items-end gap-2">
                <textarea
                  id={ids.body}
                  name="body"
                  rows={2}
                  required
                  maxLength={CHAT_MESSAGE_MAX_LENGTH}
                  placeholder="Write a message"
                  defaultValue={state.values?.body ?? ""}
                  onKeyDown={sendOnEnter}
                  aria-invalid={error ? true : undefined}
                  aria-describedby={error ? ids.error : undefined}
                  className="block min-h-11 w-full flex-1 resize-none rounded-xl border border-field bg-white px-3.5 py-2.5 text-base text-ink placeholder:text-ink-2/80 focus:border-signal focus:ring-4 focus:ring-signal/15 focus:outline-none"
                />
                <button type="submit" disabled={pending} className={BUTTON_PRIMARY}>
                  {pending ? "Sending…" : "Send"}
                </button>
              </div>
              {error && (
                <p id={ids.error} role="alert" className={bodyError ? FIELD_ERROR : FORM_ERROR}>
                  {error}
                </p>
              )}
            </form>
          ) : (
            <p className="mt-4 rounded-xl bg-paper px-4 py-3 text-[15px] text-ink-2">
              This chat is read-only now.
            </p>
          )}
        </>
      )}
    </section>
  );
}
