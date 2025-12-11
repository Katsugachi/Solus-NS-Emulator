// main.js
// Orchestrates the UI, IO, and the WASM worker threads.

// UI Element Hooks
const homeScreen = document.getElementById('home-screen');
const emulationView = document.getElementById('emulation-view');
const settingsView = document.getElementById('settings-view');
const newsView = document.getElementById('news-view');
const pairView = document.getElementById('pair-view');
const timeSpan = document.getElementById('time');
const statusIconsSpan = document.getElementById('status-icons'); 
const statusMessage = document.getElementById('status-message');
const newsList = document.getElementById('news-list'); 
const controllerStatusDiv = document.getElementById('controller-status'); 
const dropArea = document.getElementById('game-grid'); 

// Global state and core interfaces
let currentView = homeScreen;
let inputManager = window.InputManagerInstance; 
let switchCore = null; 

const EmulatorShell = {
    // --- 1. VIEW MANAGEMENT ---
    switchView: function(targetView) {
        currentView.classList.remove('active-view');
        currentView.classList.add('inactive-view');
        
        targetView.classList.remove('inactive-view');
        targetView.classList.add('active-view');
        currentView = targetView;

        if (targetView === homeScreen && emulationView.classList.contains('active-view')) {
            console.log("Emulation process terminated by user. Returning home.");
            const runningTile = dropArea.querySelector('.game-tile.running');
            if (runningTile) runningTile.remove();
            
            const newPlaceholder = document.createElement('div');
            newPlaceholder.className = 'game-tile';
            newPlaceholder.setAttribute('data-placeholder', 'true');
            newPlaceholder.textContent = 'Drop .NSP/.XCI Here';
            dropArea.insertBefore(newPlaceholder, dropArea.firstChild);
        }
    },

    returnToHome: function() {
        this.switchView(homeScreen);
        statusMessage.textContent = "Status: Web Emu-1 Ready.";
    },

    // --- 2. SYSTEM FEATURES ---
    
    // A. Real-Time Clock & Status
    updateClock: function() {
        const now = new Date();
        const timeString = now.toLocaleTimeString('en-US', {
            hour: '2-digit', minute: '2-digit', hour12: true
        });
        timeSpan.textContent = timeString;
        
        // Update Status Icons
        const batteryIcon = '<span style="color:#35ff35;">FULL BATT</span>';
        const wifiIcon = '<span style="color:#00c0ff;">WIFI</span>';
        statusIconsSpan.innerHTML = `${wifiIcon} | ${batteryIcon}`;
    },

    // B. REAL-TIME NEWS FEED (Using a reliable CORS Proxy)
    loadNewsFeed: async function() {
        newsList.innerHTML = '<h4>Loading real-time Nintendo-related news...</h4>'; 
        this.switchView(newsView);
        
        // Fetching Google News RSS feed for "Nintendo Switch news"
        const RSS_URL = 'https://news.google.com/rss/search?q=nintendo+switch+news&hl=en-US&gl=US&ceid=US:en'; 
        // Using api.allorigins.win as a reliable CORS proxy service
        const PROXY_URL = `https://api.allorigins.win/get?url=${encodeURIComponent(RSS_URL)}`;
        
        try {
            const response = await fetch(PROXY_URL);
            const data = await response.json();
            
            const parser = new DOMParser();
            // Parse the XML content returned by the proxy
            const xmlDoc = parser.parseFromString(data.contents, "text/xml");
            const items = xmlDoc.querySelectorAll('item');

            if (items.length === 0) {
                 throw new Error("News feed returned no items.");
            }
            
            newsList.innerHTML = ''; 
            
            items.forEach((item, index) => { 
                if (index >= 8) return; 
                
                const title = item.querySelector('title')?.textContent || 'Untitled Article';
                const link = item.querySelector('link')?.textContent || '#';
                const pubDate = new Date(item.querySelector('pubDate')?.textContent).toLocaleDateString();

                const div = document.createElement('div');
                div.className = 'news-item menu-item';
                div.innerHTML = `
                    <h4>${title}</h4>
                    <p>${pubDate} | Click to view source</p>
                `;
                div.onclick = () => window.open(link, '_blank'); 
                newsList.appendChild(div);
            });
            
        } catch (error) {
            console.error("Failed to fetch real-time news:", error);
            newsList.innerHTML = '<h4>🚫 Connection failed. Ensure server headers allow API calls.</h4>';
        }
    },

    // C. WORKING CONTROLLER PAIRING (Robust Gamepad API Polling)
    startPairing: function() {
        this.switchView(pairView);
        this.updateControllerStatus(); // Initial call
        
        // Start polling loop for continuous status check
        this.pollingId = requestAnimationFrame(this.pollGamepadStatus.bind(this));
    },

    updateControllerStatus: function() {
        // Must call navigator.getGamepads() inside the polling loop for current state
        const gamepads = navigator.getGamepads().filter(g => g !== null);
        controllerStatusDiv.innerHTML = '';
        
        if (gamepads.length === 0) {
            controllerStatusDiv.innerHTML = '<div class="controller-info pending">No controllers detected. Press a button or plug one in!</div>';
        } else {
            gamepads.forEach((g, i) => {
                // Simplified ID extraction for better cross-browser compatibility
                const readableID = g.id.split(' ').slice(0, 4).join(' ') || `Controller ${i + 1}`;

                controllerStatusDiv.innerHTML += `
                    <div class="controller-info active">
                        Controller ${i + 1}: ${g.mapping === 'standard' ? 'Standard' : 'Custom'} - ID: ${readableID}
                    </div>
                `;
            });
        }
    },
    
    pollGamepadStatus: function() {
        this.updateControllerStatus(); 
        
        if (currentView === pairView) {
            this.pollingId = requestAnimationFrame(this.pollGamepadStatus.bind(this));
        } else if (this.pollingId) {
            cancelAnimationFrame(this.pollingId);
            this.pollingId = null;
        }
    },

    // --- 3. EMULATION EXECUTION ---
    startEmulation: async function(gameDataArrayBuffer, gameName) {
        if (!window.WASM_SWITCH_CORE) {
             statusMessage.innerHTML = '<span style="color:red; font-weight:bold;">ERROR: Wasm Core Unloaded.</span> Fix server headers!';
             return;
        }

        statusMessage.textContent = `Loading ${gameName} into 4 Wasm Threads...`;
        switchCore = window.WASM_SWITCH_CORE;
        
        const success = switchCore.loadGame(gameDataArrayBuffer, gameName);
        if (!success) return;

        this.switchView(emulationView);
        requestAnimationFrame(this.mainThreadLoop.bind(this));
        statusMessage.textContent = "Emulation Running... (AOT & WebGPU Active)";
    },

    mainThreadLoop: function() {
        const inputState = inputManager.pollInput();
        window.WASM_SWITCH_CORE.runCycle(inputState);
        
        if (currentView === emulationView) {
             requestAnimationFrame(this.mainThreadLoop.bind(this));
        }
    },
    
    // --- 4. INITIALIZATION ---
    init: function() {
        window.EmulatorShell = this;
        
        // --- FIX A: Robust Event Delegation for Feature Tiles (All menu and tile actions) ---
        document.getElementById('emulator-container').addEventListener('click', (e) => {
            const actionElement = e.target.closest('[data-action]');
            if (!actionElement) return;

            const action = actionElement.getAttribute('data-action');
            console.log(`Tile clicked: ${action}`);

            switch (action) {
                case 'settings': this.switchView(settingsView); break;
                case 'exit-settings': this.returnToHome(); break;
                case 'news': this.loadNewsFeed(); break;
                case 'exit-news': this.returnToHome(); break;
                case 'pair': this.startPairing(); break;
                case 'exit-pair': this.returnToHome(); break;
                case 'album': 
                    // Functional, dynamic simulation
                    statusMessage.textContent = "Album: Fetching local screenshots... (Loading image data)";
                    setTimeout(() => {
                        statusMessage.textContent = "Album: Found 3 simulated screenshots. Ready to display!";
                    }, 1000);
                    break;
                case 'eshop': statusMessage.textContent = "eShop: Access denied. (Requires Nintendo Network Authentication)."; break;
            }
        });
    }
};

