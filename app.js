/**
 * Seamless Google Maps Place ID Finder
 * Features:
 * - Direct click on any POI landmark/business to retrieve Place ID, populate search, and open InfoWindow
 * - Direct click anywhere on the map (reverse geocode) to get Place ID
 * - Search autocomplete with Place ID retrieval
 * - One-click copy Place ID button with toast notification
 */

const DEFAULT_SAMPLE_KEY = 'AIzaSyB41DRUbKWJHPxaFjMAwdrzWzbVKartNGg';
const STORAGE_KEY = 'custom_gmaps_api_key';

let map = null;
let marker = null;
let infoWindow = null;
let placesService = null;
let geocoder = null;
let currentSelectedPlace = null;

// ==========================================================================
// Toast Notifications
// ==========================================================================
function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<span>${message}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(10px)';
        toast.style.transition = 'all 0.25s ease';
        setTimeout(() => toast.remove(), 250);
    }, 2800);
}

// ==========================================================================
// Clipboard Copy Helper
// ==========================================================================
async function copyToClipboard(text, label = 'Place ID') {
    if (!text) return;
    try {
        if (navigator.clipboard && window.isSecureContext) {
            await navigator.clipboard.writeText(text);
        } else {
            const textArea = document.createElement('textarea');
            textArea.value = text;
            textArea.style.position = 'fixed';
            textArea.style.left = '-999999px';
            document.body.appendChild(textArea);
            textArea.focus();
            textArea.select();
            document.execCommand('copy');
            textArea.remove();
        }
        showToast(`${label} copied to clipboard!`, 'success');
    } catch (err) {
        console.error('Copy failed:', err);
        showToast(`Failed to copy ${label}`, 'error');
    }
}

// Global hooks for onclick handlers inside InfoWindow
window.copyCurrentPlaceId = function (id) {
    const placeId = id || (currentSelectedPlace ? currentSelectedPlace.place_id : '');
    copyToClipboard(placeId, 'Place ID');
};

window.copyReviewLink = function (id) {
    const placeId = id || (currentSelectedPlace ? currentSelectedPlace.place_id : '');
    if (!placeId) return;
    const reviewUrl = `search.google.com/local/writereview?placeid=${placeId}`;
    copyToClipboard(reviewUrl, 'Review link');
};

function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

// ==========================================================================
// InfoWindow HTML Builder
// ==========================================================================
function buildInfoWindowHtml(place) {
    const name = escapeHtml(place.name || 'Selected Place');
    const placeId = escapeHtml(place.place_id || 'N/A');
    const address = escapeHtml(place.formatted_address || '');
    const reviewUrl = `search.google.com/local/writereview?placeid=${placeId}`;
    const reviewHref = `https://${reviewUrl}`;

    return `
        <div style="padding: 4px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; min-width: 260px; max-width: 340px; line-height: 1.4; color: #202124;">
            <div style="font-size: 1.05rem; font-weight: 700; color: #202124; margin-bottom: 4px;">
                ${name}
            </div>
            ${address ? `<div style="font-size: 0.8rem; color: #5f6368; margin-bottom: 8px;">${address}</div>` : ''}

            <!-- Direct Google Review Link -->
            <div style="background: #eef3fc; border: 1px solid #cce0ff; padding: 8px 10px; border-radius: 6px; margin-bottom: 10px;">
                <div style="font-size: 0.68rem; font-weight: 700; text-transform: uppercase; color: #1557b0; letter-spacing: 0.5px; margin-bottom: 3px;">
                    Google Review Direct Link
                </div>
                <a href="${reviewHref}" target="_blank" rel="noopener noreferrer" style="font-family: ui-monospace, SFMono-Regular, monospace; font-size: 0.78rem; font-weight: 600; color: #1a73e8; word-break: break-all; display: block; text-decoration: underline; margin-bottom: 2px;">
                    ${reviewUrl}
                </a>
            </div>

            <!-- Actions -->
            <div style="display: flex; gap: 8px; flex-wrap: wrap;">
                <button type="button" 
                        class="btn btn-primary btn-sm" 
                        onclick="window.copyReviewLink('${placeId}')"
                        style="cursor: pointer; display: inline-flex; align-items: center; gap: 6px; padding: 7px 14px; font-size: 0.82rem; font-weight: 500; border-radius: 6px; border: none; background: #1a73e8; color: #fff;">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
                        <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
                    </svg>
                    Copy Review Link
                </button>
                <a href="${reviewHref}" target="_blank" rel="noopener noreferrer"
                   style="display: inline-flex; align-items: center; padding: 7px 12px; font-size: 0.82rem; font-weight: 500; border-radius: 6px; border: 1px solid #dadce0; background: #fff; color: #3c4043; text-decoration: none;">
                    Open ↗
                </a>
            </div>
        </div>
    `;
}

