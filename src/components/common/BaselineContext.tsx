import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SensorReadings } from '../../types/fingerprintTypes';

export type BaselineData = {
  readings: SensorReadings;
  timestamp: string;
};

type BaselineContextType = {
  baseline: BaselineData | null;
  hasBaseline: boolean;
  saveBaseline: (readings: SensorReadings) => Promise<void>;
  clearBaseline: () => Promise<void>;
  getDelta: (currentReadings: SensorReadings) => SensorReadings;
};

const BaselineContext = createContext<BaselineContextType | undefined>(
  undefined,
);

const BASELINE_KEY = 'sensor_baseline_active';

export const BaselineProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [baseline, setBaseline] = useState<BaselineData | null>(null);

  // Load baseline on mount
  useEffect(() => {
    loadBaseline();
  }, []);

  const loadBaseline = async () => {
    try {
      const stored = await AsyncStorage.getItem(BASELINE_KEY);
      if (stored) {
        setBaseline(JSON.parse(stored));
      }
    } catch (err) {
      console.error('Failed to load baseline:', err);
    }
  };

  const saveBaseline = async (readings: SensorReadings) => {
    try {
      const baselineData: BaselineData = {
        readings,
        timestamp: new Date().toISOString(),
      };
      await AsyncStorage.setItem(BASELINE_KEY, JSON.stringify(baselineData));
      setBaseline(baselineData);
    } catch (err) {
      console.error('Failed to save baseline:', err);
      throw err;
    }
  };

  const clearBaseline = async () => {
    try {
      await AsyncStorage.removeItem(BASELINE_KEY);
      setBaseline(null);
    } catch (err) {
      console.error('Failed to clear baseline:', err);
      throw err;
    }
  };

  // Calculate delta from baseline
  const getDelta = (currentReadings: SensorReadings): SensorReadings => {
    if (!baseline) {
      return currentReadings; // No baseline, return raw
    }

    const subtract = (
      current: number | null | undefined,
      base: number | null | undefined,
    ): number | null => {
      if (typeof current !== 'number' || typeof base !== 'number') {
        return null;
      }
      return current - base;
    };

    return {
      CH4: subtract(currentReadings.CH4, baseline.readings.CH4),
      NH3: subtract(currentReadings.NH3, baseline.readings.NH3),
      HCHO: subtract(currentReadings.HCHO, baseline.readings.HCHO),
      VOC: subtract(currentReadings.VOC, baseline.readings.VOC),
      Odour: subtract(currentReadings.Odour, baseline.readings.Odour),
      H2S: subtract(currentReadings.H2S, baseline.readings.H2S),
      Etoh: subtract(currentReadings.Etoh, baseline.readings.Etoh),
      NO2: subtract(currentReadings.NO2, baseline.readings.NO2),
    };
  };

  return (
    <BaselineContext.Provider
      value={{
        baseline,
        hasBaseline: baseline !== null,
        saveBaseline,
        clearBaseline,
        getDelta,
      }}>
      {children}
    </BaselineContext.Provider>
  );
};

export const useBaseline = () => {
  const context = useContext(BaselineContext);
  if (!context) {
    throw new Error('useBaseline must be used within BaselineProvider');
  }
  return context;
};
