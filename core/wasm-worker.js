// core/wasm-worker.js
// HIGH-LEVEL CODE: The core emulation loop running on a separate thread.

let cpuCore = null; 
let gpuLayer = null; 

onmessage = async function(e) {
    const data = e.data;
    
    if (data.command === 'init') {
        // Initialize the CPU on this worker's thread
        cpuCore = new window.AOT_CPUCore(data.sharedRam, data.coreId);
        
        if (data.canvas) {
            // Worker 0 is the GPU/I/O thread
            gpuLayer = new window.WebGPU_GPULayer(data.canvas);
            await gpuLayer.initialize();
            startCoreExecution(); // Start the main loop on the graphics/scheduling core
        } else {
            // Other workers are purely computational cores
            startCoreExecution(); // Start the continuous computation loop
        }
        
    } else if (data.command === 'load') {
        console.log(`Worker ${data.coreId}: Game ${data.gameName} loaded and ready.`);
        
    } else if (data.command === 'run_cycle') {
        // This command is primarily sent to Core 0 (I/O scheduler)
        if (data.coreId === 0) {
            // HIGH-LEVEL CODE: Process input state (data.state)
            
            // Run the CPU for a cycle chunk
            const gpuCommands = cpuCore.executeCycleChunk();
            
            // If the CPU generated graphics commands, pass them to the GPU
            if (gpuCommands && gpuLayer) {
                gpuLayer.translateAndDraw(gpuCommands); // Render on the offscreen canvas
            }
        }
    }
};

/**
 * The continuous, non-stop loop for the background CPU cores.
 * In a real Wasm emulator, this uses a tight Wasm loop with Atomics.wait/notify
 * to manage thread scheduling and minimize overhead.
 */
function startCoreExecution() {
    function workerLoop() {
        // Core 0 handles the V-Sync loop driven by main.js's requestAnimationFrame.
        // Other cores run continuously, crunching background tasks (e.g., audio, physics, AI)
        if (cpuCore.coreId !== 0) {
            cpuCore.executeCycleChunk(); 
        }
        
        // Use setTimeout to avoid blocking the worker's message queue, allowing
        // for communication with the main thread.
        setTimeout(workerLoop, 0); 
    }
    workerLoop();
}

// NOTE: AOT_CPUCore and WebGPU_GPULayer definitions are loaded via the script includes in index.html, 
// making them available on the worker via the global scope (window).
