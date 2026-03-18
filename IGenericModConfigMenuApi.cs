// IGenericModConfigMenuAPI.cs fromspacechase0
// https://github.com/spacechase0/StardewValleyMods/blob/develop/framework/GenericModConfigMenu/IGenericModConfigMenuApi.cs

using System;
using StardewModdingAPI;
using StardewModdingAPI.Utilities;

namespace GenericModConfigMenu
{
    public interface IGenericModConfigMenuApi
    {
        void Register(
            IManifest mod,
            Action reset,
            Action save,
            bool titleScreenOnly = false
        );

        void AddKeybindList(
            IManifest mod,
            Func<KeybindList> getValue,
            Action<KeybindList> setValue,
            Func<string> name,
            Func<string>? tooltip = null,
            string? fieldId = null
        );
    }
}