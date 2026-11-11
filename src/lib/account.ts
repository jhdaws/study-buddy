// Where a student lands after deleting their account (US-24), and how the
// home page knows to say so. Pure and client-safe; a "use server" file may
// not export constants, so they live here.

/** deleteAccount() redirects here once the account is gone. */
export const ACCOUNT_DELETED_PATH = "/?account=deleted";

/** True when the home page's search params carry ACCOUNT_DELETED_PATH's flag. */
export function isAccountDeletedNotice(
  searchParams: Record<string, string | string[] | undefined>,
): boolean {
  const value = searchParams.account;
  return (Array.isArray(value) ? value[0] : value) === "deleted";
}
