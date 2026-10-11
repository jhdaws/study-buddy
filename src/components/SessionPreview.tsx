/**
 * A live preview of the session being created, drawn like its card in the
 * list (SessionCard, spec page 8), so the host sees what classmates will
 * see. Fed by CreateSessionForm from the form's current values; fields not
 * filled in yet show as placeholders. Display only -- nothing here is
 * submitted, and the whole figure is aria-hidden: it repeats what the
 * fields already say, and a screen reader should not read the form twice.
 */

import Icon from "@/components/ui/Icon";
import { formatSessionTime } from "@/lib/format";

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

const PLACEHOLDER = "font-medium text-white/72 italic";

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
  const seats = Number.isFinite(capacity) && capacity >= 2 ? Math.min(capacity, 12) : 0;

  return (
    <figure aria-hidden className="m-0">
      <figcaption className="mb-2 flex items-center gap-2 px-1 text-sm font-extrabold tracking-wide text-navy-900 uppercase">
        <Icon name="sparkle" className="size-4" />
        Preview
      </figcaption>
      <div className="glass-dark rounded-card p-4 text-white">
        <div className="flex items-start justify-between gap-3">
          <p className="text-base leading-snug">
            {course ? <span className="font-extrabold">{course}</span> : <span className={PLACEHOLDER}>Course</span>}
          </p>
          {Number.isFinite(capacity) && capacity >= 2 && (
            <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-success/40 bg-success/15 px-3 py-1 text-sm font-bold text-success-on-dark">
              <Icon name="seat" className="size-4" />
              {capacity - 1 === 1 ? "1 seat left" : `${capacity - 1} seats left`}
            </span>
          )}
        </div>
        <p className="mt-2 text-xl leading-snug font-extrabold tracking-tight">
          {values.topic.trim() || <span className={PLACEHOLDER}>What you&apos;re studying</span>}
        </p>
        <dl className="mt-4 grid gap-3 rounded-inner border border-white/10 bg-white/[0.06] p-3.5 text-sm">
          <div>
            <dt className="text-xs font-bold tracking-wide text-white/72 uppercase">When</dt>
            <dd className="mt-0.5 font-semibold">
              {validTimes ? (
                formatSessionTime(values.startsAt, values.endsAt, now)
              ) : (
                <span className={PLACEHOLDER}>Pick a start and end</span>
              )}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-bold tracking-wide text-white/72 uppercase">Where</dt>
            <dd className="mt-0.5 font-semibold">
              {values.locationLabel.trim() ? (
                <>
                  {values.locationLabel.trim()}
                  {values.room.trim() && <> · {values.room.trim()}</>}
                </>
              ) : (
                <span className={PLACEHOLDER}>Pick a place</span>
              )}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-bold tracking-wide text-white/72 uppercase">Host</dt>
            <dd className="mt-0.5 font-semibold">You</dd>
          </div>
        </dl>
        {seats > 0 && (
          <div className="mt-4 flex items-center gap-3">
            <div className="flex flex-1 gap-1">
              {Array.from({ length: seats }, (_, i) => (
                <span
                  key={i}
                  className={`h-1.5 flex-1 rounded-full ${i === 0 ? "bg-blue-300" : "border border-success/60 bg-success/10"}`}
                />
              ))}
            </div>
            <span className="shrink-0 text-sm font-semibold text-white/80">1 of {capacity} going</span>
          </div>
        )}
      </div>
    </figure>
  );
}
