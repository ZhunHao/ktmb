import { z } from "zod";
import type { Ktmb } from "../../core/index.js";
import { mcpJson } from "./_shared.js";

export const GetVehiclePositionsInput = z.object({
  routeId: z.string().optional(),
});
export type GetVehiclePositionsArgs = z.infer<typeof GetVehiclePositionsInput>;

export const getVehiclePositionsHandler =
  (ktmb: Ktmb) =>
  async (args: GetVehiclePositionsArgs) =>
    mcpJson(await ktmb.realtime.getPositions(args.routeId ? { routeId: args.routeId } : {}));
