using StardewModdingAPI;
using System;
using System.Collections.Concurrent;

namespace StardewLocalAPI.Core
{
    internal sealed class GameActionQueue
    {
        private readonly ConcurrentQueue<Action> _queue = new();

        public void Enqueue(Action action) => _queue.Enqueue(action);

        public void Drain(IMonitor monitor)
        {
            int max = 200;
            while (max-- > 0 && _queue.TryDequeue(out var action))
            {
                try { action(); }
                catch (Exception ex) { monitor.Log($"Queued action failed: {ex}", LogLevel.Error); }
            }
        }

        
        public void Clear()
        {
            while (_queue.TryDequeue(out _)) { }
        }
    }
}