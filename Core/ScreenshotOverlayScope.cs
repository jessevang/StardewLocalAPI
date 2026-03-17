using System;
using System.Threading;

namespace StardewLocalAPI.Core
{

    internal static class ScreenshotOverlayScope
    {
        private static readonly AsyncLocal<int> _depth = new();

        public static bool Enabled => _depth.Value > 0;

        public static IDisposable Enable()
        {
            _depth.Value = _depth.Value + 1;
            return new Popper();
        }

        private sealed class Popper : IDisposable
        {
            private bool _disposed;
            public void Dispose()
            {
                if (_disposed) return;
                _disposed = true;
                _depth.Value = Math.Max(0, _depth.Value - 1);
            }
        }
    }
}