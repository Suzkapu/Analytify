class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();

  get length(): number {
    return this.values.size;
  }

  clear(): void {
    this.values.clear();
  }

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  key(index: number): string | null {
    return [...this.values.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }

  setItem(key: string, value: string): void {
    this.values.set(key, String(value));
  }
}

for (const name of ['localStorage', 'sessionStorage'] as const) {
  if (!globalThis[name]) {
    Object.defineProperty(globalThis, name, {
      configurable: true,
      value: new MemoryStorage(),
    });
  }
}

if (!navigator.permissions) {
  Object.defineProperty(navigator, 'permissions', {
    configurable: true,
    value: {
      query: async () => ({ state: 'prompt' }),
    },
  });
}

if (!navigator.serviceWorker) {
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: {
      getRegistration: async () => undefined,
    },
  });
}

if (typeof Notification === 'undefined') {
  Object.defineProperty(globalThis, 'Notification', {
    configurable: true,
    value: class TestNotification {
      static readonly permission: NotificationPermission = 'default';
    },
  });
}
