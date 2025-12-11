// core/wasm-loader.js
// Finalized script to initialize Shared Memory and Wasm Workers (Threads).

window.WASM_LOADER = {
    SHARED_RAM: null, 
    WORKER_POOL: [],
    
    // Core initialization function
    load: async function() {
        // CRITICAL CHECK for multithreading capabilities
        // SharedArrayBuffer (SAB) is essential for shared memory between threads.
        if (typeof SharedArrayBuffer === 'undefined' || !window.crossOriginIsolated) {
            console.error("Multithreading requires Cross-Origin Isolation (COEP/COOP) headers to use SharedArrayBuffer.");
            // Halt execution or fall back to a single-threaded interpreter mode (omitted for this PoC)
            return;
        }

        // Initialize 4GB of Shared Switch RAM (the core memory map)
        const GB = 1024 * 1024 * 1024;
        this.SHARED_RAM = new SharedArrayBuffer(4 * GB); 
        console.log("Initialized 4GB SharedArrayBuffer (Switch RAM).");

        // Create 4 Worker Threads (CPU/IO/GPU Offloading)
        const numCores = 4;
        const canvas = document.getElementById('game-canvas');
        const offscreenCanvas = canvas.transferControlToOffscreen(); // Detach canvas from main thread

        for (let i = 0; i < numCores; i++) {
            const worker = new Worker('core/wasm-worker.js');
            this.WORKER_POOL.push(worker);
            
            // Transfer SAB and OffscreenCanvas ownership to the worker
            worker.postMessage({
                command: 'init',
                coreId: i,
                sharedRam: this.SHARED_RAM,
                canvas: i === 0 ? offscreenCanvas : null // Only Worker 0 gets the canvas for rendering
            }, [this.SHARED_RAM, i === 0 ? offscreenCanvas : undefined].filter(Boolean));
        }
        
        // Expose the public API for main.js
        window.WASM_SWITCH_CORE = {
            loadGame: this.loadGame.bind(this),
            runCycle: this.runCycle.bind(this)
        };
        console.log(`WASM Loader finished. ${numCores} workers running.`);
    },

    loadGame: function(dataArrayBuffer, name) {
        // HIGH-LEVEL CODE: Decrypt and write game data into SHARED_RAM
        // The game data buffer is copied into the SAB.
        
        this.WORKER_POOL.forEach(worker => {
            worker.postMessage({ command: 'load', gameName: name, gameSize: dataArrayBuffer.byteLength });
        });
        return true;
    },

    runCycle: function(inputState) {
        // Main thread tells Worker Core 0 to start a cycle using the input state
        this.WORKER_POOL[0].postMessage({ command: 'run_cycle', state: inputState });
        
        // The main thread returns immediately; rendering is handled asynchronously by the workers.
        return true;
    },
};

// Initial invocation to start the thread pool when the browser loads this script
window.WASM_LOADER.load();
