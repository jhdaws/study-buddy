/**
 * A live preview of the session being created, drawn as the same timetable
 * row it will be in the list (SessionCard), so the host sees what classmates
 * will see. Fed by CreateSessionForm from the form's current values; fields
 * not filled in yet show as placeholders. Display only -- nothing here is
 * submitted, and the whole figure is aria-hidden: it repeats what the fields
 * already say, and a screen reader should not read the form twice.
 */

import { formatCampusDay, formatSeatsLeft, formatStartTime } from "@/lib/format";

export type PreviewValues = {
  departmentCode: string;
  courseNumber: string;
  topic: string;
  locationLabel: string;
  room: string;
  /** ISO instants, or "" while the time is incomplete. */
  startsAt: string;
  endsAt: string;
  capacity: string;
};

export const EMPTY_PREVIEW: PreviewValues = {
  departmentCode: "",
  courseNumber: "",
  topic: "",
  locationLabel: "",
  room: "",
  startsAt: "",
  endsAt: "",
  capacity: "",
};

const PLACEHOLDER = "text-ink-2/70";

export default function SessionPreview({ values, now }: { values: PreviewValues; now: Date }) {
  const course = [values.departmentCode.trim().toUpperCase(), values.courseNumber.trim().toUpperCase()]
    .filter(Boolean)
    .join(" ");
  const validTimes =
    values.startsAt !== "" &&
    values.endsAt !== "" &&
    !Number.isNaN(Date.parse(values.startsAt)) &&
    !Number.isNaN(Date.parse(values.endsAt)) &&
    Date.parse(values.endsAt) > Date.parse(values.startsAt);
  const capacity = Number.parseInt(values.capacity, 10);
  const hasCapacity = Number.isFinite(capacity) && capacity >= 2;

  return (
    <figure aria-hidden className="m-0">
      <figcaption className="mb-2 text-sm font-semibold text-ink-2">How it will look</figcaption>
      <div className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-x-4 rounded-2xl border border-line bg-white px-4 py-4">
        <div className="pt-0.5">
          {validTimes ? (
            <>
              <p className="text-xs font-semibold text-ink-2">
                {formatCampusDay(new Date(values.startsAt), now)}
              </p>
              <p className="text-[15px] leading-tight font-bold text-ink tabular-nums">
                {formatStartTime(values.startsAt)}
              </p>
              <p className="mt-0.5 text-xs text-ink-2">to {formatStartTime(values.endsAt)}</p>
            </>
          ) : (
            <p className={`text-[15px] font-bold ${PLACEHOLDER}`}>Time</p>
          )}
        </div>
        <div className="min-w-0">
          <div className="flex items-start justify-between gap-3">
            <p className="text-[15px] leading-snug font-bold">
              {course ? <span className="text-ink">{course}</span> : <span className={PLACEHOLDER}>Course</span>}
            </p>
            {hasCapacity && (
              <span className="shrink-0 text-sm font-semibold text-seat">
                {formatSeatsLeft(capacity - 1)}
              </span>
            )}
          </div>
          <p className="mt-0.5 text-[15px] leading-snug text-ink">
            {values.topic.trim() || <span className={PLACEHOLDER}>What you&apos;re studying</span>}
          </p>
          <p className="mt-1.5 text-sm text-ink-2">
            {values.locationLabel.trim() ? (
              <>
                {values.locationLabel.trim()}
                {values.room.trim() && <>, {values.room.trim()}</>}
              </>
            ) : (
              <span className={PLACEHOLDER}>Place</span>
            )}
          </p>
          <p className="mt-0.5 text-sm text-ink-2">
            Hosted by <span className="text-ink">you</span>
          </p>
        </div>
      </div>
    </figure>
  );
}
