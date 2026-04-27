import { z } from "zod";
import type { Ktmb } from "../../core/index.js";

export const ListKomuterLinesInput = z.object({});
export type ListKomuterLinesArgs = z.infer<typeof ListKomuterLinesInput>;

export const listKomuterLinesHandler =
  (ktmb: Ktmb) =>
  async (_args: ListKomuterLinesArgs) => {
    const r = ktmb.komuter.listLines();
    return { content: [{ type: "text" as const, text: JSON.stringify(r) }], isError: !r.ok };
  };
