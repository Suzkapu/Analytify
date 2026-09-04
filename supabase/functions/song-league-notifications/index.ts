import {createClient} from 'npm:@supabase/supabase-js@2.108.1';
import {sendWebPush} from './web-push.ts';
import {
  deleteExpiredPushSubscription,
  deliverSongLeaguePush,
  type Delivery
} from './delivery-state.ts';

type PushDevice = {id: string; endpoint: string; p256dh: string; auth: string};
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
  'Vary': 'Origin'
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...corsHeaders}
  });
}

function required(name: string): string {
  const value = Deno.env.get(name)?.trim() || '';
  if (!value) throw new Error(`${name} is not configured.`);
  return value;
}

function payload(title: string, body: string, path: string, tag: string): string {
  return JSON.stringify({
    notification: {
      title,
      body,
      icon: '/assets/icons/icon-192x192.png',
      badge: '/assets/icons/icon-96x96.png',
      tag,
      renotify: false,
      data: {
        onActionClick: {
          default: {operation: 'openWindow', url: path}
        }
      }
    }
  });
}

async function mapConcurrently<T, R>(items: T[], concurrency: number, work: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = [];
  for (let index = 0; index < items.length; index += concurrency) {
    results.push(...await Promise.all(items.slice(index, index + concurrency).map(work)));
  }
  return results;
}

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response(null, {status: 204, headers: corsHeaders});
  if (request.method !== 'POST') return json({error: 'Method not allowed.'}, 405);
  try {
    const supabaseUrl = required('SUPABASE_URL');
    const serviceRoleKey = required('SUPABASE_SERVICE_ROLE_KEY');
    const vapidPublicKey = required('WEB_PUSH_VAPID_PUBLIC_KEY');
    const vapidPrivateKey = required('WEB_PUSH_VAPID_PRIVATE_KEY');
    const vapid = {
      subject: 'https://analytify.dynv6.net',
      publicKey: vapidPublicKey,
      privateKey: vapidPrivateKey
    };

    const authorization = request.headers.get('Authorization') || '';
    const token = authorization.replace(/^Bearer\s+/i, '');
    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: {persistSession: false, autoRefreshToken: false}
    });
    const body = await request.json().catch(() => ({}));

    if (body?.action === 'test') {
      const {data: identity, error: identityError} = await admin.auth.getUser(token);
      if (identityError || !identity.user) return json({error: 'Authentication is required.'}, 401);
      const {data: adminRow, error: adminError} = await admin.from('app_admins')
        .select('user_id').eq('user_id', identity.user.id).maybeSingle();
      if (adminError) throw adminError;
      if (!adminRow) return json({error: 'Administrator access is required.'}, 403);
      const {data: devices, error: deviceError} = await admin.from('push_subscriptions')
        .select('id, endpoint, p256dh, auth').eq('user_id', identity.user.id);
      if (deviceError) throw deviceError;
      if (!devices?.length) return json({error: 'Enable notifications on this PWA device first.'}, 409);

      const outcomes = await mapConcurrently(devices as PushDevice[], 8, async device => {
        try {
          await sendWebPush(device, payload(
            'Analytify notifications work',
            'This test reached your installed PWA successfully.',
            '/admin',
            `analytify-admin-test-${Date.now()}`
          ), vapid);
          return true;
        } catch (error) {
          if ([404, 410].includes(Number((error as any)?.statusCode))) {
            await deleteExpiredPushSubscription(admin, device.id);
            return false;
          }
          throw error;
        }
      });
      const sent = outcomes.filter(Boolean).length;
      if (!sent) return json({error: 'No active PWA devices could receive the test.'}, 409);
      return json({ok: true, sent});
    }

    if (token !== serviceRoleKey) return json({error: 'Trusted worker access is required.'}, 403);
    const requestedNow = typeof body?.now === 'string' && !Number.isNaN(Date.parse(body.now))
      ? new Date(body.now).toISOString()
      : new Date().toISOString();
    const {data: queued, error: queueError} = await admin.rpc('queue_song_league_pick_notifications', {
      p_now: requestedNow
    });
    if (queueError) throw queueError;
    const [openingClaims, songClaims] = await Promise.all([
      admin.rpc('claim_song_league_push_deliveries', {p_limit: 100}),
      admin.rpc('claim_song_league_song_push_deliveries', {p_limit: 100})
    ]);
    if (openingClaims.error) throw openingClaims.error;
    if (songClaims.error) throw songClaims.error;
    const claimed = [
      ...(openingClaims.data || []).map((delivery: Delivery) => ({
        ...delivery, delivery_table: 'song_league_push_deliveries' as const
      })),
      ...(songClaims.data || []) as Delivery[]
    ];

    const outcomes = await mapConcurrently(claimed, 10, delivery =>
      deliverSongLeaguePush(delivery, {
        admin,
        sendWebPush,
        notificationPayload: delivery.delivery_table === 'song_league_song_push_deliveries'
          ? payload(
            `${delivery.recommender_display_name} added a song`,
            `“${delivery.track_name}” was added to ${delivery.league_name}.`,
            `/song-league/${encodeURIComponent(delivery.league_id)}`,
            `song-league-song-${delivery.delivery_id}`
          )
          : payload(
            `Picks are open in ${delivery.league_name}`,
            'Choose this Friday’s discovery before the pick window closes.',
            `/song-league/${encodeURIComponent(delivery.league_id)}`,
            `song-league-${delivery.league_id}-${delivery.opening_date}`
          ),
        vapid
      })
    );
    const sent = outcomes.filter(Boolean).length;
    const failed = outcomes.length - sent;
    return json({ok: failed === 0, queued: Number(queued || 0), sent, failed});
  } catch (error) {
    console.error('Song League notification delivery failed:', error);
    return json({error: (error as Error)?.message || 'Push notification delivery failed.'}, 500);
  }
});
