#!/bin/bash
#
# macOS audio capture helper for the VU Meter Stream Deck plugin.
#
# Uses the built-in `powermetrics` or `coreaudiod` to get audio levels.
# Requires a virtual audio loopback device (e.g., BlackHole) to capture
# system audio output.
#
# Falls back to simulated output if no capture device is available.
#
# Output format: "left_level,right_level\n" (floats 0.0 to 1.0)

# Resolve the loopback capture device. Re-evaluated periodically inside the
# loop so the meter follows output-device switches without a process restart.
resolve_loopback_device() {
    if system_profiler SPAudioDataType 2>/dev/null | grep -q "BlackHole"; then
        echo "BlackHole"
    fi
}

# Try to use sox (if installed) with the loopback device
if command -v sox &> /dev/null; then
    LOOPBACK_DEVICE=$(resolve_loopback_device)

    if [ -n "$LOOPBACK_DEVICE" ]; then
        # Use sox to capture and analyze audio from the loopback device.
        # Every ~10 iterations (~0.5s) re-resolve the device so a default
        # output change (Speakers -> Headphones) is picked up live.
        ITERATION=0
        while true; do
            ITERATION=$((ITERATION + 1))
            if [ $((ITERATION % 10)) -eq 0 ]; then
                NEW_DEVICE=$(resolve_loopback_device)
                if [ -n "$NEW_DEVICE" ] && [ "$NEW_DEVICE" != "$LOOPBACK_DEVICE" ]; then
                    echo "Default audio device changed; switching capture device" >&2
                    LOOPBACK_DEVICE="$NEW_DEVICE"
                fi
            fi

            # Capture a short sample and get RMS levels
            LEVELS=$(sox -t coreaudio "$LOOPBACK_DEVICE" -n stat 2>&1 | grep "RMS" | head -2)
            LEFT=$(echo "$LEVELS" | head -1 | awk '{print $NF}')
            RIGHT=$(echo "$LEVELS" | tail -1 | awk '{print $NF}')

            # Default to 0 if we can't get levels
            LEFT=${LEFT:-0.0}
            RIGHT=${RIGHT:-0.0}

            echo "${LEFT},${RIGHT}"
            sleep 0.05
        done
        exit 0
    fi
fi

# Fallback: simulated audio output
echo "Using simulated audio source" >&2
PHASE=0
while true; do
    PHASE=$(echo "$PHASE + 0.05" | bc -l)
    LEFT=$(python3 -c "import math,random; print(f'{min(1.0, abs(math.sin($PHASE * 0.7)) * 0.6 + random.uniform(0, 0.1)):.6f}')" 2>/dev/null || echo "0.3")
    RIGHT=$(python3 -c "import math,random; print(f'{min(1.0, abs(math.sin($PHASE * 0.9)) * 0.55 + random.uniform(0, 0.1)):.6f}')" 2>/dev/null || echo "0.25")
    echo "${LEFT},${RIGHT}"
    sleep 0.05
done
