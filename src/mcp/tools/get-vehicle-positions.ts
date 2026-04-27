import { z } from "zod";
import type { Ktmb } from "../../core/index.js";

export const GetVehiclePositionsInput = z.object({
  routeId: z.string().optional(),
});
export type GetVehiclePositionsArgs = z.infer<typeof GetVehiclePositionsInput>;

export const getVehiclePositionsHandler =
  (ktmb: Ktmb) =>
  async (args: GetVehiclePositionsArgs) => {
    const r = await ktmb.realtime.getPositions(args.routeId ? { routeId: args.routeId } : {});
    return { content: [{ type: "text" as const, text: JSON.stringify(r) }], isError: !r.ok };
  };
