// Gerador UUIDv7 (RFC 9562) monotônico para ordenação temporal em `id DESC` sem depender do PG 18+.
import { randomBytes } from "node:crypto";

let lastTimestampMs = 0;
let sequenceCounter = 0;

export function newUuidV7(nowMs: number = Date.now()): string {
  const bytes = randomBytes(16);
  const ts = Math.max(nowMs, lastTimestampMs);
  if (ts === lastTimestampMs) {
    sequenceCounter = (sequenceCounter + 1) & 0x0fff;
    if (sequenceCounter === 0) {
      // Avança 1 ms virtual caso exceda 4096 ids dentro do mesmo milissegundo.
      lastTimestampMs = ts + 1;
    }
  } else {
    lastTimestampMs = ts;
    const randSeq = randomBytes(2);
    sequenceCounter = (((randSeq[0] ?? 0) & 0x03) << 8) | (randSeq[1] ?? 0);
  }

  const effectiveTs = lastTimestampMs;
  const tsHex = effectiveTs.toString(16).padStart(12, "0");
  for (let i = 0; i < 6; i++) {
    bytes[i] = Number.parseInt(tsHex.slice(i * 2, i * 2 + 2), 16);
  }

  // Versão 7 (0111) + 12 bits monotônicos (rand_a)
  bytes[6] = 0x70 | ((sequenceCounter >>> 8) & 0x0f);
  bytes[7] = sequenceCounter & 0xff;

  // Variante RFC 4122/9562 (10xxxxxx)
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;

  const hex = Buffer.from(bytes).toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}
