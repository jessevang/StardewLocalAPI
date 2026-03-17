function normalizeText(s) {
    return String(s ?? "");
}

export function buildDialogueIndex(dialoguesByCharacter) {
    const dialogues = [];
    const byCharacter = {};

    for (const [name, list] of Object.entries(dialoguesByCharacter || {})) {
        for (const d of list || []) {
            const entry = {
                character: d.Character || name,
                source: d.Source || "",
                key: d.Key || "",
                text: normalizeText(d.Text),
            };
            dialogues.push(entry);
            (byCharacter[entry.character] ||= []).push(entry);
        }
    }

    for (const k of Object.keys(byCharacter)) {
        byCharacter[k].sort(
            (a, b) =>
                (a.source || "").localeCompare(b.source || "") ||
                (a.key || "").localeCompare(b.key || "")
        );
    }

    return { dialogues, byCharacter };
}