// io/input.js
// HIGH-LEVEL CODE: Gamepad and Keyboard mapping abstraction.

const SWITCH_INPUT_STATE = {
    A: false, B: false, X: false, Y: false,
    R: false, L: false, ZR: false, ZL: false,
    PLUS: false, MINUS: false, HOME: false, CAPTURE: false,
    L_STICK: { X: 0.0, Y: 0.0 },
    R_STICK: { X: 0.0, Y: 0.0 }
};

class InputManager {
    constructor() {
        this.gamepadIndex = null;
        window.addEventListener('gamepadconnected', (e) => this.handleConnect(e));
        window.addEventListener('gamepaddisconnected', (e) => this.handleDisconnect(e));
    }

    handleConnect(e) {
        this.gamepadIndex = e.gamepad.index;
        console.log(`Input: Gamepad connected (Index: ${this.gamepadIndex}).`);
    }

    handleDisconnect(e) {
        if (e.gamepad.index === this.gamepadIndex) {
            this.gamepadIndex = null;
            console.log("Input: Gamepad disconnected.");
        }
    }

    /**
     * HIGH-LEVEL CODE: Polls browser input and translates it to Switch state.
     * @returns {Object} SwitchInputState
     */
    pollInput() {
        const gamepads = navigator.getGamepads();
        const gamepad = this.gamepadIndex !== null ? gamepads[this.gamepadIndex] : null;

        if (gamepad) {
            // Simplified Button Mapping for PoC
            SWITCH_INPUT_STATE.A = gamepad.buttons[0]?.pressed || false; 
            SWITCH_INPUT_STATE.B = gamepad.buttons[1]?.pressed || false;
            SWITCH_INPUT_STATE.PLUS = gamepad.buttons[9]?.pressed || false;
            
            SWITCH_INPUT_STATE.L_STICK.X = Math.abs(gamepad.axes[0]) > 0.1 ? gamepad.axes[0] : 0.0;
            SWITCH_INPUT_STATE.L_STICK.Y = Math.abs(gamepad.axes[1]) > 0.1 ? gamepad.axes[1] : 0.0;
            // Full implementation handles dead zones, sensitivity, and calibration
        } else {
            // Default to neutral state if no gamepad is active
            Object.keys(SWITCH_INPUT_STATE).forEach(key => {
                if (typeof SWITCH_INPUT_STATE[key] === 'boolean') SWITCH_INPUT_STATE[key] = false;
                else if (typeof SWITCH_INPUT_STATE[key] === 'object') {
                    SWITCH_INPUT_STATE[key].X = 0.0;
                    SWITCH_INPUT_STATE[key].Y = 0.0;
                }
            });
        }

        return SWITCH_INPUT_STATE;
    }
}

window.InputManagerInstance = new InputManager();
