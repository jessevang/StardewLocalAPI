using StardewModdingAPI;
using StardewValley;
using System;
using System.Collections.Generic;

namespace StardewLocalAPI.Core
{
    internal sealed class DialoguePlaybackService
    {
        private const string InlineDialogueKey = "Strings\\Characters:LocalAPIInline";

        private readonly Queue<(string Character, string Text)> _queue = new();

        private bool _running;

        public void Stop()
        {
            _queue.Clear();
            _running = false;

        }

        public void Enqueue(string character, string rawText)
        {
            if (string.IsNullOrWhiteSpace(character) || rawText is null)
                return;

            foreach (var part in SplitOnEndTokens(rawText))
                _queue.Enqueue((character, part));
        }

        private static IEnumerable<string> SplitOnEndTokens(string raw)
        {
            
            var parts = raw.Split(new[] { "#$e#" }, StringSplitOptions.None);

            foreach (var p in parts)
            {
                var s = (p ?? "").Trim();
                if (s.Length == 0)
                    continue;

                yield return s;
            }
        }


        public void EnqueueMany(IEnumerable<(string Character, string Text)> items)
        {
            if (items == null) return;

            foreach (var (ch, txt) in items)
                Enqueue(ch, txt);
        }

       

        public void Tick()
        {
            if (!Context.IsWorldReady)
                return;

            if (Game1.activeClickableMenu != null)
                return;


            if (_queue.Count == 0)
            {
                _running = false;
                return;
            }

            _running = true;
            PlayNextNow();
        }

        private void PlayNextNow()
        {
            if (_queue.Count == 0)
            {
                _running = false;
                return;
            }

            var (character, text) = _queue.Dequeue();

            try
            {
                var npc = Game1.getCharacterFromName(character, true);
                if (npc != null)
                {

                    var dlg = new Dialogue(npc, InlineDialogueKey, text);
                    npc.setNewDialogue(dlg);
                    Game1.drawDialogue(npc);
                }
                else
                {
                    Game1.drawObjectDialogue(text);
                }
            }
            catch
            {

            }
        }
    }
}