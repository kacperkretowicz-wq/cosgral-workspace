export interface SingleInstanceHost {
  requestSingleInstanceLock(): boolean;
  exit(code?: number): void;
}

/**
 * COSGRAL (H3): Fast single-instance guard.
 *
 * On Windows, calling `app.quit()` for a duplicate instance causes Electron
 * to wait for graceful Chromium subsystem initialization and teardown, taking
 * ~6 seconds. `app.requestSingleInstanceLock()` synchronously notifies the primary
 * instance via Win32 IPC (SendMessage WM_COPYDATA). The duplicate instance has
 * already delivered its command-line arguments and must terminate immediately (<3s).
 */
export function enforceSingleInstance(host: SingleInstanceHost, onDuplicate?: () => void): boolean {
  const hasLock = host.requestSingleInstanceLock();
  if (!hasLock) {
    if (onDuplicate) {
      onDuplicate();
    } else {
      host.exit(0);
      process.exit(0);
    }
    return false;
  }
  return true;
}
