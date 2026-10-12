param([int]$X, [int]$Y, [ValidateSet('none','down','up')][string]$Button='none', [switch]$Read)
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public class UsagiTestPointer {
  [StructLayout(LayoutKind.Sequential)] public struct POINT { public int X; public int Y; }
  [DllImport("user32.dll")] public static extern bool GetCursorPos(out POINT point);
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern IntPtr SetThreadDpiAwarenessContext(IntPtr context);
  [DllImport("user32.dll")] public static extern short GetAsyncKeyState(int key);
  [DllImport("user32.dll")] public static extern void mouse_event(uint flags, uint dx, uint dy, uint data, UIntPtr extra);
}
'@
[UsagiTestPointer]::SetThreadDpiAwarenessContext([IntPtr](-4)) | Out-Null
if ($Read) {
  $point = New-Object UsagiTestPointer+POINT
  [UsagiTestPointer]::GetCursorPos([ref]$point) | Out-Null
  @{x=$point.X;y=$point.Y;leftButtonDown=([UsagiTestPointer]::GetAsyncKeyState(1) -lt 0)} | ConvertTo-Json -Compress
} else {
  [UsagiTestPointer]::SetCursorPos($X,$Y) | Out-Null
  if ($Button -eq 'down') { [UsagiTestPointer]::mouse_event(2,0,0,0,[UIntPtr]::Zero) }
  if ($Button -eq 'up') { [UsagiTestPointer]::mouse_event(4,0,0,0,[UIntPtr]::Zero) }
}
