export type Point = { t: number; v: Record<string, number | null> };
export type Trend = 'rising' | 'falling' | 'steady';
export type Level = 'Low' | 'Medium' | 'High';
export type SensorAnalysis = {
  key: string;
  label: string;
  unit: string;
  color: string;
  current: number | null;
  peak: number | null;
  avg: number | null;
  series: (number | null)[];
  level: number | null;
  levelWord: Level | null;
  trend: Trend;
};

export type ChartLine = {
  key: string;
  color: string;
  values: (number | null)[];
};

export type IconProps = { size?: number; color?: string; strokeWidth?: number };
