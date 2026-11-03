import { Circle, Path } from 'react-native-svg';
import { IconProps } from '../../types';
import Icon from './Icon';

export default function ChevronUpIcon(p: IconProps) {
  return (
    <Icon {...p}>
      <Circle cx="12" cy="12" r="10" />
      <Path d="M12 6v6l4 2" />
    </Icon>
  );
}
