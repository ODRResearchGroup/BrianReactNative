import { useEffect, useRef } from 'react';
import { BufferedInfluxWriter } from '../services/influx/buffer';
import { InfluxClient } from '../services/influx/client';
import { InfluxConfig, InfluxPoint } from '../services/influx/types';

export const useInflux = (config: InfluxConfig) => {
  const clientRef = useRef(new InfluxClient(config));
  const writerRef = useRef(new BufferedInfluxWriter(clientRef.current));

  useEffect(() => {
    const writer = writerRef.current;
    writer.start();
    return () => writer.stop();
  }, []);

  const write = (point: InfluxPoint) => writerRef.current.enqueue(point);
  const flush = () => writerRef.current.flush();

  return { write, flush };
};
