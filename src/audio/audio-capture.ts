/**
 * Audio capture module — abstracts system audio loopback capture.
 *
 * On Windows, uses WASAPI loopback via a PowerShell helper that streams
 * raw audio levels over stdout.
 *
 * On macOS, uses the built-in Core Audio through a companion helper.
 *
 * Falls back to a simulated audio source for development/testing.
 */

import { type ChildProcess, spawn } from "node:child_process";
import { EventEmitter } from "events";
import * as path from "path";
import * as fs from "fs";
import {
  SAMPLE_RATE,
  FRAME_SIZE,
  HISTORY_LENGTH,
  MIN_SENSITIVITY,
  FALL_SPEED_PER_SEC,
  ATTACK_SPEED,
  PEAK_HOLD_TIME_MS,
  PEAK_FALL_SPEED_PER_SEC,
} from "../utils/constants";

export interface AudioLevels {
  left: number;    // 0.0 - 1.0 normalized level
  right: number;   // 0.0 - 1.0 normalized level
  peakLeft: number;
  peakRight: number;
  mono: number;    // combined mono level
}

export type SensitivityMode = "auto" | "manual";

export type AudioCaptureState = "running" | "error" | "recovering" | "stopped";

export class AudioCapture extends EventEmitter {
  private process: ChildProcess | null = null;
  private running = false;
  private sensitivity = 1.0;

  // Sensitivity mode
  private sensitivityMode: SensitivityMode = "auto";
  private manualSensitivity = 1.0; // 0.1 to 10.0, used when mode is "manual"

  // Smoothed display values
  private displayLeft = 0;
  private displayRight = 0;

  // Peak hold
  private peakLeft = 0;
  private peakRight = 0;
  private peakLeftTime = 0;
  private peakRightTime = 0;

  // History for adaptive sensitivity
  private history: number[] = [];

  // Simulation timer for dev mode
  private simTimer: ReturnType<typeof setInterval> | null = null;

  // Time tracking for frame-rate-independent decay
  private lastProcessTime = 0;

  // Error recovery state
  private state: AudioCaptureState = "stopped";
  private retryCount = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly MAX_RETRIES = 10;
  private readonly BASE_RETRY_MS = 1000;

  // Device change detection
  private devicePollTimer: ReturnType<typeof setInterval> | null = null;
  private currentDeviceName = "";
  private readonly DEVICE_POLL_INTERVAL_MS = 3000;

  start(): void {
    if (this.running) return;
    this.running = true;
    this.retryCount = 0;
    this.setState("running");

    if (process.platform === "win32") {
      this.startWindows();
      this.startDevicePolling();
    } else if (process.platform === "darwin") {
      this.startMacOS();
      this.startDevicePolling();
    } else {
      this.startSimulated();
    }
  }

  stop(): void {
    this.running = false;
    this.setState("stopped");
    this.stopDevicePolling();
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
    if (this.process) {
      this.process.kill();
      this.process = null;
    }
    if (this.simTimer) {
      clearInterval(this.simTimer);
      this.simTimer = null;
    }
  }

  private setState(state: AudioCaptureState): void {
    if (this.state !== state) {
      this.state = state;
      this.emit("stateChange", state);
    }
  }

  getState(): AudioCaptureState {
    return this.state;
  }

