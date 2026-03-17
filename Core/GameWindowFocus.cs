using StardewModdingAPI;
using StardewValley;
using System;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;


namespace StardewLocalAPI.Core
{
    internal static class GameWindowFocus
    {
        private static readonly bool IsWindows = RuntimeInformation.IsOSPlatform(OSPlatform.Windows);

        private const int SW_RESTORE = 9;

        private static readonly IntPtr HWND_TOPMOST = new IntPtr(-1);
        private static readonly IntPtr HWND_NOTOPMOST = new IntPtr(-2);

        private const uint SWP_NOSIZE = 0x0001;
        private const uint SWP_NOMOVE = 0x0002;
        private const uint SWP_SHOWWINDOW = 0x0040;

        private delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

        [DllImport("user32.dll")] private static extern bool SetForegroundWindow(IntPtr hWnd);
        [DllImport("user32.dll")] private static extern bool ShowWindowAsync(IntPtr hWnd, int nCmdShow);
        [DllImport("user32.dll")] private static extern bool IsIconic(IntPtr hWnd);
        [DllImport("user32.dll")] private static extern IntPtr GetForegroundWindow();
        [DllImport("user32.dll")] private static extern bool BringWindowToTop(IntPtr hWnd);
        [DllImport("user32.dll")] private static extern IntPtr SetFocus(IntPtr hWnd);

        [DllImport("user32.dll")] private static extern bool IsWindow(IntPtr hWnd);
        [DllImport("user32.dll")] private static extern bool IsWindowVisible(IntPtr hWnd);

        [DllImport("user32.dll")] private static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);

        [DllImport("user32.dll", CharSet = CharSet.Unicode)]
        private static extern int GetWindowTextW(IntPtr hWnd, StringBuilder lpString, int nMaxCount);

        [DllImport("user32.dll", CharSet = CharSet.Unicode)]
        private static extern int GetClassNameW(IntPtr hWnd, StringBuilder lpString, int nMaxCount);

