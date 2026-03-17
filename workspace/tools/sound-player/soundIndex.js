function norm(s) {
    return String(s ?? "");
}
function pick(obj, a, b) {
    return obj?.[a] ?? obj?.[b];
}

function normCue(r) {
    const id = norm(pick(r, "id", "Id")).trim();
    if (!id) return null;

    return {
        id,
        kind: norm(pick(r, "kind", "Kind")).trim() || "Unknown",
        categoryName: norm(pick(r, "categoryName", "CategoryName")).trim(),
        categoryIndex: pick(r, "categoryIndex", "CategoryIndex") ?? null,
        looped: pick(r, "looped", "Looped") ?? null,
        useReverb: pick(r, "useReverb", "UseReverb") ?? null,
        fromAudioChanges: !!pick(r, "fromAudioChanges", "FromAudioChanges"),
        audioChangesCategory: norm(pick(r, "audioChangesCategory", "AudioChangesCategory")).trim(),
        audioChangesLooped: pick(r, "audioChangesLooped", "AudioChangesLooped") ?? null,
    };
}

export function buildSoundIndex(apiJson) {
    const raw = Array.isArray(apiJson?.cues) ? apiJson.cues : [];
    const cues = raw.map(normCue).filter(Boolean);

    const byId = {};
    for (const c of cues) byId[c.id] = c;

    const ids = cues.map(c => c.id).sort((a, b) => a.localeCompare(b));
    return { cues, byId, ids };
}