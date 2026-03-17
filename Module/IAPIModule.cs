using StardewLocalAPI.Core;

namespace StardewLocalAPI.Modules
{
    internal interface IApiModule
    {
        void Register(ApiRouter router);
    }
}