// ==========================================================================
// Place Display & UI Updates
// ==========================================================================
function displayPlace(place) {
    if (!place || !place.place_id) return;
    currentSelectedPlace = place;

    const input = document.getElementById('pac-input');
    const clearBtn = document.getElementById('clear-search-btn');

    // 1. Put place name into the search bar
    const displayName = place.name || (place.formatted_address ? place.formatted_address.split(',')[0] : 'Selected Place');
    if (input) {
        input.value = displayName;
        if (clearBtn) clearBtn.style.display = 'flex';
    }

    // 2. Move Marker & Open InfoWindow
    if (place.geometry && place.geometry.location) {
        marker.setPosition(place.geometry.location);
        marker.setVisible(true);

        if (place.geometry.viewport) {
            map.fitBounds(place.geometry.viewport);
        } else {
            map.setCenter(place.geometry.location);
            map.setZoom(17);
        }

        // Set InfoWindow content and open
        infoWindow.setContent(buildInfoWindowHtml(place));
        infoWindow.open(map, marker);
    }
}

// ==========================================================================
// Google Maps Initialization
// ==========================================================================
function initGoogleMaps() {
    const mapElement = document.getElementById('map');
    const input = document.getElementById('pac-input');
    const clearBtn = document.getElementById('clear-search-btn');
    const closeCardBtn = document.getElementById('close-card-btn');
    const bottomCard = document.getElementById('bottom-place-card');

    if (closeCardBtn && bottomCard) {
        closeCardBtn.addEventListener('click', () => {
            bottomCard.classList.remove('active');
        });
    }

    // Create Map
    map = new google.maps.Map(mapElement, {
        center: { lat: -33.8688, lng: 151.2195 },
        zoom: 14,
        clickableIcons: true, // Enables click events on POIs!
        mapTypeControl: false,
        fullscreenControl: false,
        streetViewControl: false,
    });

    // Create Autocomplete
    const autocomplete = new google.maps.places.Autocomplete(input, {
        fields: ['place_id', 'geometry', 'formatted_address', 'name'],
    });
    autocomplete.bindTo('bounds', map);

    // Marker & InfoWindow
    marker = new google.maps.Marker({
        map: map,
        visible: false,
    });

    infoWindow = new google.maps.InfoWindow();

    marker.addListener('click', () => {
        if (currentSelectedPlace) {
            infoWindow.setContent(buildInfoWindowHtml(currentSelectedPlace));
            infoWindow.open(map, marker);
        }
    });

    // Services
    placesService = new google.maps.places.PlacesService(map);
    geocoder = new google.maps.Geocoder();

    // ----------------------------------------------------------------------
    // 1. Autocomplete Search Selection Listener
    // ----------------------------------------------------------------------
    autocomplete.addListener('place_changed', () => {
        infoWindow.close();
        const place = autocomplete.getPlace();

        if (!place || !place.geometry || !place.geometry.location) {
            showToast('Please select a place from the suggestions dropdown', 'error');
            return;
        }

        displayPlace(place);
    });

    // ----------------------------------------------------------------------
    // 2. Seamless Map Click Listener (Direct POI & Coordinate Clicks)
    // ----------------------------------------------------------------------
    map.addListener('click', (event) => {
        infoWindow.close();

        // CASE A: User clicked directly on a POI (store, restaurant, landmark, etc.)
        if (event.placeId) {
            event.stop(); // Prevent default Google Maps POI popup
            showToast('Fetching place details...', 'info');

            // Pre-display immediately with the place ID we already have
            displayPlace({
                place_id: event.placeId,
                name: 'Loading place details...',
                formatted_address: '',
                geometry: { location: event.latLng },
            });

            // Fetch complete name and address
            placesService.getDetails({
                placeId: event.placeId,
                fields: ['name', 'formatted_address', 'geometry', 'place_id'],
            }, (place, status) => {
                if (status === google.maps.places.PlacesServiceStatus.OK && place) {
                    displayPlace(place);
                    showToast(`Found: ${place.name}`, 'success');
                } else {
                    // Fallback to geocoder to get address name
                    geocoder.geocode({ location: event.latLng }, (results, geoStatus) => {
                        const addr = (geoStatus === 'OK' && results && results[0]) ? results[0].formatted_address : '';
                        displayPlace({
                            place_id: event.placeId,
                            name: addr ? addr.split(',')[0] : 'Selected Landmark',
                            formatted_address: addr,
                            geometry: { location: event.latLng },
                        });
                    });
                }
            });
            return;
        }

        // CASE B: User clicked on an unlabelled coordinate or street (Reverse Geocode)
        if (event.latLng) {
            geocoder.geocode({ location: event.latLng }, (results, status) => {
                if (status === 'OK' && results && results.length > 0) {
                    const topResult = results[0];
                    displayPlace({
                        place_id: topResult.place_id,
                        name: topResult.formatted_address.split(',')[0] || 'Selected Location',
                        formatted_address: topResult.formatted_address,
                        geometry: topResult.geometry,
                    });
                    showToast('Place ID retrieved!', 'success');
                }
            });
        }
    });

    // Search bar clear button
    if (clearBtn && input) {
        input.addEventListener('input', () => {
            clearBtn.style.display = input.value ? 'flex' : 'none';
        });

        clearBtn.addEventListener('click', () => {
            input.value = '';
            clearBtn.style.display = 'none';
            input.focus();
        });
    }
}