// --- DRAG AND DROP: GLOBAL, HIGH-PRIORITY FIXES ---

const handleDragEvents = (e) => {
    // CRITICAL: Prevent default browser behavior (stops file loading and drop failure)
    e.preventDefault(); 
    e.stopPropagation();

    if (currentView !== homeScreen) return;

    // Check if the event is happening over the designated drop area
    const rect = dropArea.getBoundingClientRect();
    const isOverDropArea = (
        e.clientX >= rect.left &&
        e.clientX <= rect.right &&
        e.clientY >= rect.top &&
        e.clientY <= rect.bottom
    );
    
    // Visual Feedback (Highlighting the drop zone)
    if (isOverDropArea) {
        if (e.type === 'dragenter' || e.type === 'dragover') {
            dropArea.classList.add('active');
        } 
    } else {
        dropArea.classList.remove('active');
    }

    // Handle the actual file drop
    if (e.type === 'drop') {
        dropArea.classList.remove('active');
        if (isOverDropArea) {
            const file = e.dataTransfer.files[0];
            // Check for valid extensions
            if (file && file.name.toLowerCase().match(/\.(nsp|xci)$/)) {
                 
                 // Create the running tile placeholder
                 const runningTile = document.createElement('div');
                 runningTile.className = 'game-tile running';
                 runningTile.textContent = file.name.split('.')[0] || "New Game Title";
                 const dropPlaceholder = dropArea.querySelector('.game-tile[data-placeholder="true"]');
                 if (dropPlaceholder) dropArea.replaceChild(runningTile, dropPlaceholder);

                 const reader = new FileReader();
                 // Call the START EMULATION FUNCTION from the shell object
                 reader.onload = (event) => EmulatorShell.startEmulation(event.target.result, file.name);
                 reader.readAsArrayBuffer(file);

            } else {
                 statusMessage.textContent = "Error: Please drop a valid .NSP or .XCI file, not a compressed archive.";
            }
        }
    }
};

// Attach listeners to the window for maximum capture reliability
window.addEventListener('dragenter', handleDragEvents, false);
window.addEventListener('dragover', handleDragEvents, false);
window.addEventListener('dragleave', handleDragEvents, false);
window.addEventListener('drop', handleDragEvents, false);

// --- INITIALIZATION ---

document.addEventListener('DOMContentLoaded', () => {
    EmulatorShell.init();
    EmulatorShell.updateClock();
    // Start interval after init to ensure clock element is bound.
    setInterval(EmulatorShell.updateClock, 1000); 
});
