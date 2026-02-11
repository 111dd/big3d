// Supabase Configuration
// ⚠️ חשוב: עדכן את הערכים האלה עם ה-credentials שלך מ-Supabase

const SUPABASE_URL = 'https://afbwbzdkjetbycijbegj.supabase.co'; // לדוגמה: https://xxxxx.supabase.co
const SUPABASE_ANON_KEY = 'sb_publishable_Go4mjqThGYbhIHfPLctvaw_EaLZqMh7'; // ה-anon key שלך

// Validate configuration
if (!SUPABASE_URL || SUPABASE_URL.includes('xxxxx') || !SUPABASE_ANON_KEY || SUPABASE_ANON_KEY.includes('YOUR')) {
    console.error('❌ Supabase לא מוגדר נכון! עדכן את SUPABASE_URL ו-SUPABASE_ANON_KEY ב-js/supabase-config.js');
} else {
    console.log('✅ Supabase מוגדר:', {
        url: SUPABASE_URL,
        keyLength: SUPABASE_ANON_KEY.length
    });
}

// Initialize Supabase client (make it globally accessible)
// Make variables globally accessible for debugging
window.SUPABASE_URL = SUPABASE_URL;
window.SUPABASE_ANON_KEY = SUPABASE_ANON_KEY;

// Use window.supabaseClient to avoid conflicts
var supabase = null;

function initSupabaseClient() {
    // Try multiple ways to access Supabase
    let supabaseLib = null;
    
    // Method 1: Check window.supabase (from ESM import)
    if (typeof window.supabase !== 'undefined' && window.supabase !== null && typeof window.supabase.createClient === 'function') {
        supabaseLib = window.supabase;
        console.log('✅ מצא Supabase דרך window.supabase');
    }
    // Method 2: Check global supabase (from CDN)
    else if (typeof supabase !== 'undefined' && supabase !== null && typeof supabase.createClient === 'function') {
        supabaseLib = supabase;
        console.log('✅ מצא Supabase דרך global supabase');
    }
    
    if (!supabaseLib) {
        console.warn('⏳ Supabase library עדיין לא נטען, מנסה שוב...');
        console.log('🔍 בדיקה:', {
            'typeof supabase': typeof supabase,
            'supabase': supabase,
            'typeof window.supabase': typeof window.supabase,
            'window.supabase': window.supabase,
            'has createClient': typeof window.supabase?.createClient
        });
        return false;
    }
    
    try {
        const client = supabaseLib.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
            auth: {
                persistSession: true,
                autoRefreshToken: true
            }
        });
        
        // Set both local and global variables
        supabase = client;
        window.supabaseClient = client;
        
        console.log('✅ Supabase client נוצר בהצלחה');
        console.log('📍 URL:', SUPABASE_URL);
        console.log('🔑 Key length:', SUPABASE_ANON_KEY.length);
        console.log('🔍 Client type:', typeof client);
        console.log('🔍 Has auth:', typeof client.auth);
        console.log('🔍 Has from:', typeof client.from);
        
        // Trigger event to notify other scripts
        window.dispatchEvent(new CustomEvent('supabase-client-ready', { detail: client }));
        
        return true;
    } catch (error) {
        console.error('❌ שגיאה ביצירת Supabase client:', error);
        console.error('Error details:', {
            message: error.message,
            stack: error.stack,
            url: SUPABASE_URL,
            keyLength: SUPABASE_ANON_KEY ? SUPABASE_ANON_KEY.length : 0
        });
        return false;
    }
}

// Try to initialize - wait for library if needed
// Listen for the event from admin.html that creates the client
window.addEventListener('supabase-client-ready', (event) => {
    console.log('✅ קיבל event: supabase-client-ready מ-admin.html');
    if (event.detail) {
        supabase = event.detail;
        window.supabaseClient = event.detail;
        console.log('✅ Supabase client הוגדר מ-event');
    }
});

// Also try to initialize directly
function init() {
    // Check if client was already created by admin.html script
    if (window.supabaseClient && typeof window.supabaseClient.auth !== 'undefined') {
        console.log('✅ Supabase client כבר נוצר ב-admin.html');
        supabase = window.supabaseClient;
        return;
    }
    
    // Check if library is already loaded (multiple ways)
    let supabaseLib = null;
    
    // Try to find Supabase library
    if (typeof window.supabase !== 'undefined' && window.supabase !== null && typeof window.supabase.createClient === 'function') {
        supabaseLib = window.supabase;
        console.log('✅ מצא Supabase דרך window.supabase');
    } else if (typeof supabase !== 'undefined' && supabase !== null) {
        // supabase might be null, but let's check if it has createClient
        if (typeof supabase.createClient === 'function') {
            supabaseLib = supabase;
            console.log('✅ מצא Supabase דרך global supabase');
        } else {
            // Try destructuring
            try {
                const { createClient } = supabase;
                if (typeof createClient === 'function') {
                    window.supabase = { createClient };
                    supabaseLib = window.supabase;
                    console.log('✅ מצא Supabase דרך destructuring');
                }
            } catch (e) {
                // Continue
            }
        }
    }
    
    if (supabaseLib) {
        // Library loaded
        console.log('✅ Supabase library כבר נטען, יוצר client...');
        initSupabaseClient();
    } else {
        // Wait for library to load
        console.log('⏳ מחכה ל-Supabase library...');
        let attempts = 0;
        const maxAttempts = 50; // 5 seconds (admin.html will create it)
        
        let checkInterval = setInterval(() => {
            attempts++;
            
            // Check if admin.html created the client
            if (window.supabaseClient && typeof window.supabaseClient.auth !== 'undefined') {
                if (checkInterval) clearInterval(checkInterval);
                checkInterval = null;
                console.log('✅ Supabase client נוצר ב-admin.html');
                supabase = window.supabaseClient;
                return;
            }
            
            // Try to find Supabase library again
            let foundLib = null;
            if (typeof window.supabase !== 'undefined' && window.supabase !== null && typeof window.supabase.createClient === 'function') {
                foundLib = window.supabase;
            } else if (typeof supabase !== 'undefined' && supabase !== null) {
                if (typeof supabase.createClient === 'function') {
                    foundLib = supabase;
                } else {
                    try {
                        const { createClient } = supabase;
                        if (typeof createClient === 'function') {
                            window.supabase = { createClient };
                            foundLib = window.supabase;
                        }
                    } catch (e) {
                        // Continue
                    }
                }
            }
            
            if (foundLib) {
                if (checkInterval) clearInterval(checkInterval);
                checkInterval = null;
                console.log('✅ Supabase library נטען, יוצר client...');
                initSupabaseClient();
            } else if (attempts >= maxAttempts) {
                if (checkInterval) clearInterval(checkInterval);
                checkInterval = null;
                console.warn('⚠️ Supabase library לא נמצא, אבל admin.html אמור ליצור את ה-client');
            }
        }, 100);
    }
}

// Wait a bit for the script in admin.html to load
setTimeout(init, 300);