let isScriptLoaded = false;
function loadScript() {
    if (isScriptLoaded) return;
    isScriptLoaded = true;
    const savedKey = localStorage.getItem(STORAGE_KEY);
    const apiKey = (savedKey && savedKey.trim() !== '') ? savedKey.trim() : DEFAULT_SAMPLE_KEY;

    window.initGoogleMaps = initGoogleMaps;

    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&libraries=places&callback=initGoogleMaps&v=weekly`;
    script.async = true;
    script.defer = true;
    script.onerror = () => {
        showToast('Google Maps failed to load. Please check your API key.', 'error');
    };
    document.head.appendChild(script);
}

// ==========================================================================
// Authentication System (Always prompt on open & re-verify every 10 minutes)
// ==========================================================================
const TEN_MINUTES_MS = 10 * 60 * 1000; // 10 minutes

let isUnlocked = false;
let lastUnlockTimestamp = 0;
let sessionTimeoutTimer = null;
let sessionCheckInterval = null;

// Pure JS Fallback SHA-256 for environments where SubtleCrypto is unavailable
function fallbackSha256(ascii) {
    function rightRotate(value, amount) {
        return (value >>> amount) | (value << (32 - amount));
    }
    var mathPow = Math.pow;
    var maxWord = mathPow(2, 32);
    var lengthProperty = 'length';
    var i, j;
    var result = '';
    var words = [];
    var asciiBitLength = ascii[lengthProperty] * 8;
    var hash = [];
    var k = [];
    var primeCounter = 0;
    var isComposite = {};
    for (var candidate = 2; primeCounter < 64; candidate++) {
        if (!isComposite[candidate]) {
            for (i = 0; i < 313; i += candidate) {
                isComposite[i] = candidate;
            }
            hash[primeCounter] = (mathPow(candidate, .5) * maxWord) | 0;
            k[primeCounter++] = (mathPow(candidate, 1 / 3) * maxWord) | 0;
        }
    }
    ascii += '\x80';
    while (ascii[lengthProperty] % 64 - 56) ascii += '\x00';
    for (i = 0; i < ascii[lengthProperty]; i++) {
        j = ascii.charCodeAt(i);
        words[i >> 2] |= j << ((3 - i) % 4) * 8;
    }
    words[words[lengthProperty]] = ((asciiBitLength / maxWord) | 0);
    words[words[lengthProperty]] = (asciiBitLength);
    for (j = 0; j < words[lengthProperty];) {
        var w = words.slice(j, j += 16);
        var oldHash = hash;
        hash = hash.slice(0, 8);
        for (i = 0; i < 64; i++) {
            var w15 = w[i - 15], w2 = w[i - 2];
            var a = hash[0], e = hash[4];
            var temp1 = (hash[7]
                + (rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25))
                + ((e & hash[5]) ^ ((~e) & hash[6]))
                + k[i]
                + (w[i] = (i < 16) ? w[i] : (
                    w[i - 16]
                    + (rightRotate(w15, 7) ^ rightRotate(w15, 18) ^ (w15 >>> 3))
                    + w[i - 7]
                    + (rightRotate(w2, 17) ^ rightRotate(w2, 19) ^ (w2 >>> 10))
                ) | 0
                )) | 0;
            var temp2 = ((rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22))
                + ((a & hash[1]) ^ (a & hash[2]) ^ (hash[1] & hash[2]))) | 0;
            hash = [(temp1 + temp2) | 0].concat(hash);
            hash[4] = (hash[4] + temp1) | 0;
        }
        for (i = 0; i < 8; i++) {
            hash[i] = (hash[i] + oldHash[i]) | 0;
        }
    }
    for (i = 0; i < 8; i++) {
        for (j = 3; j + 1; j--) {
            var b = (hash[i] >> (j * 8)) & 255;
            result += ((b < 16) ? '0' : '') + b.toString(16);
        }
    }
    return result;
}
window.__sha256Fallback = fallbackSha256;

// Compute hash of input string
async function hashInput(text) {
    if (window.crypto && window.crypto.subtle) {
        try {
            const buffer = new TextEncoder().encode(text);
            const digest = await window.crypto.subtle.digest('SHA-256', buffer);
            const bytes = Array.from(new Uint8Array(digest));
            return bytes.map(b => b.toString(16).padStart(2, '0')).join('');
        } catch (e) {
            console.warn('SubtleCrypto error, falling back to pure JS SHA-256', e);
        }
    }
    return fallbackSha256(text);
}

// Fetch latest credentials from remote GitHub repository or Gist
async function fetchRemoteCredentials() {
    const config = window.AUTH_CONFIG;
    if (!config || !config.useRemote || !config.remoteUrl || config.remoteUrl.trim() === '') {
        return null;
    }

    const trimmedUrl = config.remoteUrl.trim();

    // 1. Try real-time GitHub Contents API if this is a raw.githubusercontent.com URL
    // This avoids Fastly CDN's 5-minute cache delay (max-age=300) on raw file URLs
    const ghMatch = trimmedUrl.match(/raw\.githubusercontent\.com\/([^\/]+)\/([^\/]+)\/(?:refs\/heads\/)?([^\/]+)\/(.+)/);
    if (ghMatch) {
        const [, owner, repo, branch, path] = ghMatch;
        const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=${encodeURIComponent(branch)}&_t=${Date.now()}`;
        try {
            const apiRes = await fetch(apiUrl, {
                headers: {
                    'Accept': 'application/vnd.github.raw'
                }
            });
            if (apiRes.ok) {
                const data = await apiRes.json();
                if (data && data.hash) {
                    return {
                        salt: data.salt || config.salt || 'place_finder_salt_2024',
                        hash: data.hash,
                        isRemote: true
                    };
                }
            }
        } catch (apiErr) {
            console.warn('Real-time GitHub API fetch failed, falling back to direct URL:', apiErr);
        }
    }

    // 2. Direct fetch from remoteUrl (with cache buster)
    try {
        const cacheBuster = `_cb=${Date.now()}`;
        const delimiter = trimmedUrl.includes('?') ? '&' : '?';
        const url = `${trimmedUrl}${delimiter}${cacheBuster}`;

        const response = await fetch(url, {
            headers: {
                'Accept': 'application/json, text/plain, */*'
            }
        });

        if (!response.ok) {
            console.warn(`Remote credentials request returned HTTP ${response.status}`);
            return null;
        }

        const data = await response.json();
        if (data && data.hash) {
            return {
                salt: data.salt || config.salt || 'place_finder_salt_2024',
                hash: data.hash,
                isRemote: true
            };
        }
    } catch (err) {
        console.warn('Unable to reach remote credentials, using local fallback:', err);
    }
    return null;
}

