import * as cheerio from "cheerio";
import type { Result } from "../result.js";
import { err, ok } from "../result.js";

export type ParsedTripForm = {
  searchData: string;
  formValidationCode: string;
  requestVerificationToken: string;
};

export const parseTripForm = (html: string): Result<ParsedTripForm> => {
  const $ = cheerio.load(html);
  const sd = $("#SearchData").attr("value");
  const fvc = $("#FormValidationCode").attr("value");
  const rvt = $('input[name="__RequestVerificationToken"]').attr("value");
  if (!sd || !fvc || !rvt) {
    return err(
      "parse_error",
      `missing tokens on /Trip response (sd=${!!sd}, fvc=${!!fvc}, rvt=${!!rvt})`,
    );
  }
  return ok({
    searchData: sd,
    formValidationCode: fvc,
    requestVerificationToken: rvt,
  });
};
