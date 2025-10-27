import { ServerStatus } from '../../api/types';
import { usePersistentState } from '../../hooks/usePersistentState';
import { inferDefaultBaseUrl } from '../../utils/network';
import styles from './SettingsModal.module.css';

interface SettingsModalProps {
  onClose: () => void;
}

export const SettingsModal = ({ onClose }: SettingsModalProps) => {
  const [baseUrl, setBaseUrl] = usePersistentState<string>(
    'amr.baseUrl',
    inferDefaultBaseUrl
  );
  const [token, setToken] = usePersistentState<string>('amr.token', '');
  return (
    <div className={styles.modalContainer}>
      <div className={styles.settingsModal}>
        <button className={styles.settingsModalCloseButton} onClick={onClose}>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
            className="size-6"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="m9.75 9.75 4.5 4.5m0-4.5-4.5 4.5M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
            />
          </svg>
        </button>
        <div className={styles.settingsModalHeader}>Settings</div>
        <div className={styles.settingsModalBody}>
          <div>
            <div className="section-title">Server URL</div>
            <input
              type="text"
              placeholder="http://apple-music-remote.local:8777"
              value={baseUrl}
              onChange={event => setBaseUrl(event.target.value)}
            />
          </div>

          <div>
            <div className="section-title">Access Token</div>
            <input
              type="password"
              placeholder="Paste token from menu bar"
              value={token}
              onChange={event => setToken(event.target.value)}
            />
          </div>

          <div className="server-meta">
            Token is required for control actions. Copy it from the menu bar icon.
          </div>
        </div>
      </div>
    </div>
  );
};
