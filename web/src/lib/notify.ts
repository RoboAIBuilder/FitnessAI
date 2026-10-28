// Device notifications. In the installed PWA these come from the service worker
// (registration.showNotification); real remote delivery needs a Web Push server
// (see README). Here we can always show a local notification once permission is granted.

export function notificationsSupported() {
  try {
    return typeof window !== 'undefined' && 'Notification' in window;
  } catch {
    return false;
  }
}

export function notificationPermission(): NotificationPermission | 'unsupported' {
  if (!notificationsSupported()) return 'unsupported';
  try {
    return Notification.permission;
  } catch {
    return 'unsupported';
  }
}

export async function requestNotifications(): Promise<NotificationPermission | 'unsupported'> {
  if (!notificationsSupported()) return 'unsupported';
  try {
    return await Notification.requestPermission();
  } catch {
    return 'denied';
  }
}

export async function showLocalNotification(title: string, body: string) {
  if (notificationPermission() !== 'granted') return false;
  try {
    const reg = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration() : undefined;
    if (reg) {
      await reg.showNotification(title, { body, icon: './icon-192.png', badge: './icon-192.png' });
    } else {
      new Notification(title, { body });
    }
    return true;
  } catch {
    return false;
  }
}

export function isStandalone() {
  try {
    return window.matchMedia('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
  } catch {
    return false;
  }
}

export function isIOS() {
  try {
    return /iPad|iPhone|iPod/.test(navigator.userAgent);
  } catch {
    return false;
  }
}
