import { strToU8, zipSync } from "fflate";

export const buildMiniFeed = (): Uint8Array => {
  const files: Record<string, Uint8Array> = {
    "agency.txt": strToU8(
      "agency_id,agency_name,agency_url,agency_timezone\nKTMB,KTMB,https://www.ktmb.com.my,Asia/Kuala_Lumpur\n",
    ),
    "routes.txt": strToU8(
      [
        "route_id,agency_id,route_short_name,route_long_name,route_type",
        "ETS-N,KTMB,EG,ETS Northbound,2",
        "KOM-PK,KTMB,KP,Komuter Port Klang,2",
        "INT-EKW,KTMB,EW,Ekspres Rakyat Timuran,2",
        "STT,KTMB,ST,Shuttle Tebrau,2",
      ].join("\n") + "\n",
    ),
    "stops.txt": strToU8(
      [
        "stop_id,stop_name,stop_lat,stop_lon",
        "KUL,KL Sentral,3.1339,101.6864",
        "BTW,Butterworth,5.4143,100.3666",
        "JBS,JB Sentral,1.4631,103.7708",
        "WCQ,Woodlands CIQ,1.4470,103.7710",
        "TPT,Tumpat,6.2014,102.1714",
        "PKG,Port Klang,2.9990,101.3997",
      ].join("\n") + "\n",
    ),
    "calendar.txt": strToU8(
      [
        "service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date",
        "WD,1,1,1,1,1,0,0,20260101,20261231",
      ].join("\n") + "\n",
    ),
    "trips.txt": strToU8(
      [
        "route_id,service_id,trip_id,trip_headsign",
        "ETS-N,WD,EG9322,Butterworth",
        "INT-EKW,WD,EW27,Tumpat",
        "STT,WD,ST101,Woodlands CIQ",
        "KOM-PK,WD,K2412,Port Klang",
      ].join("\n") + "\n",
    ),
    "stop_times.txt": strToU8(
      [
        "trip_id,arrival_time,departure_time,stop_id,stop_sequence",
        "EG9322,08:00:00,08:00:00,KUL,1",
        "EG9322,13:00:00,13:00:00,BTW,2",
        "EW27,20:00:00,20:00:00,JBS,1",
        "EW27,31:30:00,31:30:00,TPT,2",
        "ST101,08:00:00,08:00:00,JBS,1",
        "ST101,08:05:00,08:05:00,WCQ,2",
        "K2412,07:30:00,07:30:00,KUL,1",
        "K2412,08:30:00,08:30:00,PKG,2",
      ].join("\n") + "\n",
    ),
  };
  return zipSync(files);
};
