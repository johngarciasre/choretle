// ─── Flexible Schedule Engine for Tasks & Slates ──────────────────────

/**
 * Days of week: 0=Sun, 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat
 */
const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export interface Schedule {
  type: "weekly" | "monthly-day" | "monthly-week-pattern";
  daysOfWeek?: number[]; // for weekly
  interval?: number; // every N periods (weeks or months)
  monthDays?: number[]; // for monthly-day: [1, 15]
  weekOfMonth?: number; // for monthly-week-pattern: 1-4, 5=last
  dayOfWeek?: number; // for monthly-week-pattern: 0-6
}

export interface ScheduleDate {
  date: Date;
  dayLabel: string;
}

// ─── Defaults & Helpers ──────────────────────────────────────────────

export function defaultSchedule(type: Schedule["type"] = "weekly"): Schedule {
  switch (type) {
    case "monthly-day":
      return { type: "monthly-day", monthDays: [1], interval: 1 };
    case "monthly-week-pattern":
      return { type: "monthly-week-pattern", weekOfMonth: 1, dayOfWeek: 1, interval: 1 };
    default:
      return { type: "weekly", daysOfWeek: [1], interval: 1 };
  }
}

export function scheduleLabel(s: Schedule): string {
  if (!s) return "";
  switch (s.type) {
    case "weekly": {
      const days = s.daysOfWeek || [1];
      if (days.length === 7) {
        const interval = s.interval || 1;
        return `Every day${interval > 1 ? ` every ${interval} weeks` : ""}`;
      }
      const dayNames = days.map((d) => DAY_NAMES[d]).join(", ");
      const interval = s.interval || 1;
      return `Every ${interval} week${interval > 1 ? "s" : ""} — ${dayNames}`;
    }
    case "monthly-day": {
      const days = (s.monthDays || [1]).map((d) => `${d}${ordinalSuffix(d)}`).join(", ");
      const interval = s.interval || 1;
      return `Every ${interval} month${interval > 1 ? "s" : ""} — ${days}`;
    }
    case "monthly-week-pattern": {
      const weekLabel = `${s.weekOfMonth || 1}${ordinalSuffix(s.weekOfMonth || 1)}`;
      const dayName = DAY_NAMES[s.dayOfWeek ?? 1];
      const interval = s.interval || 1;
      return `Every ${interval} month${interval > 1 ? "s" : ""} — ${weekLabel} ${dayName}`;
    }
  }
}

function ordinalSuffix(n: number): string {
  const suffixes = ["th", "st", "nd", "rd"];
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return "th";
  return suffixes[n % 10] || "th";
}

// ─── Legacy → Schedule conversion ────────────────────────────────────

/**
 * Convert legacy frequency + interval into a schedule object.
 */
export function legacyToSchedule(
  frequency: string,
  interval: number,
): Schedule | null {
  if (!frequency) return null;
  switch (frequency) {
    case "daily":
      return { type: "weekly", daysOfWeek: [1], interval };
    case "weekly":
      return { type: "weekly", daysOfWeek: [1], interval };
    case "biweekly":
      return { type: "weekly", daysOfWeek: [1], interval: 2 * (interval || 1) };
    case "monthly":
      return { type: "monthly-day", monthDays: [1], interval };
    default:
      return null;
  }
}

// ─── Date Expansion ──────────────────────────────────────────────────

/**
 * Expand a schedule into concrete dates between start and end.
 * Returns an array of { date, dayLabel } sorted chronologically.
 */
export function expandSchedule(
  schedule: Schedule | null | undefined,
  startDate: Date,
  endDate: Date,
): ScheduleDate[] {
  if (!schedule) return [];

  const results: ScheduleDate[] = [];
  const start = new Date(startDate);
  const end = new Date(endDate);

  switch (schedule.type) {
    case "weekly": {
      const days = schedule.daysOfWeek || [1];
      const interval = schedule.interval || 1;
      let cursor = new Date(start);
      // Align cursor to the first occurrence of any scheduled day
      while (cursor <= end) {
        if (days.includes(cursor.getDay())) {
          results.push({ date: new Date(cursor), dayLabel: DAY_NAMES[cursor.getDay()] });
          // Skip ahead by interval weeks, but land on the next scheduled day
          cursor.setDate(cursor.getDate() + 7 * interval);
          // Adjust to next occurrence of any scheduled day
          while (cursor <= end && !days.includes(cursor.getDay())) {
            cursor.setDate(cursor.getDate() + 1);
          }
        } else {
          cursor.setDate(cursor.getDate() + 1);
        }
      }
      break;
    }

    case "monthly-day": {
      const days = schedule.monthDays || [1];
      const interval = schedule.interval || 1;
      let year = start.getFullYear();
      let month = start.getMonth();

      while (true) {
        const cursor = new Date(year, month, 1);
        if (cursor > end) break;

        for (const day of days) {
          const d = new Date(year, month, day);
          if (d >= start && d <= end) {
            results.push({ date: d, dayLabel: `${day}${ordinalSuffix(day)}` });
          }
        }

        // Advance by interval months
        month += interval;
        while (month > 11) {
          month -= 12;
          year++;
        }
      }
      break;
    }

    case "monthly-week-pattern": {
      const weekOfMonth = schedule.weekOfMonth || 1;
      const dayOfWeek = schedule.dayOfWeek ?? 1;
      const interval = schedule.interval || 1;
      let year = start.getFullYear();
      let month = start.getMonth();

      while (true) {
        const firstDay = new Date(year, month, 1);
        if (firstDay > end) break;

        const targetWeek = getNthWeekOfMonth(year, month, weekOfMonth, dayOfWeek);
        if (targetWeek) {
          const d = new Date(targetWeek);
          if (d >= start && d <= end) {
            results.push({ date: d, dayLabel: `${DAY_NAMES[dayOfWeek]} (${weekOfMonth}${ordinalSuffix(weekOfMonth).replace(/\d/, "")} week)` });
          }
        }

        month += interval;
        while (month > 11) {
          month -= 12;
          year++;
        }
      }
      break;
    }
  }

  return results.sort((a, b) => a.date.getTime() - b.date.getTime());
}

