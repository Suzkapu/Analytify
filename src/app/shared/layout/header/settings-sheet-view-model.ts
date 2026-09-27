import {PushNotificationSettings} from '@core/notifications/push-notification.service';

export interface DeviceStatusView {
  title: string;
  description: string;
  tone: 'success' | 'warning' | 'neutral' | 'danger';
}

export function notificationDeviceStatus(settings: PushNotificationSettings): DeviceStatusView {
  switch (settings.deviceState) {
    case 'registered':
      return settings.installedPwa
        ? {title: 'This device is ready', description: 'Notifications can arrive on this installed app.', tone: 'success'}
        : {title: 'This device is ready', description: 'Notifications can arrive here. Install Analytify for the most reliable delivery.', tone: 'success'};
    case 'permission-required':
      return {title: 'Permission required', description: 'Turn on a category below to let your browser ask for notification permission.', tone: 'warning'};
    case 'denied':
      return {title: 'Notifications are blocked', description: 'Allow notifications in your browser or site settings, then return here.', tone: 'danger'};
    case 'unsupported':
      return {title: 'Notifications are unavailable', description: 'Use a supported browser or install Analytify as an app on this device.', tone: 'neutral'};
    case 'server-only':
      return {title: 'Set up this device', description: 'Your preferences are saved, but notifications are currently registered only on another or older device.', tone: 'warning'};
    case 'subscription-missing':
      return {title: 'Finish device setup', description: 'Browser permission is available, but this device still needs a push subscription.', tone: 'warning'};
  }
  return {title: 'Checking this device', description: 'Device notification status is not available yet.', tone: 'neutral'};
}

export function humanInterval(minutes: number): string {
  const value = Math.max(1, Math.trunc(minutes || 0));
  if (value % 1440 === 0) {
    const days = value / 1440;
    return `${days} ${days === 1 ? 'day' : 'days'}`;
  }
  if (value % 60 === 0) {
    const hours = value / 60;
    return `${hours} ${hours === 1 ? 'hour' : 'hours'}`;
  }
  return `${value} ${value === 1 ? 'minute' : 'minutes'}`;
}

export function syncTaskState(task: {
  effective_active: boolean;
  feature_required: boolean;
  editable: boolean;
  policy_available: boolean;
}): {label: string; detail: string; editable: boolean} {
  if (task.feature_required || !task.editable) {
    return {label: 'Required', detail: 'Used by a feature you enabled', editable: false};
  }
  if (!task.policy_available) {
    return {label: 'Unavailable', detail: 'Disabled by site policy', editable: false};
  }
  return task.effective_active
    ? {label: 'Automatic updates on', detail: 'Uses your saved schedule', editable: true}
    : {label: 'Automatic updates off', detail: 'Runs only when a feature requires it', editable: true};
}
