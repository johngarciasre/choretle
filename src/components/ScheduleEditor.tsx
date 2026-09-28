"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui";
import {
  Schedule,
  defaultSchedule,
  scheduleLabel,
} from "@/lib/schedule";

const DAYS_OF_WEEK = [
  { value: 0, label: "Sun" },
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
];

const WEEK_OPTIONS = [
  { value: 1, label: "1st" },
  { value: 2, label: "2nd" },
  { value: 3, label: "3rd" },
  { value: 4, label: "4th" },
  { value: 5, label: "Last" },
];

interface ScheduleEditorProps {
  value?: Schedule | null;
  onChange: (schedule: Schedule) => void;
  className?: string;
}

export function ScheduleEditor({ value, onChange, className }: ScheduleEditorProps) {
  const [type, setType] = useState<Schedule["type"]>(value?.type || "weekly");
  const [daysOfWeek, setDaysOfWeek] = useState<number[]>(value?.daysOfWeek || [1]);
  const [interval, setInterval] = useState(value?.interval || 1);
  const [monthDays, setMonthDays] = useState<number[]>(value?.monthDays || [1]);
  const [weekOfMonth, setWeekOfMonth] = useState(value?.weekOfMonth || 1);
  const [dayOfWeek, setDayOfWeek] = useState(value?.dayOfWeek ?? 1);

  useEffect(() => {
    if (!value) return;
    setType(value.type);
    if (value.daysOfWeek) setDaysOfWeek(value.daysOfWeek);
    if (value.interval !== undefined) setInterval(value.interval);
    if (value.monthDays) setMonthDays(value.monthDays);
    if (value.weekOfMonth !== undefined) setWeekOfMonth(value.weekOfMonth);
    if (value.dayOfWeek !== undefined) setDayOfWeek(value.dayOfWeek);
  }, [value]);

  const emit = () => {
    const schedule: Schedule = {
      type,
      daysOfWeek,
      interval,
      monthDays,
      weekOfMonth,
      dayOfWeek,
    };
    onChange(schedule);
  };

  const toggleDay = (day: number) => {
    const next = daysOfWeek.includes(day)
      ? daysOfWeek.filter((d) => d !== day)
      : [...daysOfWeek, day].sort();
    setDaysOfWeek(next);
    onChange({ type, daysOfWeek: next, interval, monthDays, weekOfMonth, dayOfWeek });
  };

  const toggleMonthDay = (day: number) => {
    const next = monthDays.includes(day)
      ? monthDays.filter((d) => d !== day)
      : [...monthDays, day].sort((a, b) => a - b);
    setMonthDays(next);
    onChange({ type, daysOfWeek, interval, monthDays: next, weekOfMonth, dayOfWeek });
  };

  const isEveryDay = daysOfWeek.length === 7;
  const toggleEveryDay = () => {
    if (isEveryDay) {
      setDaysOfWeek([]);
      onChange({ type, daysOfWeek: [], interval, monthDays, weekOfMonth, dayOfWeek });
    } else {
      setDaysOfWeek([0, 1, 2, 3, 4, 5, 6]);
      onChange({ type, daysOfWeek: [0, 1, 2, 3, 4, 5, 6], interval, monthDays, weekOfMonth, dayOfWeek });
    }
  };

  return (
    <div className={`space-y-3 ${className || ""}`}>
      {/* Frequency type selector */}
      <div>
        <label className="block text-sm font-bold text-ink mb-1">Schedule Type</label>
        <div className="flex gap-2">
          {(["weekly", "monthly-day", "monthly-week-pattern"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setType(t)}
              className={`px-3 py-1.5 rounded-lg text-sm font-bold transition-colors ${
                type === t
                  ? "bg-coral text-white"
                  : "bg-white border-2 border-ink/15 hover:border-grape/30 text-ink"
              }`}
            >
              {t === "weekly" ? "Weekly" : t === "monthly-day" ? "Day of Month" : "Week Pattern"}
            </button>
          ))}
        </div>
      </div>

      {/* Preview label */}
      <p className="text-sm text-ink/60 italic">
        {scheduleLabel({ type, daysOfWeek, interval, monthDays, weekOfMonth, dayOfWeek })}
      </p>

      {/* Weekly options */}
      {type === "weekly" && (
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-bold text-ink mb-1">Days of Week</label>
            <div className="flex flex-wrap gap-1.5">
              {DAYS_OF_WEEK.map((day) => (
                <button
                  key={day.value}
                  type="button"
                  onClick={() => toggleDay(day.value)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-bold transition-colors ${
                    daysOfWeek.includes(day.value)
                      ? "bg-grape text-white"
                      : "bg-white border-2 border-ink/10 hover:border-grape/30 text-ink"
                  }`}
                >
                  {day.label}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={toggleEveryDay}
              className={`mt-2 px-3 py-1.5 rounded-lg text-sm font-bold transition-colors ${
                isEveryDay
                  ? "bg-grape text-white"
                  : "bg-white border-2 border-ink/10 hover:border-grape/30 text-ink"
              }`}
            >
              Every Day
            </button>
          </div>
          <div>
            <label htmlFor="weekly-interval" className="block text-sm font-bold text-ink mb-1">
              Every
            </label>
            <select
              id="weekly-interval"
              value={interval}
              onChange={(e) => {
                const v = Number(e.target.value);
                setInterval(v);
                onChange({ type, daysOfWeek, interval: v, monthDays, weekOfMonth, dayOfWeek });
              }}
              className="px-3 py-1.5 rounded-lg border-2 border-ink/15 bg-white text-ink focus:border-grape focus:outline-none"
            >
              {[1, 2, 3, 4].map((n) => (
                <option key={n} value={n}>
                  {n === 1 ? "week" : `${n} weeks`}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      {/* Monthly day options */}
      {type === "monthly-day" && (
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-bold text-ink mb-1">Days of Month</label>
            <div className="flex flex-wrap gap-1.5">
              {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => (
                <button
                  key={day}
                  type="button"
                  onClick={() => toggleMonthDay(day)}
                  className={`w-7 h-7 rounded-lg text-sm font-bold transition-colors ${
                    monthDays.includes(day)
                      ? "bg-red/80 text-white"
                      : "bg-white border-2 border-ink/10 hover:border-grape/30 text-ink"
                  }`}
                >
                  {day}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label htmlFor="monthly-interval" className="block text-sm font-bold text-ink mb-1">
              Every
            </label>
            <select
              id="monthly-interval"
              value={interval}
              onChange={(e) => {
                const v = Number(e.target.value);
                setInterval(v);
                onChange({ type, daysOfWeek, interval: v, monthDays, weekOfMonth, dayOfWeek });
              }}
              className="px-3 py-1.5 rounded-lg border-2 border-ink/15 bg-white text-ink focus:border-grape focus:outline-none"
            >
              {[1, 2, 3, 4, 6].map((n) => (
                <option key={n} value={n}>
                  {n === 1 ? "month" : `${n} months`}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      {/* Monthly week pattern options */}
      {type === "monthly-week-pattern" && (
        <div className="space-y-3">
          <div className="flex gap-3 items-center">
            <div>
              <label htmlFor="wp-week" className="block text-sm font-bold text-ink mb-1">Week</label>
              <select
                id="wp-week"
                value={weekOfMonth}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  setWeekOfMonth(v);
                  onChange({ type, daysOfWeek, interval, monthDays, weekOfMonth: v, dayOfWeek });
                }}
                className="px-3 py-1.5 rounded-lg border-2 border-ink/15 bg-white text-ink focus:border-grape focus:outline-none"
              >
                {WEEK_OPTIONS.map((w) => (
                  <option key={w.value} value={w.value}>{w.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="wp-day" className="block text-sm font-bold text-ink mb-1">Day</label>
              <select
                id="wp-day"
                value={dayOfWeek}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  setDayOfWeek(v);
                  onChange({ type, daysOfWeek, interval, monthDays, weekOfMonth, dayOfWeek: v });
                }}
                className="px-3 py-1.5 rounded-lg border-2 border-ink/15 bg-white text-ink focus:border-grape focus:outline-none"
              >
                {DAYS_OF_WEEK.map((d) => (
                  <option key={d.value} value={d.value}>{d.label}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label htmlFor="wp-interval" className="block text-sm font-bold text-ink mb-1">
              Every
            </label>
            <select
              id="wp-interval"
              value={interval}
              onChange={(e) => {
                const v = Number(e.target.value);
                setInterval(v);
                onChange({ type, daysOfWeek, interval: v, monthDays, weekOfMonth, dayOfWeek });
              }}
              className="px-3 py-1.5 rounded-lg border-2 border-ink/15 bg-white text-ink focus:border-grape focus:outline-none"
            >
              {[1, 2, 3, 4, 6].map((n) => (
                <option key={n} value={n}>
                  {n === 1 ? "month" : `${n} months`}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}
    </div>
  );
}
