import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (import.meta.env.MODE === 'production') {
  console.log('--- Supabase Production Config ---');
  console.log('URL:', SUPABASE_URL);
  console.log('Key defined:', !!SUPABASE_ANON_KEY);
}

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('CRITICAL: Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY!');
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Listen for sponsor changes via DB CDC (INSERT, UPDATE, DELETE)
export const subscribeToSponsors = (callback) => {
    const dbChannel = supabase
        .channel('public:sponsors_cdc')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'sponsors' }, (payload) => {
            callback(payload);
        })
        .subscribe();

    return () => {
        dbChannel.unsubscribe();
    };
};
