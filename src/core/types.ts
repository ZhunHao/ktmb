import { z } from "zod";

const Iso8601MyT = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+08:00$/, "must be ISO 8601 with +08:00 offset");

export const StationSchema = z.object({
  code: z.string().min(1),
  nameEn: z.string().min(1),
  nameMs: z.string().min(1),
  country: z.enum(["MY", "SG", "TH"]),
  lines: z.array(z.enum(["ETS", "Intercity", "Komuter", "ShuttleTebrau"])).optional(),
});
export type Station = z.infer<typeof StationSchema>;

export const StopSchema = z.object({
  stationCode: z.string().min(1),
  arrival: Iso8601MyT.nullable(),
  departure: Iso8601MyT.nullable(),
});
export type Stop = z.infer<typeof StopSchema>;

export const FareSchema = z.object({
  className: z.string().min(1),
  priceMinor: z.number().int().nonnegative(),
  currency: z.enum(["MYR", "SGD"]),
  seatsLeft: z.number().int().nonnegative().nullable(),
});
export type Fare = z.infer<typeof FareSchema>;

export const TrainClassSchema = z.object({
  className: z.string().min(1),
  fare: FareSchema,
});
export type TrainClass = z.infer<typeof TrainClassSchema>;

export const TrainScheduleSchema = z.object({
  trainNo: z.string().min(1),
  service: z.enum(["ETS", "Intercity", "ShuttleTebrau"]),
  bookingProvider: z.string().min(1),
  from: StopSchema,
  to: StopSchema,
  intermediate: z.array(StopSchema).optional(),
  classes: z.array(TrainClassSchema),
  journeyDurationMinutes: z.number().int().nonnegative(),
});
export type TrainSchedule = z.infer<typeof TrainScheduleSchema>;

export const KomuterDepartureSchema = z.object({
  trainNo: z.string().min(1),
  line: z.string().min(1),
  departure: Iso8601MyT,
  platform: z.string().optional(),
});
export type KomuterDeparture = z.infer<typeof KomuterDepartureSchema>;

export const VehiclePositionSchema = z.object({
  vehicleId: z.string().min(1),
  tripId: z.string().optional(),
  routeId: z.string().optional(),
  lat: z.number().finite(),
  lon: z.number().finite(),
  bearing: z.number().finite().optional(),
  speedKmh: z.number().finite().nonnegative().optional(),
  timestamp: Iso8601MyT,
});
export type VehiclePosition = z.infer<typeof VehiclePositionSchema>;
