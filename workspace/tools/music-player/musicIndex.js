function norm(s) {
    return String(s ?? "");
}

function pick(obj, a, b) {

    return obj?.[a] ?? obj?.[b];
}

function normEventRef(r) {
    return {
        location: norm(pick(r, "location", "Location")).trim(),
        eventKey: norm(pick(r, "eventKey", "EventKey")),
        preconditionsRaw: norm(pick(r, "preconditionsRaw", "PreconditionsRaw")),
        isHeartEvent: !!pick(r, "isHeartEvent", "IsHeartEvent"),
        heartLevel: pick(r, "heartLevel", "HeartLevel") ?? null,
    };
}

function normLocationRef(r) {
    return {
        location: norm(pick(r, "location", "Location")).trim(),
        context: norm(pick(r, "context", "Context")),
        note: norm(pick(r, "note", "Note")),
    };
}

function normLocationRow(r) {
    return {
        location: norm(pick(r, "location", "Location")).trim(),
        context: norm(pick(r, "context", "Context")),
        musicId: norm(pick(r, "musicId", "MusicId")).trim(),
        note: norm(pick(r, "note", "Note")),
    };
}

export function buildMusicIndex(apiJson) {
    const rawMusic = Array.isArray(apiJson?.music) ? apiJson.music : [];
    const rawEvents = Array.isArray(apiJson?.events) ? apiJson.events : [];
    const rawLocations = Array.isArray(apiJson?.locations) ? apiJson.locations : [];
    const music = rawMusic
        .map((m) => {
            const id = norm(pick(m, "id", "Id")).trim();
            if (!id) return null;

            const usedInEventsRaw = Array.isArray(pick(m, "usedInEvents", "UsedInEvents"))
                ? pick(m, "usedInEvents", "UsedInEvents")
                : [];

            const usedInLocationsRaw = Array.isArray(pick(m, "usedInLocations", "UsedInLocations"))
                ? pick(m, "usedInLocations", "UsedInLocations")
                : [];

            const usedInEvents = usedInEventsRaw.map(normEventRef);
            const usedInLocations = usedInLocationsRaw.map(normLocationRef);

            return {
                id,
                isPlayingNow: !!pick(m, "isPlayingNow", "IsPlayingNow"),
                usedInEventsCount: pick(m, "usedInEventsCount", "UsedInEventsCount") ?? usedInEvents.length,
                usedInLocationsCount: pick(m, "usedInLocationsCount", "UsedInLocationsCount") ?? usedInLocations.length,
                usedInEvents,
                usedInLocations,
            };
        })
        .filter(Boolean);
    const byMusicId = {};
    for (const m of music) {
        (byMusicId[m.id] ||= []).push(m);
    }
    const events = [];
    const byEventLocation = {};
    for (const ev of rawEvents) {
        const loc = norm(ev?.Location).trim() || "Unknown";
        const row = {
            location: loc,
            eventKey: norm(ev?.EventKey),
            preconditionsRaw: norm(ev?.PreconditionsRaw),
            isHeartEvent: !!ev?.IsHeartEvent,
            heartLevel: ev?.HeartLevel ?? null,
            musicCues: Array.isArray(ev?.MusicCues) ? ev.MusicCues.map(norm) : [],
        };
        events.push(row);
        (byEventLocation[loc] ||= []).push(row);
    }
    for (const loc of Object.keys(byEventLocation)) {
        byEventLocation[loc].sort((a, b) => (a.eventKey || "").localeCompare(b.eventKey || ""));
    }
    const locations = [];
    const byLocation = {};
    for (const lr of rawLocations) {
        const row = normLocationRow(lr);
        if (!row.location) row.location = "Unknown";


        if (!row.musicId) continue;

        locations.push(row);
        (byLocation[row.location] ||= []).push(row);
    }
    for (const loc of Object.keys(byLocation)) {
        byLocation[loc].sort(
            (a, b) =>
                (a.context || "").localeCompare(b.context || "") ||
                (a.musicId || "").localeCompare(b.musicId || "")
        );
    }

    return { music, events, locations, byMusicId, byEventLocation, byLocation };
}