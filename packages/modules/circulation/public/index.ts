// Exportações públicas do módulo Circulação (tipos e adaptadores de integração para a composição).
export {
  DEFAULT_SECRETARIA_RECORDS,
  InMemoryAcademicRegistry,
  type RawSecretariaRecord,
} from "../infrastructure/academic-translator.ts";
export {
  ConformistCalendarClient,
  generateAcademicDaysRange,
  type RawCalendarioPayload,
} from "../infrastructure/calendar-client.ts";
export type { CirculationDeps } from "../slices/shared.ts";
export type { AcademicRegistryPort, SchoolCalendarPort } from "../domain/ports.ts";
export { type ClockPort, FixedClock, SystemClock } from "../domain/value-objects.ts";
