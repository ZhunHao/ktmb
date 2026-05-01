export type Service = "ETS" | "Intercity" | "Komuter" | "ShuttleTebrau";

export interface RouteLike {
  routeId: string;
  routeShortName: string;
  routeLongName: string;
  routeType?: number;
}

export const classifyRoute = (route: RouteLike): Service => {
  const id = route.routeId.toUpperCase();
  const long = route.routeLongName.toUpperCase();
  const short = route.routeShortName.toUpperCase();

  if (route.routeType === 0) return "Komuter";

  if (id === "ETS" || short === "ETS" || long.includes("ELECTRIC TRAIN SERVICE")) {
    return "ETS";
  }

  if (id === "ST" || long.includes("SHUTTLE TEBRAU")) {
    return "ShuttleTebrau";
  }

  return "Intercity";
};
