"use client";

/** My sessions' two tabs, Upcoming and Past, each a list of session cards. */

import Link from "next/link";
import { useState } from "react";

import SessionCard from "@/components/SessionCard";
import { ViewTabs } from "@/components/ui/PageHeader";
import type { MySession } from "@/lib/sessions";

export default function MySessionsTabs({
  upcoming,
  past,
  now,
  viewerId,
}: {
  upcoming: MySession[];
  past: MySession[];
  now: Date;
  viewerId: string;
}) {
  const [tab, setTab] = useState<"upcoming" | "past">("upcoming");
  const list = tab === "upcoming" ? upcoming : past;
  return (
    <>
      <ViewTabs
        label="My sessions"
        tabs={[
          { key: "upcoming", label: `Upcoming${upcoming.length ? ` (${upcoming.length})` : ""}` },
          { key: "past", label: "Past" },
        ]}
        current={tab}
        onChange={setTab}
      />
      <div className="mt-4 max-w-[720px]">
        {list.length === 0 ? (
          <div className="rounded-xl border border-line bg-white px-6 py-10 text-center">
            <p className="text-[15px] font-semibold text-ink">
              {tab === "upcoming" ? "Nothing coming up" : "No past sessions yet"}
            </p>
            <p className="mt-1 text-sm text-ink-body">
              {tab === "upcoming" ? (
                <>
                  <Link href="/sessions" className="font-medium text-accent hover:underline">
                    Find a session
                  </Link>{" "}
                  to join, or{" "}
                  <Link href="/sessions/new" className="font-medium text-accent hover:underline">
                    host one
                  </Link>
                  .
                </>
              ) : (
                "Sessions you went to or hosted show up here."
              )}
            </p>
          </div>
        ) : (
          <ul className="flex flex-col gap-3">
            {list.map((session) => (
              <li key={session.id}>
                <SessionCard session={session} now={now} viewerId={viewerId} showDay relationFirst />
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
