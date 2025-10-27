import { ConnectionStatus } from '../../hooks/useRemoteConnection';
import { statusDotClass } from '../../utils/status';

import styles from './ConnectionIndicator.module.css';

interface ConnectionIndicatorProps {
  status: ConnectionStatus;
  statusLabel: string;
}

export const ConnectionIndicator = ({
  status,
  statusLabel,
}: ConnectionIndicatorProps) => {
  return (
    <div className={styles.connectionIdicatorStyled}>
      <span className={[styles.statusDot, styles[statusDotClass(status)]].join(' ')} />
      <span>{statusLabel}</span>
    </div>
  );
};
