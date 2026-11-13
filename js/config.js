// Sync server (Supabase). Both values are public by design: they are in every copy of the web page,
// and the database only lets a signed-in person reach their own records.
// Never put the "secret" or "service_role" key here.
export const SYNC_URL = '';  // e.g. 'https://abcdefgh.supabase.co'
export const SYNC_KEY = '';  // the "publishable" (or "anon public") key
