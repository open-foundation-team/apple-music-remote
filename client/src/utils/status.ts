import { ConnectionStatus } from '../hooks/useRemoteConnection';

export function statusDotClass(status: ConnectionStatus): string {
  switch (status) {
    case 'connected':
      return 'connected';
    case 'connecting':
      return 'connecting';
    case 'error':
      return 'error';
    case 'idle':
    default:
      return 'idle';
  }
}
