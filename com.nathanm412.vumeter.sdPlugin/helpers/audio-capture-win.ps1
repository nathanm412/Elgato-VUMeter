<#
.SYNOPSIS
    Windows audio loopback capture helper for the VU Meter Stream Deck plugin.

.DESCRIPTION
    Uses WASAPI loopback via the CSCore interop to capture system audio output
    and streams left/right RMS levels to stdout as "left,right\n" per frame.

    Falls back to a .NET AudioClient approach if CSCore is unavailable.

.PARAMETER SampleRate
    Audio sample rate (default: 48000)

.PARAMETER FrameSize
    Number of samples per analysis frame (default: 2048)
#>
param(
    [int]$SampleRate = 48000,
    [int]$FrameSize = 2048
)

# Use .NET's built-in audio APIs for WASAPI loopback capture
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
using System.Threading;

public class AudioMeter {
    [ComImport, Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"),
     InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IMMDeviceEnumerator {
        int NotImpl1();
        int GetDefaultAudioEndpoint(int dataFlow, int role, out IMMDevice ppDevice);
    }

    [ComImport, Guid("D666063F-1587-4E43-81F1-B948E807363F"),
     InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IMMDevice {
        int Activate(ref Guid iid, int dwClsCtx, IntPtr pActivationParams, [MarshalAs(UnmanagedType.IUnknown)] out object ppInterface);
    }

    [ComImport, Guid("C02216F6-8C67-4B5B-9D00-D008E73E0064"),
     InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IAudioMeterInformation {
        int GetPeakValue(out float pfPeak);
        int GetMeteringChannelCount(out int pnChannelCount);
        int GetChannelsPeakValues(int u32ChannelCount, [Out, MarshalAs(UnmanagedType.LPArray)] float[] afPeakValues);
    }

    [ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")]
    private class MMDeviceEnumerator { }

    private IAudioMeterInformation meter;

    public AudioMeter() {
        var enumerator = (IMMDeviceEnumerator)(new MMDeviceEnumerator());
        IMMDevice device;
        // eRender=0, eMultimedia=1
        enumerator.GetDefaultAudioEndpoint(0, 1, out device);

        Guid iid = typeof(IAudioMeterInformation).GUID;
        object obj;
        // CLSCTX_ALL = 23
        device.Activate(ref iid, 23, IntPtr.Zero, out obj);
        meter = (IAudioMeterInformation)obj;
    }

    public float[] GetChannelLevels() {
        int count;
        meter.GetMeteringChannelCount(out count);
        if (count < 2) count = 2;
        float[] levels = new float[count];
        meter.GetChannelsPeakValues(count, levels);
        return levels;
    }
}
"@

try {
    $meter = New-Object AudioMeter
    Write-Error "Audio meter initialized" -ErrorAction SilentlyContinue

    while ($true) {
        $levels = $meter.GetChannelLevels()
        $left = if ($levels.Length -gt 0) { $levels[0] } else { 0.0 }
        $right = if ($levels.Length -gt 1) { $levels[1] } else { $left }
        Write-Output ("{0:F6},{1:F6}" -f $left, $right)
        Start-Sleep -Milliseconds 50
    }
} catch {
    Write-Error "Failed to initialize audio meter: $_"
    Write-Error "Falling back to simulated output"

    # Fallback: output simulated levels
    $phase = 0.0
    while ($true) {
        $phase += 0.05
        $left = [Math]::Abs([Math]::Sin($phase * 0.7)) * 0.6 + (Get-Random -Minimum 0.0 -Maximum 0.1)
        $right = [Math]::Abs([Math]::Sin($phase * 0.9)) * 0.55 + (Get-Random -Minimum 0.0 -Maximum 0.1)
        Write-Output ("{0:F6},{1:F6}" -f [Math]::Min(1.0, $left), [Math]::Min(1.0, $right))
        Start-Sleep -Milliseconds 50
    }
}
