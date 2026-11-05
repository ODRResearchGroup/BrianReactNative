import React, { memo, useMemo } from 'react';
import type { SensorRecord } from '../../services/database/db';
import { recordToValues } from '../../sensorRecords';
import CustomRadarChart, { gasSeries } from './CustomRadarChart';

export default memo(function RecordRadar({
  record,
  size = 56,
}: {
  record: SensorRecord;
  size?: number;
}) {
  const data = useMemo(
    () =>
      gasSeries(
        record.id,
        record.title || 'Fingerprint',
        recordToValues(record),
      ),
    [record],
  );
  return <CustomRadarChart variant="compact" size={size} data={data} />;
});