  /**
   * Schedule a retry with exponential backoff.
   * Backoff: 1s, 2s, 4s, capped at 5s.
   */
  private scheduleRetry(startFn: () => void): void {
    if (!this.running) return;

    this.retryCount++;
    if (this.retryCount > this.MAX_RETRIES) {
      console.error("Audio capture: max retries exceeded, falling back to simulation");
      this.retryCount = 0;
      this.startSimulated();
      return;
    }

    const delay = Math.min(this.BASE_RETRY_MS * Math.pow(2, this.retryCount - 1), 5000);
    this.setState("recovering");
    console.log(`Audio capture: retrying in ${delay}ms (attempt ${this.retryCount}/${this.MAX_RETRIES})`);

    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      if (this.running) {
        startFn();
      }
    }, delay);
  }

  /**
   * Windows: Use PowerShell + NAudio to capture WASAPI loopback.
   * We spawn a PowerShell script that outputs "left,right" float pairs per line.
   */
  private startWindows(): void {
    const helperPath = path.join(__dirname, "..", "helpers", "audio-capture-win.ps1");
    if (!fs.existsSync(helperPath)) {
      console.warn("Windows audio helper not found, falling back to simulation");
      this.startSimulated();
      return;
    }

    try {
      this.process = spawn("powershell.exe", [
        "-ExecutionPolicy", "Bypass",
        "-File", helperPath,
        "-SampleRate", String(SAMPLE_RATE),
        "-FrameSize", String(FRAME_SIZE),
      ]);
    } catch (err) {
      console.error("Failed to spawn Windows audio helper:", err);
      this.setState("error");
      this.scheduleRetry(() => this.startWindows());
      return;
    }

    this.setState("running");
    this.retryCount = 0;

    let buffer = "";
    this.process.stdout?.on("data", (data: Buffer) => {
      buffer += data.toString();
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        const parts = trimmed.split(",");
        if (parts.length >= 2) {
          const rawLeft = parseFloat(parts[0]);
          const rawRight = parseFloat(parts[1]);
          if (!isNaN(rawLeft) && !isNaN(rawRight)) {
            this.processLevels(rawLeft, rawRight);
          }
        }
      }
    });

    this.process.stderr?.on("data", (data: Buffer) => {
      console.warn("Audio helper stderr:", data.toString().trim());
    });

    this.process.on("error", (err) => {
      console.error("Audio capture process error:", err.message);
      this.process = null;
      this.setState("error");
      this.scheduleRetry(() => this.startWindows());
    });

    this.process.on("exit", (code) => {
      this.process = null;
      if (this.running) {
        console.log(`Audio capture process exited (code ${code}), scheduling retry...`);
        this.setState("error");
        this.scheduleRetry(() => this.startWindows());
      }
    });
  }

  /**
   * macOS: Use a helper script that captures from the default output device.
   */
  private startMacOS(): void {
    const helperPath = path.join(__dirname, "..", "helpers", "audio-capture-mac.sh");
    if (!fs.existsSync(helperPath)) {
      console.warn("macOS audio helper not found, falling back to simulation");
      this.startSimulated();
      return;
    }

    try {
      this.process = spawn("bash", [helperPath]);
    } catch (err) {
      console.error("Failed to spawn macOS audio helper:", err);
      this.setState("error");
      this.scheduleRetry(() => this.startMacOS());
      return;
    }

    this.setState("running");
    this.retryCount = 0;

    let buffer = "";
    this.process.stdout?.on("data", (data: Buffer) => {
      buffer += data.toString();
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        const parts = trimmed.split(",");
        if (parts.length >= 2) {
          const rawLeft = parseFloat(parts[0]);
          const rawRight = parseFloat(parts[1]);
          if (!isNaN(rawLeft) && !isNaN(rawRight)) {
            this.processLevels(rawLeft, rawRight);
          }
        }
      }
    });

    this.process.stderr?.on("data", (data: Buffer) => {
      console.warn("Audio helper stderr:", data.toString().trim());
    });

    this.process.on("error", (err) => {
      console.error("Audio capture process error:", err.message);
      this.process = null;
      this.setState("error");
      this.scheduleRetry(() => this.startMacOS());
    });

    this.process.on("exit", (code) => {
      this.process = null;
      if (this.running) {
        console.log(`Audio capture process exited (code ${code}), scheduling retry...`);
        this.setState("error");
        this.scheduleRetry(() => this.startMacOS());
      }
    });
  }

  /**
   * Start polling for audio device changes.
   * Detects when the default audio output device changes and restarts capture.
   */
  private startDevicePolling(): void {
    this.stopDevicePolling();

    // Get initial device name
    this.queryDefaultDevice().then((name) => {
      this.currentDeviceName = name;
    }).catch(() => {
      // Ignore initial query failure
    });

    this.devicePollTimer = setInterval(async () => {
      try {
        const deviceName = await this.queryDefaultDevice();
        if (this.currentDeviceName && deviceName !== this.currentDeviceName) {
          console.log(`Audio device changed: "${this.currentDeviceName}" -> "${deviceName}"`);
          this.currentDeviceName = deviceName;
          this.emit("deviceChange", deviceName);
          this.restartCapture();
        } else if (!this.currentDeviceName && deviceName) {
          this.currentDeviceName = deviceName;
        }
      } catch {
        // Device query failed — device may be disconnected
      }
    }, this.DEVICE_POLL_INTERVAL_MS);
  }

  private stopDevicePolling(): void {
    if (this.devicePollTimer) {
      clearInterval(this.devicePollTimer);
      this.devicePollTimer = null;
    }
  }

  /**
   * Query the default audio output device name.
   */
  private queryDefaultDevice(): Promise<string> {
    return new Promise((resolve, reject) => {
      let cmd: string;
      let args: string[];

      if (process.platform === "win32") {
        cmd = "powershell.exe";
        args = ["-Command", "(Get-CimInstance Win32_SoundDevice | Where-Object { $_.StatusInfo -eq 3 } | Select-Object -First 1).Name"];
      } else if (process.platform === "darwin") {
        cmd = "bash";
        args = ["-c", "system_profiler SPAudioDataType 2>/dev/null | grep 'Default Output Device: Yes' -B5 | head -1 | sed 's/^[ ]*//'"];
      } else {
        reject(new Error("Unsupported platform"));
        return;
      }

      const proc = spawn(cmd, args);
      let output = "";
      proc.stdout?.on("data", (data: Buffer) => {
        output += data.toString();
      });
      proc.on("error", () => reject(new Error("Failed to query device")));
      proc.on("exit", (code) => {
        if (code === 0 && output.trim()) {
          resolve(output.trim());
        } else {
          reject(new Error("Device query returned no result"));
        }
      });
    });
  }

  /**
   * Restart the audio capture process (e.g., after a device change).
   */
  private restartCapture(): void {
    if (this.process) {
      this.process.kill();
      this.process = null;
    }
    this.retryCount = 0;
    if (process.platform === "win32") {
      this.startWindows();
    } else if (process.platform === "darwin") {
      this.startMacOS();
    }
  }

  /**
   * Simulated audio source for development and testing.
   * Generates realistic-looking VU meter activity.
   */
  private startSimulated(): void {
    console.log("Using simulated audio source");
    let phase = 0;
    const baseFreqL = 0.7;
    const baseFreqR = 0.9;

    this.simTimer = setInterval(() => {
      phase += 0.05;

      // Generate a realistic-looking audio signal with multiple frequencies
      const beat = Math.pow(Math.sin(phase * 0.3), 2);
      const groove = Math.pow(Math.sin(phase * baseFreqL), 4) * 0.5;
      const hihat = Math.random() * 0.15 * beat;
      const bass = Math.pow(Math.sin(phase * 0.15), 8) * 0.6;

      const left = Math.min(1.0, (beat * 0.4 + groove + hihat + bass) * 0.7 + Math.random() * 0.05);
      const right = Math.min(1.0, (beat * 0.35 + Math.pow(Math.sin(phase * baseFreqR), 4) * 0.5 + hihat + bass * 0.9) * 0.7 + Math.random() * 0.05);

      this.processLevels(left, right);
    }, 33); // ~30fps to match UPDATE_INTERVAL_MS
  }

  /**
   * Core level processing with smoothing, peak hold, and adaptive sensitivity.
   * Uses time-based decay for frame-rate-independent behavior that matches
   * the original Python script's responsiveness.
   */
  private processLevels(rawLeft: number, rawRight: number): void {
    const now = Date.now();
    const deltaTime = this.lastProcessTime > 0
      ? Math.min((now - this.lastProcessTime) / 1000, 0.1) // cap at 100ms to avoid jumps
      : 1 / 30; // assume ~30fps on first frame
    this.lastProcessTime = now;

    // Update history for adaptive sensitivity (always track, even in manual mode)
    const maxRaw = Math.max(rawLeft, rawRight);
    this.history.push(maxRaw);
    if (this.history.length > HISTORY_LENGTH) {
      this.history.shift();
    }

    // Calculate sensitivity based on mode
    if (this.sensitivityMode === "auto") {
      const maxHistory = Math.max(...this.history, MIN_SENSITIVITY);
      this.sensitivity = 1.0 / maxHistory;
    } else {
      this.sensitivity = this.manualSensitivity;
    }

    // Normalize
    const normLeft = Math.min(1.0, rawLeft * this.sensitivity);
    const normRight = Math.min(1.0, rawRight * this.sensitivity);

    // Smooth display values: instant attack, time-based gradual fall
    const fallAmount = FALL_SPEED_PER_SEC * deltaTime;

    if (normLeft >= this.displayLeft) {
      this.displayLeft = normLeft * ATTACK_SPEED;
    } else {
      this.displayLeft = Math.max(0, this.displayLeft - fallAmount);
    }

    if (normRight >= this.displayRight) {
      this.displayRight = normRight * ATTACK_SPEED;
    } else {
      this.displayRight = Math.max(0, this.displayRight - fallAmount);
    }

    // Clamp
    this.displayLeft = Math.min(1.0, Math.max(0, this.displayLeft));
    this.displayRight = Math.min(1.0, Math.max(0, this.displayRight));

    // Peak hold with time-based decay
    const peakFallAmount = PEAK_FALL_SPEED_PER_SEC * deltaTime;

    if (this.displayLeft >= this.peakLeft) {
      this.peakLeft = this.displayLeft;
      this.peakLeftTime = now;
    } else if (now - this.peakLeftTime > PEAK_HOLD_TIME_MS) {
      this.peakLeft = Math.max(0, this.peakLeft - peakFallAmount);
    }

    if (this.displayRight >= this.peakRight) {
      this.peakRight = this.displayRight;
      this.peakRightTime = now;
    } else if (now - this.peakRightTime > PEAK_HOLD_TIME_MS) {
      this.peakRight = Math.max(0, this.peakRight - peakFallAmount);
    }

    const levels: AudioLevels = {
      left: this.displayLeft,
      right: this.displayRight,
      peakLeft: this.peakLeft,
      peakRight: this.peakRight,
      mono: (this.displayLeft + this.displayRight) / 2,
    };

    this.emit("levels", levels);
  }

  resetPeaks(): void {
    this.peakLeft = 0;
    this.peakRight = 0;
  }

  /**
   * Adjust sensitivity via encoder rotation.
   * Switches to manual mode and adjusts the manual sensitivity value.
   */
  adjustSensitivity(delta: number): void {
    this.sensitivityMode = "manual";
    this.manualSensitivity = Math.max(0.1, Math.min(10.0, this.manualSensitivity + delta));
    this.emit("sensitivityChange", this.sensitivityMode, this.manualSensitivity);
  }

  /**
   * Toggle between auto and manual sensitivity modes.
   * When switching to auto, resets history for fresh adaptation.
   */
  toggleSensitivityMode(): void {
    if (this.sensitivityMode === "auto") {
      this.sensitivityMode = "manual";
    } else {
      this.sensitivityMode = "auto";
      this.history = [];
    }
    this.emit("sensitivityChange", this.sensitivityMode, this.manualSensitivity);
  }

  getSensitivityMode(): SensitivityMode {
    return this.sensitivityMode;
  }

  getSensitivityValue(): number {
    return this.sensitivity;
  }

  isRunning(): boolean {
    return this.running;
  }
}
