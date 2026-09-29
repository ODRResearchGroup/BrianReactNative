export type TagSet = Record<string, string>;
export type FieldSet = Record<string, string | number | boolean>;

export interface InfluxPoint {
  measurement: string;
  tags?: TagSet;
  fields: FieldSet;
  timestamp?: number; // nanoseconds; defaults to now
}

export interface InfluxConfig {
  url: string;
  token: string;
  org: string;
  timeseriesBucket: string;
  fingerprintsBucket: string;
}
