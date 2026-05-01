import { z } from "zod";

const ISO_8601_MYT = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})\+08:00$/;

const Iso8601MyT = z
  .string()
  .regex(ISO_8601_MYT, "must be ISO 8601 with +08:00 offset")
  .refine((s) => {
    const m = ISO_8601_MYT.exec(s);
    if (!m) return false;
    const [, y, mo, d, h, mi, se] = m;
    const year = Number(y);
    const month = Number(mo);
    const day = Number(d);
    const hour = Number(h);
    const minute = Number(mi);
    const second = Number(se);
    if (month < 1 || month > 12) return false;
    if (day < 1 || day > 31) return false;
    if (hour > 23 || minute > 59 || second > 59) return false;
    const dt = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
    return (
      dt.getUTCFullYear() === year &&
      dt.getUTCMonth() === month - 1 &&
      dt.getUTCDate() === day &&
      dt.getUTCHours() === hour &&
      dt.getUTCMinutes() === minute &&
      dt.getUTCSeconds() === second
    );
  }, "calendar-invalid date/time");

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
});
export type KomuterDeparture = z.infer<typeof KomuterDepartureSchema>;

export type CalendarWindow = {
  startDate: string;
  endDate: string;
};

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
