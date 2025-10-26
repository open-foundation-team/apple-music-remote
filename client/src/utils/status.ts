import { ConnectionStatus } from "../hooks/useRemoteConnection";

export function statusDotClass(status: ConnectionStatus): string {
  switch (status) {
    case "connected":
      return "status-dot connected";
    case "connecting":
      return "status-dot connecting";
    case "error":
      return "status-dot error";
    case "idle":
    default:
      return "status-dot idle";
  }
}
