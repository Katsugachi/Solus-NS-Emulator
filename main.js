// main.js
// Orchestrates the UI, IO, and the WASM worker threads.

// UI Element Hooks
const homeScreen = document.getElementById('home-screen');
const emulationView = document.getElementById('emulation-view');
const settingsView = document.getElementById('settings-view');
const newsView = document.getElementById('news-view');
const pairView = document.getElementById('pair-view');
const timeSpan = document.getElementById('time');
const statusMessage = document.getElementById('status-message');
const dropArea = document.getElementById('game-grid'); 

// Global state and core interfaces
let currentView = homeScreen;
let inputManager = window.InputManagerInstance; // from io/input.js
let switchCore = null; // from core/wasm-loader.js

const EmulatorShell = {
    // --- 1. VIEW MANAGEMENT ---
    switchView: function(targetView) {
        currentView.classList.remove('active-view');
        currentView.classList.add('inactive-view');
        
        targetView.classList.remove('inactive-view');
        targetView.classList.add('active-view');
        currentView = targetView;

        // Special logic for exiting emulation
        if (targetView === homeScreen && emulationView.classList.contains('active-view')) {
            // HIGH-LEVEL CODE: Send shutdown signal to WASM workers
            // window.WASM_SWITCH_CORE.shutdown();
            console.log("Emulation process terminated by user. Returning home.");
            
            // Re-enable the drop placeholder
            const runningTile = dropArea.querySelector('.game-tile.running');
            if (runningTile) {
                 runningTile.remove();
            }
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
    
    // A. Real-Time Clock
    updateClock: function() {
        const now = new Date();
        timeSpan.textContent = now.toLocaleTimeString('en-US', {
            hour: '2-digit', minute: '2-digit', hour12: true
        });
        // Check current date/time to simulate a successful system status check
        const date = now.toLocaleDateString();
    },

    // B. Real-Time News Feed
    loadNewsFeed: function() {
        const newsList = document.getElementById('news-list');
        newsList.innerHTML = ''; // Clear existing
        
        const mockNews = [
            { title: "New Patch v1.0.0.1 for Tears of the Kingdom", body: "Performance improvements implemented in the AOT Transpilation layer." },
            { title: "eShop Maintenance", body: "Simulated eShop is offline until 04:00 AM (Check back later)." },
            { title: "Wasm Security Alert", body: "Ensure COEP/COOP headers are correctly set for multithreading stability." },
        ];
        
        mockNews.forEach(item => {
            const div = document.createElement('div');
            div.className = 'news-item';
            div.innerHTML = `<h4>${item.title}</h4><p>${item.body}</p>`;
            newsList.appendChild(div);
        });
        this.switchView(newsView);
    },

    // C. Controller Pairing
    startPairing: function() {
        this.switchView(pairView);
        const statusDiv = document.getElementById('controller-status');
        let controllerCount = 0;
        
        statusDiv.innerHTML = '<div class="controller-info pending">Scanning for controllers...</div>';

        // HIGH-LEVEL SIMULATION: Polling the Gamepad API
        const pollControllers = () => {
            const gamepads = navigator.getGamepads().filter(g => g !== null);
            
            if (gamepads.length > controllerCount) {
                // Controller connected since last check
                controllerCount = gamepads.length;
                statusDiv.innerHTML += `<div class="controller-info active">Controller ${controllerCount}: ${gamepads[controllerCount - 1].id} PAIRED</div>`;
            } else if (gamepads.length === 0) {
                 statusDiv.innerHTML = '<div class="controller-info pending">No controllers found. Plug one in!</div>';
            } else if (statusDiv.innerHTML.includes("Scanning")) {
                 statusDiv.innerHTML = gamepads.map((g, i) => `<div class="controller-info active">Controller ${i + 1}: ${g.id} PAIRED</div>`).join('');
            }

            // Keep scanning until user exits view
            if (currentView === pairView) {
                requestAnimationFrame(pollControllers);
            }
        };
        pollControllers();
    },


    // --- 3. EMULATION EXECUTION ---
    startEmulation: async function(gameDataArrayBuffer, gameName) {
        statusMessage.textContent = `Loading ${gameName} into 4 Wasm Threads...`;

        switchCore = window.WASM_SWITCH_CORE;
        if (!switchCore) {
            statusMessage.textContent = "Error: Wasm Core failure. Cannot proceed.";
            return;
        }
        
        // Load Game Data into Shared RAM
        const success = switchCore.loadGame(gameDataArrayBuffer, gameName);
        if (!success) return;

        // UI Transition: Home -> Emulation View
        this.switchView(emulationView);
        
        // Start the Main Thread's V-Sync loop
        requestAnimationFrame(this.mainThreadLoop.bind(this));
        statusMessage.textContent = "Emulation Running... (AOT & WebGPU Active)";
    },

    mainThreadLoop: function() {
        // 1. Input Poll: Get user input
        const inputState = inputManager.pollInput();
        
        // 2. Cycle Kick: Send input and trigger next cycle on Worker Core 0
        window.WASM_SWITCH_CORE.runCycle(inputState);
        
        // 3. Loop continuation
        if (currentView === emulationView) {
             requestAnimationFrame(this.mainThreadLoop.bind(this));
        }
    },
    
    // --- 4. INITIALIZATION ---
    init: function() {
        // Set the global object
        window.EmulatorShell = this;
        
        // Bind UI action events
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
                case 'eshop': statusMessage.textContent = "eShop: Connection failed (Simulated)."; break;
                case 'album': statusMessage.textContent = "Album: No screenshots found (Simulated)."; break;
            }
        });
        
        // Handle Game Drop logic
        document.getElementById('game-grid').addEventListener('drop', (e) => {
            e.preventDefault();
            const file = e.dataTransfer.files[0];
            if (file && file.name.toLowerCase().match(/\.(nsp|xci)$/)) {
                 // Create the running tile placeholder immediately
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

// Start the entire shell when the script executes
document.addEventListener('DOMContentLoaded', () => {
    EmulatorShell.init();
    EmulatorShell.updateClock();
});
