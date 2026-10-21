/*
 * Vackle, a modification for Flackle's desktop app
 * Copyright (c) 2026 Xrm0s and contributors
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */


import { spawn, type ChildProcess } from "node:child_process";

const script = String.raw`
Add-Type -AssemblyName System.Windows.Forms
Add-Type @'
using System;using System.Text;using System.Runtime.InteropServices;
public class Pip{
[DllImport("user32.dll")]static extern IntPtr FindWindowEx(IntPtr p,IntPtr a,string c,string t);
[DllImport("user32.dll")]static extern bool GetWindowRect(IntPtr h,out RECT r);
[DllImport("user32.dll")]static extern uint GetWindowThreadProcessId(IntPtr h,out uint p);
[DllImport("user32.dll")]static extern bool ShowWindow(IntPtr h,int n);
[DllImport("user32.dll")]static extern bool SetWindowPos(IntPtr h,IntPtr a,int x,int y,int w,int ht,uint f);
public struct RECT{public int L,T,R,B;}
public static IntPtr Hidden(out uint pid){pid=0;IntPtr h=IntPtr.Zero;while((h=FindWindowEx(IntPtr.Zero,h,"Chrome_WidgetWin_1","Picture in picture"))!=IntPtr.Zero){RECT r;GetWindowRect(h,out r);if(r.L<=-30000){GetWindowThreadProcessId(h,out pid);return h;}}return IntPtr.Zero;}
public static void Place(IntPtr h,int right,int bottom){RECT r;GetWindowRect(h,out r);ShowWindow(h,9);SetWindowPos(h,new IntPtr(-1),right-(r.R-r.L)-24,bottom-(r.B-r.T)-24,0,0,0x41);}
}
'@
while($true){
  $pid2=[uint32]0
  $h=[Pip]::Hidden([ref]$pid2)
  if($h -ne [IntPtr]::Zero){
    $line=(Get-CimInstance Win32_Process -Filter "ProcessId=$pid2").CommandLine
    if($line -match 'com\.flackle'){
      $main=(Get-Process flackle-desktop -ErrorAction SilentlyContinue | Select-Object -First 1).MainWindowHandle
      $area=if($main){[System.Windows.Forms.Screen]::FromHandle($main).WorkingArea}else{[System.Windows.Forms.Screen]::PrimaryScreen.WorkingArea}
      [Pip]::Place($h,$area.Right,$area.Bottom)
    }
  }
  Start-Sleep -Milliseconds 400
}`;

export function watchPictureInPicture(): ChildProcess {
    const encoded = Buffer.from(script, "utf16le").toString("base64");
    const watcher = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-EncodedCommand", encoded], { windowsHide: true, stdio: "ignore" });
    watcher.on("error", () => undefined);
    return watcher;
}