// Verify entered password against remote GitHub or local credentials
async function verifyPassword(password) {
    if (!window.AUTH_CONFIG) {
        console.error('Credentials file (credentials.js) is missing.');
        return false;
    }

    // 1. Check remote GitHub credentials first
    let activeCredentials = await fetchRemoteCredentials();

    // 2. Fall back to local credentials if remote is offline or unconfigured
    if (!activeCredentials) {
        activeCredentials = {
            salt: window.AUTH_CONFIG.salt || 'place_finder_salt_2024',
            hash: window.AUTH_CONFIG.hash,
            isRemote: false
        };
    }

    if (!activeCredentials.hash) {
        console.error('No valid hash found in remote or local credentials.');
        return false;
    }

    const salt = activeCredentials.salt;
    const computedHash = await hashInput(`${salt}:${password}`);
    const isMatch = computedHash.toLowerCase() === activeCredentials.hash.toLowerCase();

    if (isMatch && activeCredentials.isRemote) {
        console.log('✅ Authenticated successfully against remote GitHub credentials.');
    }
    return isMatch;
}

const SAVED_PASSWORD_KEY = 'placeid_saved_pwd';

function lockForReauthentication() {
    isUnlocked = false;
    if (sessionTimeoutTimer) clearTimeout(sessionTimeoutTimer);

    const overlay = document.getElementById('login-overlay');
    const passInput = document.getElementById('password-input');
    const errorContainer = document.getElementById('login-error');
    const inputWrapper = document.querySelector('.password-input-wrapper');
    const savePasswordCheck = document.getElementById('save-password-check');

    const savedPwd = localStorage.getItem(SAVED_PASSWORD_KEY);
    if (savedPwd) {
        if (passInput) passInput.value = savedPwd;
        if (savePasswordCheck) savePasswordCheck.checked = true;
    } else {
        if (passInput) passInput.value = '';
    }

    if (errorContainer) {
        errorContainer.style.display = 'none';
    }
    if (inputWrapper) {
        inputWrapper.classList.remove('input-error');
    }
    if (overlay) {
        overlay.classList.remove('unlocked');
    }
    setTimeout(() => passInput?.focus(), 150);
    showToast('10 minutes elapsed. Please verify password to continue.', 'info');
}

