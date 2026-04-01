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

import { ChildProcess, spawn } from "child_process";
import { EventEmitter } from "events";
import * as path from "path";
import * as fs from "fs";
import {
  SAMPLE_RATE,
  FRAME_SIZE,
  HISTORY_LENGTH,
  MIN_SENSITIVITY,
  FALL_SPEED,
  ATTACK_SPEED,
  PEAK_HOLD_TIME_MS,
  PEAK_FALL_SPEED,
} from "../utils/constants";

export interface AudioLevels {
  left: number;    // 0.0 - 1.0 normalized level
  right: number;   // 0.0 - 1.0 normalized level
  peakLeft: number;
  peakRight: number;
  mono: number;    // combined mono level
}

export class AudioCapture extends EventEmitter {
  private process: ChildProcess | null = null;
  private running = false;
  private sensitivity = 1.0;

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

  start(): void {
    if (this.running) return;
    this.running = true;

    if (process.platform === "win32") {
      this.startWindows();
    } else if (process.platform === "darwin") {
      this.startMacOS();
    } else {
      this.startSimulated();
    }
  }

  stop(): void {
    this.running = false;
    if (this.process) {
      this.process.kill();
      this.process = null;
    }
    if (this.simTimer) {
      clearInterval(this.simTimer);
      this.simTimer = null;
    }
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

    this.process = spawn("powershell.exe", [
      "-ExecutionPolicy", "Bypass",
      "-File", helperPath,
      "-SampleRate", String(SAMPLE_RATE),
      "-FrameSize", String(FRAME_SIZE),
    ]);

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

    this.process.on("exit", () => {
      if (this.running) {
        console.log("Audio capture process exited, restarting...");
        setTimeout(() => this.startWindows(), 1000);
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

    this.process = spawn("bash", [helperPath]);

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

    this.process.on("exit", () => {
      if (this.running) {
        setTimeout(() => this.startMacOS(), 1000);
      }
    });
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
    }, 50);
  }

  /**
   * Core level processing with smoothing, peak hold, and adaptive sensitivity.
   * Mirrors the behavior of the original Python implementation.
   */
  private processLevels(rawLeft: number, rawRight: number): void {
    // Update history for adaptive sensitivity
    const maxRaw = Math.max(rawLeft, rawRight);
    this.history.push(maxRaw);
    if (this.history.length > HISTORY_LENGTH) {
      this.history.shift();
    }

    // Calculate adaptive sensitivity
    const maxHistory = Math.max(...this.history, MIN_SENSITIVITY);
    this.sensitivity = 1.0 / maxHistory;

    // Normalize
    const normLeft = Math.min(1.0, rawLeft * this.sensitivity);
    const normRight = Math.min(1.0, rawRight * this.sensitivity);

    // Smooth display values: instant attack, gradual fall
    if (normLeft >= this.displayLeft) {
      this.displayLeft = normLeft * ATTACK_SPEED;
    } else {
      this.displayLeft = Math.max(0, this.displayLeft - FALL_SPEED * (1.0 / 20));
    }

    if (normRight >= this.displayRight) {
      this.displayRight = normRight * ATTACK_SPEED;
    } else {
      this.displayRight = Math.max(0, this.displayRight - FALL_SPEED * (1.0 / 20));
    }

    // Clamp
    this.displayLeft = Math.min(1.0, Math.max(0, this.displayLeft));
    this.displayRight = Math.min(1.0, Math.max(0, this.displayRight));

    // Peak hold
    const now = Date.now();
    if (this.displayLeft >= this.peakLeft) {
      this.peakLeft = this.displayLeft;
      this.peakLeftTime = now;
    } else if (now - this.peakLeftTime > PEAK_HOLD_TIME_MS) {
      this.peakLeft = Math.max(0, this.peakLeft - PEAK_FALL_SPEED * (1.0 / 20));
    }

    if (this.displayRight >= this.peakRight) {
      this.peakRight = this.displayRight;
      this.peakRightTime = now;
    } else if (now - this.peakRightTime > PEAK_HOLD_TIME_MS) {
      this.peakRight = Math.max(0, this.peakRight - PEAK_FALL_SPEED * (1.0 / 20));
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

  adjustSensitivity(delta: number): void {
    // Manual sensitivity override — clear history to let it readapt
    this.history = [];
  }

  isRunning(): boolean {
    return this.running;
  }
}
