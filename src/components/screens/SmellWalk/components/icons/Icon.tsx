import Svg from 'react-native-svg';
import { IconProps } from '../../types';
import { COLORS } from '../../../../../consts';

export default function Icon({
  size = 20,
  color = COLORS.ink,
  strokeWidth = 2,
  children,
}: IconProps & { children: React.ReactNode }) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round">
      {children}
    </Svg>
  );
}
