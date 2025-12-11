// io/audio.js
// HIGH-LEVEL CODE: Web Audio API integration for low-latency output.

class AudioManager {
    constructor() {
        this.audioContext = null;
        this.sampleRate = 48000; // Standard Switch audio rate
        this.bufferSize = 2048; 
    }

    initialize() {
        if (!window.AudioContext && !window.webkitAudioContext) {
            console.warn("Audio: Browser does not support Web Audio API.");
            return;
        }
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        console.log("Audio Manager initialized.");
    }

    /**
     * HIGH-LEVEL CODE: Queues raw audio data received from the Wasm core.
     * @param {Array} audioSamples - Array of PCM audio samples (stereo L/R).
     */
    queueAudio(audioSamples) {
        if (!this.audioContext || audioSamples.length === 0) return;

        // Create a buffer source node
        const buffer = this.audioContext.createBuffer(2, audioSamples.length / 2, this.audioContext.sampleRate);
        const leftChannel = buffer.getChannelData(0);
        const rightChannel = buffer.getChannelData(1);
        
        // This is a complex loop to interleave/de-interleave the samples from the Wasm output
        for (let i = 0; i < audioSamples.length / 2; i++) {
            leftChannel[i] = audioSamples[i * 2];
            rightChannel[i] = audioSamples[i * 2 + 1];
        }

        const source = this.audioContext.createBufferSource();
        source.buffer = buffer;
        source.connect(this.audioContext.destination);
        
        // Play the buffer immediately after the current time
        source.start(this.audioContext.currentTime);
    }
}

window.AudioManager = AudioManager;