        [DllImport("user32.dll")]
        private static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);

        [DllImport("user32.dll", SetLastError = true)]
        private static extern bool SetWindowPos(IntPtr hWnd, IntPtr hWndInsertAfter, int X, int Y, int cx, int cy, uint uFlags);

        [DllImport("user32.dll")]
        private static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);

        [StructLayout(LayoutKind.Sequential)]
        private struct RECT
        {
            public int Left, Top, Right, Bottom;
            public int Width => Right - Left;
            public int Height => Bottom - Top;
        }



        public static bool FocusGameWindowSafe() => FocusGameWindowSafe(null, "focus");

        public static bool FocusGameWindowSafe(IMonitor? monitor, string tag = "focus")
        {
            if (!IsWindows)
            {
                monitor?.Log($"[{tag}] Focus skipped (non-Windows).", LogLevel.Trace);
                return false;
            }

            try
            {
                IntPtr hwnd = FindBestGameHwnd(monitor, tag);
                if (hwnd == IntPtr.Zero)
                {
                    monitor?.Log($"[{tag}] Focus FAILED: no valid HWND found for game window.", LogLevel.Trace);
                    DumpForeground(monitor, tag);
                    return false;
                }

             
                if (IsIconic(hwnd))
                    ShowWindowAsync(hwnd, SW_RESTORE);

            
                BringWindowToTop(hwnd);

                bool ok = SetForegroundWindow(hwnd);
                monitor?.Log($"[{tag}] SetForegroundWindow returned={ok}", LogLevel.Trace);

                if (!ok)
                {
 
                    SetWindowPos(hwnd, HWND_TOPMOST, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_SHOWWINDOW);
                    SetWindowPos(hwnd, HWND_NOTOPMOST, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_SHOWWINDOW);

                    ok = SetForegroundWindow(hwnd);
                    monitor?.Log($"[{tag}] SetForegroundWindow after TOPMOST toggle returned={ok}", LogLevel.Trace);
                }

    
                SetFocus(hwnd);
                DumpForeground(monitor, tag);
                return ok;
            }
            catch (Exception ex)
            {
                monitor?.Log($"[{tag}] Focus EXCEPTION: {ex}", LogLevel.Warn);
                return false;
            }
        }

        private static IntPtr FindBestGameHwnd(IMonitor? monitor, string tag)
        {
            uint pid = (uint)Process.GetCurrentProcess().Id;
            try
            {
                var win = Game1.game1?.Window;
                if (win != null)
                {
                    var prop = win.GetType().GetProperty("Handle");
                    if (prop != null && prop.PropertyType == typeof(IntPtr))
                    {
                        var candidate = (IntPtr)prop.GetValue(win);
                        if (candidate != IntPtr.Zero && IsWindow(candidate))
                        {
                            LogWindow(monitor, tag, "Using Game1.game1.Window.Handle (validated HWND)", candidate);
                            return candidate;
                        }


                        if (candidate != IntPtr.Zero && !IsWindow(candidate))
                            monitor?.Log($"[{tag}] Game1.game1.Window.Handle is NOT a Win32 HWND (IsWindow=false). Will enumerate windows instead.", LogLevel.Trace);
                    }
                }
            }
            catch { }
            IntPtr best = IntPtr.Zero;
            int bestScore = int.MinValue;

            EnumWindows((hWnd, _) =>
            {
                try
                {
                    GetWindowThreadProcessId(hWnd, out uint wp);
                    if (wp != pid) return true;

                    if (!IsWindow(hWnd)) return true;
                    bool vis = IsWindowVisible(hWnd);
                    if (!vis) return true;

                    GetWindowRect(hWnd, out var r);
                    if (r.Width < 200 || r.Height < 200) return true;

                    string title = GetTitle(hWnd);
                    string cls = GetClassName(hWnd);
                    int score = 0;
                    if (!string.IsNullOrWhiteSpace(title))
                    {
                        if (title.IndexOf("Stardew", StringComparison.OrdinalIgnoreCase) >= 0) score += 500;
                        if (title.IndexOf("Valley", StringComparison.OrdinalIgnoreCase) >= 0) score += 200;
                        if (title.IndexOf("SMAPI", StringComparison.OrdinalIgnoreCase) >= 0) score -= 200;
                        if (title.IndexOf("Console", StringComparison.OrdinalIgnoreCase) >= 0) score -= 200;
                    }
                    else
                    {

                        score += 50;
                    }


                    score += Math.Min(600, r.Width / 3);
                    score += Math.Min(600, r.Height / 3);

     
                    if (!string.IsNullOrWhiteSpace(cls))
                    {
                        if (cls.IndexOf("SDL", StringComparison.OrdinalIgnoreCase) >= 0) score += 150;
                        if (cls.IndexOf("MonoGame", StringComparison.OrdinalIgnoreCase) >= 0) score += 150;
                    }

                    if (score > bestScore)
                    {
                        bestScore = score;
                        best = hWnd;
                    }
                }
                catch { }

                return true;
            }, IntPtr.Zero);

            if (best != IntPtr.Zero)
                LogWindow(monitor, tag, $"Selected best EnumWindows candidate (score={bestScore})", best);

            return best;
        }

        private static void DumpForeground(IMonitor? monitor, string tag)
        {
            if (monitor == null) return;

            try

            {
                IntPtr fg = GetForegroundWindow();
                GetWindowThreadProcessId(fg, out uint pid);
                monitor.Log($"[{tag}] NOW foreground HWND=0x{fg.ToInt64():X} pid={pid} class='{GetClassName(fg)}' title='{GetTitle(fg)}'", LogLevel.Trace);
            }
            catch { }
        }

        private static void LogWindow(IMonitor? monitor, string tag, string msg, IntPtr hWnd)
        {
            if (monitor == null) return;

            try
            {
                GetWindowRect(hWnd, out var r);
                monitor.Log($"[{tag}] {msg}: HWND=0x{hWnd.ToInt64():X} class='{GetClassName(hWnd)}' title='{GetTitle(hWnd)}' rect={r.Left},{r.Top},{r.Right},{r.Bottom} size={r.Width}x{r.Height}", LogLevel.Trace);
            }
            catch
            {
                monitor.Log($"[{tag}] {msg}: HWND=0x{hWnd.ToInt64():X}", LogLevel.Trace);
            }
        }

        private static string GetTitle(IntPtr hWnd)
        {
            try
            {
                if (hWnd == IntPtr.Zero) return "";
                var sb = new StringBuilder(512);
                GetWindowTextW(hWnd, sb, sb.Capacity);
                return sb.ToString();
            }
            catch { return ""; }
        }

        private static string GetClassName(IntPtr hWnd)
        {
            try
            {
                if (hWnd == IntPtr.Zero) return "";
                var sb = new StringBuilder(256);
                GetClassNameW(hWnd, sb, sb.Capacity);
                return sb.ToString();
            }
            catch { return ""; }
        }
    }
}