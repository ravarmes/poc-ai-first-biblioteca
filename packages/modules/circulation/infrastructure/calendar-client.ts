// Adaptador Conformista do Calendário Acadêmico (ADR-0006, ADR-0023): adota diretamente `dias_letivos`.
import { SchoolCalendar } from "../domain/calendar.ts";
import type { SchoolCalendarPort } from "../domain/ports.ts";

export interface RawCalendarioPayload {
  readonly dias_letivos: readonly string[];
}

const FIXED_NATIONAL_HOLIDAYS = new Set(["01-01", "04-21", "05-01", "09-07", "10-12", "11-02", "11-15", "11-20", "12-25"]);

export function generateAcademicDaysRange(startYear: number = 2025, endYear: number = 2028): string[] {
  const days: string[] = [];
  const start = Date.UTC(startYear, 0, 1);
  const end = Date.UTC(endYear, 11, 31);
  for (let ms = start; ms <= end; ms += 86_400_000) {
    const d = new Date(ms);
    const weekday = d.getUTCDay();
    if (weekday === 0 || weekday === 6) continue;
    const ymd = d.toISOString().slice(0, 10);
    if (FIXED_NATIONAL_HOLIDAYS.has(ymd.slice(5))) continue;
    days.push(ymd);
  }
  return days;
}

export class ConformistCalendarClient implements SchoolCalendarPort {
  #payload: RawCalendarioPayload;

  constructor(payload: RawCalendarioPayload = { dias_letivos: generateAcademicDaysRange() }) {
    this.#payload = payload;
  }

  replacePayload(payload: RawCalendarioPayload): void {
    this.#payload = payload;
  }

  async getCalendar(): Promise<SchoolCalendar> {
    return new SchoolCalendar(this.#payload.dias_letivos);
  }
}
