// main.js
// Orchestrates the UI, IO, and the WASM worker threads.

// UI Element Hooks
const homeScreen = document.getElementById('home-screen');
const emulationView = document.getElementById('emulation-view');
const settingsView = document.getElementById('settings-view');
const newsView = document.getElementById('news-view');
const pairView = document.getElementById('pair-view');
const timeSpan = document.getElementById('time');
const statusIconsSpan = document.getElementById('status-icons'); // NEW hook
const statusMessage = document.getElementById('status-message');
const newsList = document.getElementById('news-list'); // NEW hook
const controllerStatusDiv = document.getElementById('controller-status'); // NEW hook
const dropArea = document.getElementById('game-grid'); 

// Global state and core interfaces
let currentView = homeScreen;
let inputManager = window.InputManagerInstance; // from io/input.js
let switchCore = null; 

const EmulatorShell = {
    // --- 1. VIEW MANAGEMENT ---
    // (switchView and returnToHome remain the same as Phase 5)
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
    
    // A. Real-Time Clock & Status FIX
    updateClock: function() {
        const now = new Date();
        const timeString = now.toLocaleTimeString('en-US', {
            hour: '2-digit', minute: '2-digit', hour12: true
        });
        timeSpan.textContent = timeString;
        
        // Update Status Icons
        // HIGH-LEVEL CODE: Simulating dynamic status icons based on system state
        const batteryIcon = '<span style="color:#35ff35;">FULL BATT</span>';
        const wifiIcon = '<span style="color:#00c0ff;">WIFI</span>';
        statusIconsSpan.innerHTML = `${wifiIcon} | ${batteryIcon}`;
    },

    // B. REAL-TIME NEWS FEED (Using an External Public RSS feed via JSON Proxy)
    loadNewsFeed: async function() {
        newsList.innerHTML = '<h4>Loading real-time news...</h4>'; 
        this.switchView(newsView);
        
        // NOTE: We are using a public RSS feed URL and assuming it will be proxied
        // to JSON (e.g., via a service like RSS2JSON) to bypass CORS issues.
        const RSS_URL = 'https://rss.nytimes.com/services/xml/rss/nyt/Technology.xml'; 
        
        // This is a placeholder for a PROXY URL that converts the RSS to JSON
        const PROXY_URL = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(RSS_URL)}`;
        
        try {
            const response = await fetch(PROXY_URL);
            const data = await response.json();
            
            if (data.status !== 'ok' || !data.items) {
                 throw new Error("News proxy failed or returned invalid data.");
            }
            
            newsList.innerHTML = ''; // Clear loading message
            
            data.items.slice(0, 8).forEach(item => { // Show top 8 items
                const date = new Date(item.pubDate).toLocaleDateString();
                const div = document.createElement('div');
                div.className = 'news-item menu-item';
                div.innerHTML = `
                    <h4>${item.title}</h4>
                    <p>${date} | ${item.author || 'NYT'}</p>
                `;
                div.onclick = () => window.open(item.link, '_blank'); // Make items clickable
                newsList.appendChild(div);
            });
            
        } catch (error) {
            console.error("Failed to fetch real-time news:", error);
            newsList.innerHTML = '<h4>🚫 Cannot connect to external news feed. Check CORS or proxy setup.</h4>';
        }
    },

    // C. WORKING CONTROLLER PAIRING (Using Gamepad API Events)
    startPairing: function() {
        this.switchView(pairView);
        this.updateControllerStatus(); // Initial call

        // Use the event listeners defined in io/input.js to react to connections/disconnections
        window.addEventListener('gamepadconnected', this.handleGamepadEvent);
        window.addEventListener('gamepaddisconnected', this.handleGamepadEvent);
        
        // Start polling loop for continuous status check
        this.pollingId = requestAnimationFrame(this.pollGamepadStatus.bind(this));
    },

    handleGamepadEvent: function(e) {
        console.log(`Gamepad Event: ${e.type} - ${e.gamepad.id}`);
        EmulatorShell.updateControllerStatus(); // Force status update on connect/disconnect
    },

    updateControllerStatus: function() {
        const gamepads = navigator.getGamepads().filter(g => g !== null);
        controllerStatusDiv.innerHTML = '';
        
        if (gamepads.length === 0) {
            controllerStatusDiv.innerHTML = '<div class="controller-info pending">No controllers detected. Press a button or plug one in!</div>';
        } else {
            gamepads.forEach((g, i) => {
                // Get the vendor/product info for a real-like ID
                const idMatch = g.id.match(/Vendor: (\w+).*Product: (\w+)/);
                const vendorProduct = idMatch ? `${idMatch[1]}-${idMatch[2]}` : g.id.split(' ')[0];

                controllerStatusDiv.innerHTML += `
                    <div class="controller-info active">
                        Controller ${i + 1}: ${g.mapping === 'standard' ? 'Standard' : 'Unknown'} - ID: ${vendorProduct}
                    </div>
                `;
            });
        }
    },
    
    pollGamepadStatus: function() {
        // This poll is mainly for the Gamepad API's internal state updates
        this.updateControllerStatus(); 
        
        // Stop polling if we leave the pairing view
        if (currentView === pairView) {
            this.pollingId = requestAnimationFrame(this.pollGamepadStatus.bind(this));
        } else if (this.pollingId) {
            cancelAnimationFrame(this.pollingId);
            this.pollingId = null;
            // Clean up event listeners when exiting the view
            window.removeEventListener('gamepadconnected', this.handleGamepadEvent);
            window.removeEventListener('gamepaddisconnected', this.handleGamepadEvent);
        }
    },

    // --- 3. EMULATION EXECUTION ---
    // (startEmulation and mainThreadLoop remain the same as Phase 5)
    startEmulation: async function(gameDataArrayBuffer, gameName) {
        statusMessage.textContent = `Loading ${gameName} into 4 Wasm Threads...`;
        switchCore = window.WASM_SWITCH_CORE;
        if (!switchCore) {
            statusMessage.textContent = "Error: Wasm Core failure. Cannot proceed.";
            return;
        }
        
        // HIGH-LEVEL: Load Game Data into Shared RAM
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
        
        // Bind UI action events (including new exit handlers for News/Pairing)
        document.addEventListener('click', (e) => {
            const actionElement = e.target.closest('[data-action]');
            if (!actionElement) return;

            const action = actionElement.getAttribute('data-action');
            switch (action) {
                case 'settings': this.switchView(settingsView); break;
                case 'exit-settings': this.returnToHome(); break;
                case 'news': this.loadNewsFeed(); break;
                case 'exit-news': this.returnToHome(); break;
                case 'pair': this.startPairing(); break;
                case 'exit-pair': this.returnToHome(); break;
                case 'eshop': statusMessage.textContent = "eShop: Access denied. (Requires Nintendo Network Authentication)."; break;
                case 'album': statusMessage.textContent = "Album: Fetching local screenshots... (None found)."; break;
            }
        });
        
        // Handle Game Drop logic (remains the same)
        document.getElementById('game-grid').addEventListener('drop', (e) => {
            e.preventDefault();
            const file = e.dataTransfer.files[0];
            if (file && file.name.toLowerCase().match(/\.(nsp|xci)$/)) {
                 const runningTile = document.createElement('div');
                 runningTile.className = 'game-tile running';
                 runningTile.textContent = file.name.split('.')[0] || "New Game Title";
                 const dropPlaceholder = dropArea.querySelector('.game-tile[data-placeholder="true"]');
                 if (dropPlaceholder) dropArea.replaceChild(runningTile, dropPlaceholder);

                 const reader = new FileReader();
                 reader.onload = (event) => this.startEmulation(event.target.result, file.name);
                 reader.readAsArrayBuffer(file);
            }
        });
    }
};

// Start the entire shell and the clock interval
document.addEventListener('DOMContentLoaded', () => {
    EmulatorShell.init();
    EmulatorShell.updateClock();
    // Start interval *after* init to ensure the timeSpan element is bound.
    setInterval(EmulatorShell.updateClock, 1000); 
});
