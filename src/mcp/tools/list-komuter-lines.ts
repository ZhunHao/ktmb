import { z } from "zod";
import type { Ktmb } from "../../core/index.js";
import { mcpJson } from "./_shared.js";

export const ListKomuterLinesInput = z.object({});
export type ListKomuterLinesArgs = z.infer<typeof ListKomuterLinesInput>;

export const listKomuterLinesHandler =
  (ktmb: Ktmb) =>
  async (_args: ListKomuterLinesArgs) =>
    mcpJson(ktmb.komuter.listLines());
