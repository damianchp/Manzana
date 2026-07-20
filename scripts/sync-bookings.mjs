// sync-bookings.mjs — runs in GitHub Actions on a schedule.
// Reads confirmed bookings from Supabase that have no calendar event yet,
// creates the event on the host's Google Calendar via a SERVICE ACCOUNT
// (whose key never expires, unlike browser OAuth), and writes the event id
// back to Supabase so the app and this script never duplicate each other.
//
// Required environment variables (set as GitHub Actions Secrets):
//   SUPABASE_URL              e.g. https://xxxx.supabase.co
//   SUPABASE_ANON_KEY         the anon public key
//   SUPABASE_HOST_KEY         your private host key (matches app_secrets)
//   GOOGLE_SA_KEY_JSON        full JSON of the service account key file
//   GOOGLE_CALENDAR_ID        usually your gmail address
//   BOOKING_TIMEZONE          e.g. Europe/Copenhagen
//
// No npm dependencies — uses only Node 20 built-ins.

import crypto from 'node:crypto';

const {
  SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_HOST_KEY,
  GOOGLE_SA_KEY_JSON, GOOGLE_CALENDAR_ID,
  BOOKING_TIMEZONE = 'Europe/Copenhagen'
} = process.env;

function need(name, v){ if(!v){ console.error(`Missing secret: ${name}`); process.exit(1); } }
need('SUPABASE_URL', SUPABASE_URL);
need('SUPABASE_ANON_KEY', SUPABASE_ANON_KEY);
need('SUPABASE_HOST_KEY', SUPABASE_HOST_KEY);
#need('GOOGLE_SA_KEY_JSON', GOOGLE_SA_KEY_JSON);
need('GOOGLE_CALENDAR_ID', GOOGLE_CALENDAR_ID);

const sb = (path, opts={}) => fetch(SUPABASE_URL.replace(/\/$/,'') + '/rest/v1' + path, {
  ...opts,
  headers: {
    'apikey': SUPABASE_ANON_KEY,
    'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
    'x-host-key': SUPABASE_HOST_KEY,
    'Content-Type': 'application/json',
    ...(opts.headers||{})
  }
});

// --- Google service-account auth: sign a JWT, exchange for access token ---
function b64url(buf){ return Buffer.from(buf).toString('base64').replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,''); }
async function getGoogleToken(){
  const sa = JSON.parse(GOOGLE_SA_KEY_JSON);
  const now = Math.floor(Date.now()/1000);
  const header = b64url(JSON.stringify({alg:'RS256', typ:'JWT'}));
  const claims = b64url(JSON.stringify({
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/calendar',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now, exp: now + 3600
  }));
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(`${header}.${claims}`);
  const signature = b64url(signer.sign(sa.private_key));
  const jwt = `${header}.${claims}.${signature}`;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method:'POST',
    headers:{'Content-Type':'application/x-www-form-urlencoded'},
    body: new URLSearchParams({ grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt })
  });
  if(!res.ok){ console.error('Google token exchange failed:', res.status, await res.text()); process.exit(1); }
  return (await res.json()).access_token;
}

async function main(){
  const today = new Date().toISOString().slice(0,10);

  // 1. Unsynced confirmed bookings from today onward
  const res = await sb(`/bookings?select=*&status=eq.confirmed&gcal_event_id=is.null&date=gte.${today}`);
  if(!res.ok){ console.error('Supabase read failed:', res.status, await res.text()); process.exit(1); }
  const bookings = await res.json();
  console.log(`Found ${bookings.length} unsynced booking(s).`);
  if(!bookings.length) return;

  const token = await getGoogleToken();

  let ok = 0, fail = 0;
  for(const b of bookings){
    const start = `${b.date}T${b.start_time}`;
    const end = `${b.date}T${b.end_time}`;
    const ev = {
      summary: `${b.event_type_name || 'Meeting'} — ${b.invitee_name}`,
      description: `Booked via Manzana.${b.note ? '\nInvitee note: ' + b.note : ''}\nInvitee email: ${b.invitee_email}`,
      start: { dateTime: start, timeZone: BOOKING_TIMEZONE },
      end:   { dateTime: end,   timeZone: BOOKING_TIMEZONE }
      // NOTE: no attendees — service accounts can't invite guests without
      // domain-wide delegation. The invitee already got their own
      // "Add to Calendar" link at booking time.
    };
    const gRes = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(GOOGLE_CALENDAR_ID)}/events`,
      { method:'POST', headers:{'Authorization':`Bearer ${token}`,'Content-Type':'application/json'}, body: JSON.stringify(ev) }
    );
    if(!gRes.ok){ console.error(`Calendar create failed for booking ${b.id}:`, gRes.status, await gRes.text()); fail++; continue; }
    const created = await gRes.json();

    // 2. Write the event id back so nothing ever creates it twice
    const patch = await sb(`/bookings?id=eq.${encodeURIComponent(b.id)}`, {
      method:'PATCH', body: JSON.stringify({ gcal_event_id: created.id })
    });
    if(!patch.ok){ console.error(`Supabase write-back failed for ${b.id}:`, patch.status, await patch.text()); fail++; continue; }
    console.log(`Synced: ${b.date} ${b.start_time} — ${b.invitee_name}`);
    ok++;
  }
  console.log(`Done. ${ok} synced, ${fail} failed.`);
  if(fail) process.exit(1);
}

main().catch(e => { console.error(e); process.exit(1); });
