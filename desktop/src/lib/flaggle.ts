import { COUNTRIES } from "./countries";
import type { CountryFact } from "./countries";

const flagUrls = import.meta.glob("../assets/flags/*.svg", { query: "?url", import: "default", eager: true }) as Record<string, string>;
const MAX_GUESSES = 7;
const FIRST_PUZZLE_DATE = "2026-01-01";
const FLAG_WIDTH = 240;
const FLAG_HEIGHT = 180;
const COLOR_TOLERANCE = 52;

function hashString(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function daysSinceFirstPuzzle(dateStr: string): number {
  const start = new Date(`${FIRST_PUZZLE_DATE}T00:00:00Z`).getTime();
  const target = new Date(`${dateStr}T00:00:00Z`).getTime();
  if (!Number.isFinite(target)) return 0;
  return Math.max(0, Math.floor((target - start) / 86400000));
}

function normalizeCountryName(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function flagPath(country: CountryFact) {
  return `../assets/flags/${country.iso2.toLowerCase()}.svg`;
}

function colorDistance(a: [number, number, number], b: [number, number, number]) {
  const dr = a[0] - b[0];
  const dg = a[1] - b[1];
  const db = a[2] - b[2];
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

function quantize(value: number) {
  return Math.round(value / 16) * 16;
}

async function imageFromSrc(src: string): Promise<HTMLImageElement> {
  const image = new Image();
  image.decoding = "async";
  image.src = src;
  await image.decode();
  return image;
}

async function flagUrlToImageData(src: string) {
  const canvas = document.createElement("canvas");
  canvas.width = FLAG_WIDTH;
  canvas.height = FLAG_HEIGHT;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Could not render flag.");
  const image = await imageFromSrc(src);
  context.clearRect(0, 0, FLAG_WIDTH, FLAG_HEIGHT);
  context.drawImage(image, 0, 0, FLAG_WIDTH, FLAG_HEIGHT);
  return { canvas, context, data: context.getImageData(0, 0, FLAG_WIDTH, FLAG_HEIGHT) };
}

function buildTargetPalette(data: ImageData) {
  const seen = new Set<string>();
  const palette: [number, number, number][] = [];
  for (let i = 0; i < data.data.length; i += 4) {
    if (data.data[i + 3] < 128) continue;
    const color: [number, number, number] = [quantize(data.data[i]), quantize(data.data[i + 1]), quantize(data.data[i + 2])];
    const key = color.join(",");
    if (seen.has(key)) continue;
    seen.add(key);
    palette.push(color);
  }
  return palette;
}

function colorMatchesPalette(color: [number, number, number], palette: [number, number, number][]) {
  return palette.some((target) => colorDistance(color, target) <= COLOR_TOLERANCE);
}

export function makeFlaggleSeedSalt() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function getFlaggleAnswerForDate(dateStr: string, seedSalt: string): string {
  const order = COUNTRIES.map((country, index) => ({ country, sort: hashString(`${seedSalt}:${country.code}:${index}`) }))
    .sort((a, b) => a.sort - b.sort)
    .map((item) => item.country.name);
  return order[daysSinceFirstPuzzle(dateStr) % order.length];
}

export function getFlagglePuzzleId(dateStr: string, seedSalt: string) {
  return `${dateStr}:${hashString(seedSalt).toString(36)}`;
}

export function findFlaggleCountry(value: string): CountryFact | null {
  const normalized = normalizeCountryName(value);
  return COUNTRIES.find((country) => normalizeCountryName(country.name) === normalized) ?? null;
}

export function filterFlaggleCountries(query: string): readonly CountryFact[] {
  const normalized = normalizeCountryName(query);
  if (!normalized) return COUNTRIES;
  return COUNTRIES.filter((country) => normalizeCountryName(country.name).includes(normalized));
}

export function getFlagImageSrc(countryName: string) {
  const country = findFlaggleCountry(countryName);
  if (!country) return "";
  return flagUrls[flagPath(country)] ?? "";
}

export async function maskFlagByTargetColors(guessName: string, answerName: string) {
  const guess = findFlaggleCountry(guessName);
  const answer = findFlaggleCountry(answerName);
  if (!guess || !answer) throw new Error("Country not found.");
  const guessUrl = flagUrls[flagPath(guess)];
  const answerUrl = flagUrls[flagPath(answer)];
  if (!guessUrl || !answerUrl) throw new Error("Flag asset not found.");

  const [guessRender, answerRender] = await Promise.all([flagUrlToImageData(guessUrl), flagUrlToImageData(answerUrl)]);
  const palette = buildTargetPalette(answerRender.data);
  const output = new ImageData(new Uint8ClampedArray(guessRender.data.data), FLAG_WIDTH, FLAG_HEIGHT);
  let visible = 0;
  let matched = 0;

  for (let i = 0; i < output.data.length; i += 4) {
    if (output.data[i + 3] < 128) continue;
    visible++;
    const color: [number, number, number] = [output.data[i], output.data[i + 1], output.data[i + 2]];
    if (colorMatchesPalette(color, palette)) {
      matched++;
      continue;
    }
    output.data[i] = 25;
    output.data[i + 1] = 25;
    output.data[i + 2] = 25;
  }

  guessRender.context.putImageData(output, 0, 0);
  return {
    maskedFlagDataUrl: guessRender.canvas.toDataURL("image/png"),
    similarity: visible > 0 ? Math.round((matched / visible) * 1000) / 10 : 0,
  };
}

export const FLAGGLE_MAX_GUESSES = MAX_GUESSES;
export const FLAGGLE_COUNTRY_COUNT = COUNTRIES.length;
