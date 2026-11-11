/**
 * N1/US-17: the phone tab bar's Sessions badge needs the signed-in student's
 * count of new sessions, so it can no longer be the static component layout.tsx
 * renders directly. Reads the session the same way SiteHeader's <Account>
 * and SiteSidebar's <SidebarAccount> do -- its own async Server Component,
 * inside its own <Suspense> in layout.tsx, so the rest of the page does not
 * wait on it.
 */

import TabBar from "@/components/TabBar";
import { countNewSessionsInMyCourses } from "@/lib/course-notifications";
import { createClient } from "@/lib/supabase/server";

export default async function TabBarWithBadge() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Signed out, or the count failed: no badge, never a reason to break
  // navigation.
  const newSessionsCount = user ? await countNewSessionsInMyCourses().catch(() => 0) : 0;

  return <TabBar newSessionsCount={newSessionsCount} />;
}
