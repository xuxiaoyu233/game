param(
    [Parameter(Mandatory = $true)]
    [ValidateRange(1, [int]::MaxValue)]
    [int]$ProcessId,
    [ValidateSet('any', 'visible', 'hidden', 'exited')]
    [string]$Expect = 'any'
)

# Read-only host checks. Run after an operator clicks pin, native close, or the
# real tray menu. This script sends no window messages and changes no styles.
$ErrorActionPreference = 'Stop'
$gameProcess = Get-Process -Id $ProcessId -ErrorAction SilentlyContinue
if ($null -eq $gameProcess) {
    if ($Expect -notin @('any', 'exited')) { throw 'The game process has exited.' }
    [pscustomobject]@{ processId = $ProcessId; alive = $false; windows = @() } | ConvertTo-Json
    exit 0
}
$expectedTitle = switch -Regex ($gameProcess.ProcessName) {
    '^(idle-forge-desktop|IdleForge(-v\d+\.\d+\.\d+)?)$' { 'Idle Forge'; break }
    '^(zhujie-rescue-bureau-desktop|ZhuJieRescueBureau(-v\d+\.\d+\.\d+)?)$' { '技能放置原型'; break }
    default { throw 'The requested process is not a supported game executable.' }
}
if ($Expect -eq 'exited') { throw 'The game process is still running.' }

if ($null -eq ('NativeWindowState' -as [type])) {
    Add-Type -TypeDefinition @'
using System;
using System.Text;
using System.Collections.Generic;
using System.Runtime.InteropServices;

public class NativeWindowInfo {
    public string Handle { get; set; }
    public string Title { get; set; }
    public bool Visible { get; set; }
    public bool Topmost { get; set; }
}
public static class NativeWindowState {
    private delegate bool WindowCallback(IntPtr window, IntPtr parameter);
    [DllImport("user32.dll")]
    private static extern bool EnumWindows(WindowCallback callback, IntPtr parameter);
    [DllImport("user32.dll")]
    private static extern uint GetWindowThreadProcessId(IntPtr window, out uint process);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    private static extern int GetWindowText(IntPtr window, StringBuilder title, int length);
    [DllImport("user32.dll", EntryPoint = "GetWindowLongPtrW")]
    private static extern IntPtr GetWindowLongPtr(IntPtr window, int index);
    [DllImport("user32.dll")]
    private static extern bool IsWindowVisible(IntPtr window);

    public static NativeWindowInfo[] Read(uint processId, string expectedTitle) {
        var windows = new List<NativeWindowInfo>();
        EnumWindows((window, parameter) => {
            uint owner;
            GetWindowThreadProcessId(window, out owner);
            if (owner != processId) return true;
            var title = new StringBuilder(512);
            GetWindowText(window, title, title.Capacity);
            if (!title.ToString().StartsWith(expectedTitle, StringComparison.Ordinal)) return true;
            windows.Add(new NativeWindowInfo {
                Handle = "0x" + window.ToInt64().ToString("x"),
                Title = title.ToString(),
                Visible = IsWindowVisible(window),
                Topmost = (GetWindowLongPtr(window, -20).ToInt64() & 0x8) != 0
            });
            return true;
        }, IntPtr.Zero);
        return windows.ToArray();
    }
}
'@
}

$windows = @([NativeWindowState]::Read([uint32]$ProcessId, [string]$expectedTitle))
if ($windows.Count -eq 0) { throw 'The native game window was not found.' }
if ($Expect -eq 'visible' -and -not ($windows | Where-Object Visible)) {
    throw 'The native window is hidden.'
}
if ($Expect -eq 'hidden' -and ($windows | Where-Object Visible)) {
    throw 'The native window is still visible.'
}
[pscustomobject]@{ processId = $ProcessId; alive = $true; windows = $windows } |
    ConvertTo-Json -Depth 4
