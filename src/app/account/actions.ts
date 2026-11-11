"use server";

// Server action for deleting an account (US-24). Owner: P2.
//
// A "use server" file may export only async functions (and types). This one
// is a public POST endpoint: it authenticates and validates every time, and
// it takes NOTHING from the form that says whose account to delete -- the
// account is always the caller's own, from requireUser().
//
// What a deletion does is the database's job (ADR 0008 rule 5,
// *_delete_account.sql): deleting the auth user cascades to the profile and
// the roster rows, sets host_id to null on hosted sessions ("Deleted user"),
// and -- through the trigger that migration adds, in the same transaction --
// cancels the hosted sessions that have not ended. A hard delete
// (shouldSoftDelete false, the default): a soft-deleted auth user keeps its
// row, so none of that would happen.
//
// The auth user can only be deleted with the secret key (ADR 0010), through
// createAdminClient() -- the only use of it besides location writes.

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { ACCOUNT_DELETED_PATH } from "@/lib/account";
import { DELETE_ACCOUNT_FAILED_MESSAGE, deleteAccountErrorMessage } from "@/lib/errors";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient, requireUser } from "@/lib/supabase/server";
import {
  deleteAccountSchema,
  invalidFormState,
  type DeleteAccountField,
  type FormState,
} from "@/lib/validation";

/** What deleteAccount() hands back when it does not redirect. Start from `{}`. */
export type DeleteAccountState = FormState<DeleteAccountField>;

/**
 * Delete the signed-in student's account and their data, sign them out, and
 * go home with a confirmation. The form's only field is the `confirm`
 * checkbox (deleteAccountSchema).
 */
export async function deleteAccount(
  _prev: DeleteAccountState,
  formData: FormData,
): Promise<DeleteAccountState> {
  // Signed out (or nameless, or without a password yet): redirected away.
  const user = await requireUser();

  const parsed = deleteAccountSchema.safeParse({ confirm: formData.get("confirm") ?? undefined });
  if (!parsed.success) {
    return invalidFormState(parsed.error, formData);
  }

  try {
    const { error } = await createAdminClient().auth.admin.deleteUser(user.id);
    // Already gone -- a second tap, or another tab -- is what was asked for.
    if (error && error.code !== "user_not_found") {
      console.error("deleteAccount: deleteUser failed", { status: error.status, code: error.code });
      return { formError: deleteAccountErrorMessage(error) };
    }
  } catch (thrown) {
    // E.g. SUPABASE_SECRET_KEY missing from this deployment (env.ts).
    console.error("deleteAccount: could not call the admin API", {
      message: thrown instanceof Error ? thrown.message : String(thrown),
    });
    return { formError: DELETE_ACCOUNT_FAILED_MESSAGE };
  }

  // The account is gone; clear this device's session cookies too. Supabase
  // answers the sign-out of a deleted user with a 404, which auth-js treats
  // as signed out -- so a failure here changes nothing worth telling them.
  try {
    const supabase = await createClient();
    await supabase.auth.signOut({ scope: "local" });
  } catch (thrown) {
    console.error("deleteAccount: sign-out after deletion failed", {
      message: thrown instanceof Error ? thrown.message : String(thrown),
    });
  }

  revalidatePath("/", "layout");
  redirect(ACCOUNT_DELETED_PATH);
}
