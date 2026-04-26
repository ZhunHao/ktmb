import { z } from "zod";

// EXPECTED KTMB SHAPE (post-capture). Adjust property names here to match the
// real wire format learned in Task 11. This is the *only* place that knows
// about KTMB's wire shape.
export const KtmbAvailabilityResponseSchema = z.object({
  classes: z.array(
    z.object({
      name: z.string(),
      price: z.number(),
      currency: z.string(),
      seats: z.number().nullable().optional(),
    }),
  ),
});
export type KtmbAvailabilityResponse = z.infer<typeof KtmbAvailabilityResponseSchema>;
