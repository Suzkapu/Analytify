export type Delivery = {
  delivery_id: string;
  subscription_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  league_id: string;
  league_name: string;
  opening_date?: string;
  track_name?: string;
  recommender_display_name?: string;
  delivery_table?: 'song_league_push_deliveries' | 'song_league_song_push_deliveries';
  attempts: number;
};

type DatabaseError = {message?: string} | Error | string;
type DatabaseResult = {error: DatabaseError | null};
type DatabaseQuery = PromiseLike<DatabaseResult>;
type AdminClient = {
  from(table: string): {
    update(values: Record<string, unknown>): {eq(column: string, value: string): DatabaseQuery};
    delete(): {eq(column: string, value: string): DatabaseQuery};
  };
};
type Vapid = {subject: string; publicKey: string; privateKey: string};

type DeliveryDependencies = {
  admin: AdminClient;
  sendWebPush: (delivery: Delivery, payload: string, vapid: Vapid) => Promise<void>;
  notificationPayload: string;
  vapid: Vapid;
  now?: () => string;
};

function throwIfDatabaseError(error: DatabaseError | null): void {
  if (!error) return;
  if (error instanceof Error) throw error;
  throw new Error(typeof error === 'string' ? error : error.message || 'Database write failed.');
}

export async function deleteExpiredPushSubscription(admin: AdminClient, subscriptionId: string): Promise<void> {
  const {error} = await admin.from('push_subscriptions').delete().eq('id', subscriptionId);
  throwIfDatabaseError(error);
}

export async function deliverSongLeaguePush(
  delivery: Delivery,
  dependencies: DeliveryDependencies
): Promise<boolean> {
  const deliveryTable = delivery.delivery_table || 'song_league_push_deliveries';
  try {
    await dependencies.sendWebPush(delivery, dependencies.notificationPayload, dependencies.vapid);
  } catch (error) {
    const statusCode = Number((error as {statusCode?: number})?.statusCode || 0);
    if (statusCode === 404 || statusCode === 410) {
      await deleteExpiredPushSubscription(dependencies.admin, delivery.subscription_id);
    } else {
      const exhausted = delivery.attempts >= 3;
      const {error: retryError} = await dependencies.admin.from(deliveryTable).update({
        status: exhausted ? 'failed' : 'retry',
        last_error: String((error as Error)?.message || error).slice(0, 500),
        updated_at: (dependencies.now || (() => new Date().toISOString()))()
      }).eq('id', delivery.delivery_id);
      throwIfDatabaseError(retryError);
    }
    return false;
  }

  const timestamp = (dependencies.now || (() => new Date().toISOString()))();
  const {error: sentError} = await dependencies.admin.from(deliveryTable).update({
    status: 'sent', sent_at: timestamp, last_error: null, updated_at: timestamp
  }).eq('id', delivery.delivery_id);
  throwIfDatabaseError(sentError);
  return true;
}
