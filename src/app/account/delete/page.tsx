/**
 * Delete my account (US-24): what deleting does, and the confirm step.
 * Linked from the account sheet (phones) and the desktop sidebar.
 *
 *   - `requireUser()` first, like every signed-in page; the proxy also sends
 *     signed-out visitors from /account/* to /login.
 *   - <DeleteAccountForm> posts to deleteAccount() (../actions.ts), which
 *     deletes the CALLER's account -- never one named by the form -- and
 *     redirects home with a confirmation.
 *
 * The list below must stay true to what the database does on delete (ADR
 * 0008 rule 5, *_delete_account.sql); tests/db/delete-account.test.ts checks
 * each line of it.
 */

import type { Metadata } from "next";

import DeleteAccountForm from "@/components/DeleteAccountForm";
import { PAGE_LEAD, PAGE_TITLE, PANEL, SECTION_TITLE } from "@/components/ui/styles";
import { requireUser } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Delete your account",
};

const LIST = "mt-2 flex list-disc flex-col gap-1.5 pl-5 text-[15px] text-ink";

export default async function DeleteAccountPage() {
  const user = await requireUser();

  return (
    <main className="min-w-0 lg:max-w-2xl">
      <h1 className={PAGE_TITLE}>Delete your account</h1>
      <p className={`${PAGE_LEAD} mb-6`}>
        {user.displayName}, this deletes your Study Buddy account and your data for good. It
        can&apos;t be undone.
      </p>

      <section aria-labelledby="deleted-heading" className={`${PANEL} px-4 py-5 sm:px-6`}>
        <h2 id="deleted-heading" className={SECTION_TITLE}>
          What&apos;s deleted
        </h2>
        <ul className={LIST}>
          <li>Your profile and display name.</li>
          <li>
            Your sign-in: your email address and password. Signing up again later starts a new,
            empty account.
          </li>
          <li>Your place on every session you joined, so your seats open up.</li>
          <li>
            Sessions you&apos;re hosting that haven&apos;t ended are cancelled, so anyone going
            sees they&apos;re off.
          </li>
        </ul>

        <h2 className={`${SECTION_TITLE} mt-5`}>What stays</h2>
        <ul className={LIST}>
          <li>
            Past sessions you hosted stay for the people who went, with the host shown as
            &ldquo;Deleted user&rdquo;.
          </li>
          <li>Courses and departments you added stay in the course list, without your name.</li>
        </ul>
      </section>

      <div className="mt-5">
        <DeleteAccountForm />
      </div>
    </main>
  );
}
