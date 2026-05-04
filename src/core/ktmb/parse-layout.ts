import type { Result } from "../result.js";
import { err, ok } from "../result.js";

export const isOkuSeatType = (code: string | null | undefined): boolean =>
  code != null && /OKU/i.test(code);

export type LayoutClass = {
  className: string;       // e.g. "Business", "Standard"
  priceMinor: number;      // min price across tiers, MYR cents
  seatsLeft: number;       // OKU-excluded count
  seatsLeftIncludesPriority: false;
};

export type ParsedLayout = {
  trainNo: string;
  serviceCategory: string;
  currency: "MYR" | "SGD";
  classes: LayoutClass[];
  okuSeatsAvailable: number;
};

type RawSeat = {
  Status: string;
  Price: number;
  SeatType: string | null;
  SeatTypeName: string | null;
  ServiceType: string | null;
};
type RawCoach = {
  CoachLabel: string;
  Seats: RawSeat[];
};

export const parseLayout = (body: string): Result<ParsedLayout> => {
  let envelope: {
    Status: boolean;
    MessageCode?: string | null;
    Data?: {
      TrainNo: string;
      ServiceCategory: string;
      Currency: string;
      Coaches: RawCoach[];
    };
  };
  try {
    envelope = JSON.parse(body);
  } catch (e) {
    return err("parse_error", "layout body not JSON", e);
  }
  if (!envelope.Status || !envelope.Data) {
    return err(
      "parse_error",
      `KITS rejected layout (messageCode=${envelope.MessageCode ?? "null"})`,
    );
  }
  const data = envelope.Data;
  const currency = data.Currency === "SGD" ? "SGD" : "MYR";

  // Group available seats by ServiceType (Business/Standard/...). Track min
  // price per group. Skip OKU. Skip rows with no ServiceType or zero Price
  // (filler/blocked seats KITS leaves in the grid).
  const groups = new Map<string, { minPriceMinor: number; seats: number }>();
  let oku = 0;
  for (const coach of data.Coaches) {
    for (const seat of coach.Seats) {
      const priorityFlagged =
        isOkuSeatType(seat.SeatType) || isOkuSeatType(seat.SeatTypeName);
      if (seat.Status !== "1") continue;
      if (priorityFlagged) {
        oku++;
        continue;
      }
      if (!seat.ServiceType || !seat.Price) continue;
      const key = seat.ServiceType;
      const priceMinor = Math.round(seat.Price * 100);
      const cur = groups.get(key);
      if (cur) {
        cur.seats += 1;
        if (priceMinor < cur.minPriceMinor) cur.minPriceMinor = priceMinor;
      } else {
        groups.set(key, { minPriceMinor: priceMinor, seats: 1 });
      }
    }
  }

  const classes: LayoutClass[] = [...groups.entries()]
    .map(([name, v]) => ({
      className: name,
      priceMinor: v.minPriceMinor,
      seatsLeft: v.seats,
      seatsLeftIncludesPriority: false as const,
    }))
    .sort((a, b) => a.priceMinor - b.priceMinor);

  return ok({
    trainNo: data.TrainNo,
    serviceCategory: data.ServiceCategory,
    currency,
    classes,
    okuSeatsAvailable: oku,
  });
};
