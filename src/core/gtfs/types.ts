export type Agency = {
  agencyId: string;
  agencyName: string;
  agencyTimezone: string;
};

export type Route = {
  routeId: string;
  agencyId: string;
  routeShortName: string;
  routeLongName: string;
  routeType: number;
};

export type GtfsStop = {
  stopId: string;
  stopName: string;
  lat: number | null;
  lon: number | null;
};

export type Calendar = {
  serviceId: string;
  days: readonly [
    sunday: boolean,
    monday: boolean,
    tuesday: boolean,
    wednesday: boolean,
    thursday: boolean,
    friday: boolean,
    saturday: boolean,
  ];
  startDate: string;
  endDate: string;
};

export type Trip = {
  routeId: string;
  serviceId: string;
  tripId: string;
  tripHeadsign: string;
};

export type StopTime = {
  tripId: string;
  arrivalTime: string;
  departureTime: string;
  stopId: string;
  stopSequence: number;
};

export type StaticFeed = {
  agencies: Agency[];
  routes: Route[];
  stops: GtfsStop[];
  calendar: Calendar[];
  trips: Trip[];
  stopTimes: StopTime[];
};