/**
 * Get the date of the Nth occurrence of dayOfWeek in a month.
 * weekOfMonth: 1-4 for first-fourth, 5 for last.
 */
function getNthWeekOfMonth(
  year: number,
  month: number,
  weekOfMonth: number,
  dayOfWeek: number,
): Date | null {
  const firstDay = new Date(year, month, 1);
  const firstDow = firstDay.getDay();

  if (weekOfMonth >= 1 && weekOfMonth <= 4) {
    const offset = (weekOfMonth - 1) * 7;
    let candidate = firstDow + offset;
    // Find the actual date where dayOfWeek falls in this week
    let d = new Date(year, month, 1 + Math.max(0, dayOfWeek - firstDow + (weekOfMonth - 1) * 7));
    if (d.getMonth() === month && d.getDay() === dayOfWeek) return d;
    // Try adjusting
    const startOfTargetWeek = new Date(year, month, 1 + (weekOfMonth - 1) * 7);
    const diff = (dayOfWeek - startOfTargetWeek.getDay() + 7) % 7;
    d = new Date(startOfTargetWeek);
    d.setDate(d.getDate() + diff);
    return d.getMonth() === month ? d : null;
  }

  if (weekOfMonth === 5) {
    // Last occurrence: find the last day of month, then go backwards
    const lastDay = new Date(year, month + 1, 0);
    let d = new Date(lastDay);
    while (d.getDay() !== dayOfWeek) {
      d.setDate(d.getDate() - 1);
    }
    return d;
  }

  return null;
}

// ─── Single-date check ───────────────────────────────────────────────

/**
 * Check if a schedule matches a specific date.
 */
export function shouldGenerateOnDate(schedule: Schedule | null, date: Date): boolean {
  if (!schedule) return false;

  switch (schedule.type) {
    case "weekly": {
      const days = schedule.daysOfWeek || [1];
      const interval = schedule.interval || 1;
      if (!days.includes(date.getDay())) return false;
      // Check interval alignment: the date must be a multiple of interval weeks from a reference point
      // Use Jan 1 of the same year as reference
      const startOfYear = new Date(date.getFullYear(), 0, 1);
      const diffMs = date.getTime() - startOfYear.getTime();
      const diffWeeks = Math.round(diffMs / (7 * 24 * 60 * 60 * 1000));
      return diffWeeks % interval === 0;
    }

    case "monthly-day": {
      const days = schedule.monthDays || [1];
      if (!days.includes(date.getDate())) return false;
      const interval = schedule.interval || 1;
      const monthDiff = (date.getFullYear() - 2000) * 12 + date.getMonth();
      // Check that the month is aligned with interval starting from Jan 2000
      return monthDiff % interval === 0;
    }

    case "monthly-week-pattern": {
      const weekOfMonth = schedule.weekOfMonth || 1;
      const dayOfWeek = schedule.dayOfWeek ?? 1;
      const d = getNthWeekOfMonth(date.getFullYear(), date.getMonth(), weekOfMonth, dayOfWeek);
      if (!d) return false;
      if (d.getDate() !== date.getDate()) return false;
      const interval = schedule.interval || 1;
      const monthDiff = (date.getFullYear() - 2000) * 12 + date.getMonth();
      return monthDiff % interval === 0;
    }
  }

  return false;
}

// ─── Effective frequency days (for display in UI) ────────────────────

/**
 * Get the effective period span for a schedule. Used for display and legacy compatibility.
 */
export function getEffectiveDays(schedule: Schedule | null): number {
  if (!schedule) return 7;
  switch (schedule.type) {
    case "weekly":
      return 7 * (schedule.interval || 1);
    case "monthly-day":
      return 30 * (schedule.interval || 1);
    case "monthly-week-pattern":
      return 30 * (schedule.interval || 1);
  }
}
