[CmdletBinding()]
param([Parameter(Mandatory)][int]$ProcessId)
$ErrorActionPreference='Stop'
$projectRoot=Split-Path $PSScriptRoot -Parent
$process=Get-Process -Id $ProcessId
if(-not $process.Path.StartsWith((Join-Path $projectRoot '.artifacts'),[StringComparison]::OrdinalIgnoreCase)){throw 'Only this project native process may be inspected.'}
if(-not ('AgentOfficeWindowInspection' -as [type])){
Add-Type @'
using System;
using System.Runtime.InteropServices;
using System.Text;
public static class AgentOfficeWindowInspection {
  public delegate bool Callback(IntPtr hwnd,IntPtr parameter);
  [StructLayout(LayoutKind.Sequential)] public struct Rect { public int Left,Top,Right,Bottom; }
  [DllImport("user32.dll")] public static extern bool EnumThreadWindows(uint threadId,Callback callback,IntPtr parameter);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hwnd);
  [DllImport("user32.dll",CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr hwnd,StringBuilder text,int maximum);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hwnd,out Rect rect);
}
'@
}
$rows=[Collections.Generic.List[object]]::new()
$callback=[AgentOfficeWindowInspection+Callback]{param($handle,$parameter)
  if([AgentOfficeWindowInspection]::IsWindowVisible($handle)){
    $text=[Text.StringBuilder]::new(256)
    [void][AgentOfficeWindowInspection]::GetWindowText($handle,$text,256)
    $rect=[AgentOfficeWindowInspection+Rect]::new()
    [void][AgentOfficeWindowInspection]::GetWindowRect($handle,[ref]$rect)
    $rows.Add([pscustomobject]@{Handle=$handle.ToInt64();Title=$text.ToString();X=$rect.Left;Y=$rect.Top;Width=$rect.Right-$rect.Left;Height=$rect.Bottom-$rect.Top})
  }
  return $true
}
foreach($thread in $process.Threads){[void][AgentOfficeWindowInspection]::EnumThreadWindows([uint32]$thread.Id,$callback,[IntPtr]::Zero)}
$rows | Sort-Object Handle -Unique
