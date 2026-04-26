export type Service = "ETS" | "Intercity" | "Komuter" | "ShuttleTebrau";

export const classifyRoute = (route: {
  routeId: string;
  routeShortName: string;
  routeLongName: string;
}): Service => {
  const id = route.routeId.toUpperCase();
  const long = route.routeLongName.toUpperCase();
  if (id.startsWith("ETS")) return "ETS";
  if (id.startsWith("KOM")) return "Komuter";
  if (id.startsWith("STT") || long.includes("SHUTTLE TEBRAU")) return "ShuttleTebrau";
  return "Intercity";
};
