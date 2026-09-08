import {createClient} from 'npm:@supabase/supabase-js@2.108.1';
import {sendWebPush} from './web-push.ts';
import {
  deleteExpiredPushSubscription,
  deliverSongLeaguePush,
  type Delivery
} from './delivery-state.ts';
import {
  bearerToken,
  boundedJsonBody,
  enforceRateLimit,
  isTrustedServiceToken,
  logInternalError,
  PublicRequestError,
  publicError,
  publicJson,
  requestContext,
  requireAllowedOrigin,
  validatePreflight
} from '../_shared/request-security.ts';

type PushDevice = {id: string; endpoint: string; p256dh: string; auth: string};

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
  const context = requestContext(request);
  const json = (body: unknown, status = 200) => publicJson(context, body, status);
  try {
    if (request.method === 'OPTIONS') {
      validatePreflight(request, context);
      return new Response(null, {status: 204, headers: context.corsHeaders});
    }
    if (request.method !== 'POST') {
      throw new PublicRequestError(405, 'method_not_allowed', 'Only POST requests are supported.');
    }
    const supabaseUrl = required('SUPABASE_URL');
    const serviceRoleKey = required('SUPABASE_SERVICE_ROLE_KEY');
    const vapidPublicKey = required('WEB_PUSH_VAPID_PUBLIC_KEY');
    const vapidPrivateKey = required('WEB_PUSH_VAPID_PRIVATE_KEY');
    const vapid = {
      subject: 'https://analytify.dynv6.net',
      publicKey: vapidPublicKey,
      privateKey: vapidPrivateKey
    };

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: {persistSession: false, autoRefreshToken: false}
    });
    await enforceRateLimit(admin, request, 'notifications:client', null, 40, 60);
    const token = bearerToken(request);
    const trustedWorker = isTrustedServiceToken(token, serviceRoleKey);
    requireAllowedOrigin(context, trustedWorker);
    await enforceRateLimit(
      admin, request, 'notifications:caller', trustedWorker ? 'trusted-worker' : token, trustedWorker ? 240 : 12, 60
    );
    const body = await boundedJsonBody(request, 2 * 1024);
    const allowedFields = new Set(['action', 'now']);
    if (Object.keys(body).some(field => !allowedFields.has(field))) {
      return json({error: 'The notification request contains unsupported fields.'}, 400);
    }
    if (body.action !== undefined && (typeof body.action !== 'string' || body.action.length > 32)) {
      return json({error: 'The notification action is invalid.'}, 400);
    }
    if (body.action !== undefined && body.action !== 'test') {
      return json({error: 'The notification action is unsupported.'}, 400);
    }

    if (body?.action === 'test') {
      const {data: identity, error: identityError} = await admin.auth.getUser(token);
      if (identityError || !identity.user) return json({error: 'Authentication is required.'}, 401);
      await enforceRateLimit(admin, request, 'notifications:admin', identity.user.id, 5, 60);
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

    if (!trustedWorker) return json({error: 'Trusted worker access is required.'}, 403);
    if (body.now !== undefined && (
      typeof body.now !== 'string' || body.now.length > 64 || Number.isNaN(Date.parse(body.now))
    )) return json({error: 'The requested notification time is invalid.'}, 400);
    const requestedNow = typeof body.now === 'string' ? new Date(body.now).toISOString() : new Date().toISOString();
    const {data: queued, error: queueError} = await admin.rpc('queue_song_league_pick_notifications', {
      p_now: requestedNow
    });
    if (queueError) throw queueError;
    const [openingClaims, songClaims, statsAccessClaims] = await Promise.all([
      admin.rpc('claim_song_league_push_deliveries', {p_limit: 100}),
      admin.rpc('claim_song_league_song_push_deliveries', {p_limit: 100}),
      admin.rpc('claim_stats_access_push_deliveries', {p_limit: 100})
    ]);
    if (openingClaims.error) throw openingClaims.error;
    if (songClaims.error) throw songClaims.error;
    if (statsAccessClaims.error) throw statsAccessClaims.error;
    const claimed = [
      ...(openingClaims.data || []).map((delivery: Delivery) => ({
        ...delivery, delivery_table: 'song_league_push_deliveries' as const
      })),
      ...(songClaims.data || []) as Delivery[],
      ...(statsAccessClaims.data || []) as Delivery[]
    ];

    const outcomes = await mapConcurrently(claimed, 10, delivery =>
      deliverSongLeaguePush(delivery, {
        admin,
        sendWebPush,
        notificationPayload: delivery.delivery_table === 'stats_access_push_deliveries'
          ? payload(
            'New stats access request',
            `${delivery.viewer_display_name || 'A registered user'} wants to view your saved stats.`,
            '/shared-playlists',
            `stats-access-${delivery.delivery_id}`
          )
          : delivery.delivery_table === 'song_league_song_push_deliveries'
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
    if (error instanceof PublicRequestError) return publicError(context, error);
    logInternalError(context, 'Song League notification delivery', error);
    return publicError(context, new PublicRequestError(
      500, 'notification_delivery_failed', 'Notification delivery could not be completed. Please try again.'
    ));
  }
});
