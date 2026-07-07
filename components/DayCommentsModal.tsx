"use client";

import { dayLabel } from "@/lib/time";
import DayComments from "@/components/DayComments";

export default function DayCommentsModal({
  day,
  currentUserId,
  names,
  onClose,
  onRead,
}: {
  day: string;
  currentUserId: string;
  names: Record<string, string>;
  onClose: () => void;
  onRead?: (day: string) => void;
}) {
  const { weekday, date } = dayLabel(day);
  return (
    <div
      className="fixed inset-0 z-30 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="pb-safe max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white p-4 shadow-xl dark:bg-neutral-900 sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-semibold">
            {weekday} <span className="text-neutral-400">{date}</span>
          </h3>
          <button onClick={onClose} className="text-sm text-neutral-400">
            Close
          </button>
        </div>
        <DayComments day={day} currentUserId={currentUserId} names={names} onRead={onRead} />
      </div>
    </div>
  );
}
