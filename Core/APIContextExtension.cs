using StardewModdingAPI;
using System;
using System.Threading;

namespace StardewLocalAPI.Core
{
    internal static class ApiContextExtensions
    {

        public static void Json(this ApiContext ctx, int status, object payload)
        {
            if (ctx is null) throw new ArgumentNullException(nameof(ctx));
            JsonUtil.WriteJson(ctx.Http, status, payload);
        }

        public static T RunOnGameThread<T>(this ApiContext ctx, GameActionQueue actions, Func<T> func, int timeoutMs = 2000)
        {
            if (ctx is null) throw new ArgumentNullException(nameof(ctx));
            if (actions is null) throw new ArgumentNullException(nameof(actions));
            if (func is null) throw new ArgumentNullException(nameof(func));

            var gate = new ManualResetEventSlim(false);
            Exception? error = null;
            T result = default!;

            actions.Enqueue(() =>
            {
                try
                {
                    result = func();
                }
                catch (Exception ex)
                {
                    error = ex;
                }
                finally
                {
                    gate.Set();
                }
            });

            if (!gate.Wait(timeoutMs))
                throw new TimeoutException($"Timed out waiting for game thread work after {timeoutMs}ms.");

            if (error != null)
                throw new InvalidOperationException("Game thread work failed.", error);

            return result;
        }

        public static void RunOnGameThread(this ApiContext ctx, GameActionQueue actions, Action action, int timeoutMs = 2000)
        {
            if (action is null) throw new ArgumentNullException(nameof(action));
            ctx.RunOnGameThread(actions, () =>
            {
                action();
                return true;
            }, timeoutMs);
        }
    }
}