function scheduleTenMinuteLock() {
    if (sessionTimeoutTimer) clearTimeout(sessionTimeoutTimer);
    lastUnlockTimestamp = Date.now();
    sessionTimeoutTimer = setTimeout(() => {
        lockForReauthentication();
    }, TEN_MINUTES_MS);
}

function startPeriodicCheck() {
    if (sessionCheckInterval) clearInterval(sessionCheckInterval);
    sessionCheckInterval = setInterval(() => {
        if (isUnlocked && (Date.now() - lastUnlockTimestamp >= TEN_MINUTES_MS)) {
            lockForReauthentication();
        }
    }, 10000);
}

function setupAuth() {
    const overlay = document.getElementById('login-overlay');
    const form = document.getElementById('login-form');
    const passInput = document.getElementById('password-input');
    const togglePassBtn = document.getElementById('toggle-password-btn');
    const eyeIcon = document.getElementById('eye-icon');
    const errorContainer = document.getElementById('login-error');
    const errorText = document.getElementById('error-message-text');
    const subtitle = document.getElementById('login-subtitle');
    const inputWrapper = document.querySelector('.password-input-wrapper');
    const savePasswordCheck = document.getElementById('save-password-check');

    // 1. Initial State: Check for saved password on this browser
    isUnlocked = false;
    sessionStorage.clear();
    localStorage.removeItem('placeid_auth_state');

    const savedPwd = localStorage.getItem(SAVED_PASSWORD_KEY);
    if (savedPwd) {
        if (passInput) passInput.value = savedPwd;
        if (savePasswordCheck) savePasswordCheck.checked = true;
    } else {
        if (passInput) passInput.value = '';
    }
    if (subtitle) {
        subtitle.textContent = 'Protected Access — Enter password to continue';
    }

    if (overlay) {
        overlay.classList.remove('unlocked');
    }
    setTimeout(() => passInput?.focus(), 150);

    // 2. Toggle password visibility
    if (togglePassBtn && passInput) {
        togglePassBtn.addEventListener('click', () => {
            const isPassword = passInput.getAttribute('type') === 'password';
            passInput.setAttribute('type', isPassword ? 'text' : 'password');
            if (eyeIcon) {
                eyeIcon.innerHTML = isPassword
                    ? `<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line>`
                    : `<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle>`;
            }
        });
    }

    // 3. Form submission & password verification
    if (form && passInput) {
        const handleLogin = async (e) => {
            if (e) e.preventDefault();
            const password = (passInput.value || '').trim();
            if (!password) {
                passInput.focus();
                return;
            }

            const isValid = await verifyPassword(password);
            if (isValid) {
                // Success: handle password saving preference
                if (savePasswordCheck && savePasswordCheck.checked) {
                    localStorage.setItem(SAVED_PASSWORD_KEY, password);
                } else {
                    localStorage.removeItem(SAVED_PASSWORD_KEY);
                }

                isUnlocked = true;
                if (errorContainer) errorContainer.style.display = 'none';
                if (inputWrapper) inputWrapper.classList.remove('input-error');

                if (overlay) overlay.classList.add('unlocked');
                if (subtitle) subtitle.textContent = 'Protected Access — Enter password to continue';

                showToast('Password verified! Access granted.', 'success');

                // Start 10-minute timer and background checks
                scheduleTenMinuteLock();
                startPeriodicCheck();

                loadScript();
            } else {
                // Failure: display error and trigger shake animation
                if (errorContainer) errorContainer.style.display = 'flex';
                if (errorText) errorText.textContent = 'Incorrect password. Please try again.';
                if (inputWrapper) inputWrapper.classList.add('input-error');

                const card = document.querySelector('.login-card');
                if (card) {
                    card.classList.remove('shake');
                    void card.offsetWidth; // Trigger reflow
                    card.classList.add('shake');
                    setTimeout(() => card.classList.remove('shake'), 450);
                }
                passInput.select();
            }
        };

        form.addEventListener('submit', handleLogin);
    }

    // 4. Tab visibility listener: check if 10 minutes passed while tab was in background
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && isUnlocked) {
            if (Date.now() - lastUnlockTimestamp >= TEN_MINUTES_MS) {
                lockForReauthentication();
            }
        }
    });
}

