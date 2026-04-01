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

# Try to use sox (if installed) with the loopback device
if command -v sox &> /dev/null; then
    # Attempt to find a loopback device
    LOOPBACK_DEVICE=""

    # Check for BlackHole
    if system_profiler SPAudioDataType 2>/dev/null | grep -q "BlackHole"; then
        LOOPBACK_DEVICE="BlackHole"
    fi

    if [ -n "$LOOPBACK_DEVICE" ]; then
        # Use sox to capture and analyze audio from the loopback device
        while true; do
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
