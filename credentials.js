/**
 * ============================================================================
 * ENCRYPTED CREDENTIALS FILE (credentials.js)
 * ============================================================================
 * 
 * Supports both local encrypted credentials and remote GitHub repository
 * verification. When remoteUrl is provided and useRemote is true, the app
 * checks the password against your GitHub repo / Gist in real time.
 * ============================================================================
 */

window.AUTH_CONFIG = {
    // 🌐 Remote GitHub Raw URL:
    remoteUrl: "https://raw.githubusercontent.com/playtiearngarden-bit/GOOG-REVIEW/refs/heads/main/credentials.json",

    // Enable remote check if remoteUrl is provided; falls back to local if false or offline
    useRemote: true,

    // Local fallback salt & salted SHA-256 hash
    salt: "place_finder_salt_2024",
    hash: "3c3cb49b3c87f1b8f23edf8d6e305343c1fb11d331df3720978a276164870aa7"
};

/**
 * Utility helper available in browser console to easily generate a new
 * encrypted hash when you want to change your password.
 */
window.generatePasswordHash = async function(newPassword, customSalt) {
    if (!newPassword || typeof newPassword !== 'string') {
        console.error("Usage: generatePasswordHash('YourNewPassword')");
        return;
    }
    const salt = customSalt || window.AUTH_CONFIG.salt || 'place_finder_salt_2024';
    const combined = `${salt}:${newPassword}`;
    
    let computedHash = '';
    if (window.crypto && window.crypto.subtle) {
        const msgBuffer = new TextEncoder().encode(combined);
        const hashBuffer = await window.crypto.subtle.digest('SHA-256', msgBuffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        computedHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    } else {
        computedHash = window.__sha256Fallback ? window.__sha256Fallback(combined) : 'crypto_not_available';
    }

    console.log("%c🔑 Password Hash Generated Successfully!", "color: #1a73e8; font-weight: bold; font-size: 14px;");
    console.log(`Password: "${newPassword}"`);
    console.log(`Salt: "${salt}"`);
    console.log(`New Hash: %c${computedHash}`, "color: #137333; font-weight: bold;");
    return { salt, hash: computedHash };
};