// ==========================================================================
// UI Controls: Fullscreen & Settings Modal
// ==========================================================================
function setupControls() {
    const fullscreenBtn = document.getElementById('fullscreen-btn');
    const settingsBtn = document.getElementById('settings-btn');
    const modal = document.getElementById('settings-modal');
    const closeModalBtn = document.getElementById('close-modal-btn');
    const saveKeyBtn = document.getElementById('save-key-btn');
    const resetKeyBtn = document.getElementById('reset-key-btn');
    const keyInput = document.getElementById('custom-key-input');
    const appContainer = document.getElementById('app-container');

    // Fullscreen Toggle
    if (fullscreenBtn) {
        fullscreenBtn.addEventListener('click', () => {
            if (!document.fullscreenElement) {
                if (appContainer.requestFullscreen) appContainer.requestFullscreen();
                else if (appContainer.webkitRequestFullscreen) appContainer.webkitRequestFullscreen();
            } else {
                if (document.exitFullscreen) document.exitFullscreen();
            }
        });
    }

    // Settings Modal
    if (settingsBtn && modal) {
        settingsBtn.addEventListener('click', () => {
            if (keyInput) keyInput.value = localStorage.getItem(STORAGE_KEY) || '';
            modal.classList.add('active');
        });
    }

    if (closeModalBtn && modal) {
        closeModalBtn.addEventListener('click', () => modal.classList.remove('active'));
    }

    if (saveKeyBtn) {
        saveKeyBtn.addEventListener('click', () => {
            const key = (keyInput?.value || '').trim();
            if (key) {
                localStorage.setItem(STORAGE_KEY, key);
                showToast('Custom API key saved! Reloading...', 'success');
            } else {
                localStorage.removeItem(STORAGE_KEY);
                showToast('Reset to default sample key! Reloading...', 'info');
            }
            modal?.classList.remove('active');
            setTimeout(() => window.location.reload(), 600);
        });
    }

    if (resetKeyBtn) {
        resetKeyBtn.addEventListener('click', () => {
            localStorage.removeItem(STORAGE_KEY);
            if (keyInput) keyInput.value = '';
            showToast('Reset to default sample key! Reloading...', 'info');
            modal?.classList.remove('active');
            setTimeout(() => window.location.reload(), 600);
        });
    }
}

// Start application
document.addEventListener('DOMContentLoaded', () => {
    setupAuth();
    setupControls();
});
