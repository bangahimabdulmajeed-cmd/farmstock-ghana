/**
 * Crop taxonomy shared by the server, the client and the database schema.
 *
 * This module must stay free of server-only imports (drizzle, node builtins)
 * because the browser bundle imports it directly.
 */
export const CROP_TYPES = [
  "maize",
  "cocoa",
  "cassava",
  "plantain",
  "rice",
  "tomato",
  "pepper",
  "groundnut",
  "shea",
  "other",
] as const;

export type CropType = (typeof CROP_TYPES)[number];

export const CROP_LABELS: Record<CropType, string> = {
  maize: "Maize",
  cocoa: "Cocoa",
  cassava: "Cassava",
  plantain: "Plantain",
  rice: "Rice",
  tomato: "Tomato",
  pepper: "Pepper",
  groundnut: "Groundnut",
  shea: "Shea",
  other: "Other",
};
